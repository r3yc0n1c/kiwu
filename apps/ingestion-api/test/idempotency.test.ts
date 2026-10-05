import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { build } from "../src/app";

// In-memory repo stub mirroring the real functions' semantics (unique PK on userId+key => 23505).
const rows = new Map<string, any>();
const items: any[] = [];
const USER = "11111111-1111-1111-1111-111111111111";

const repo = {
  isUniqueViolation: (e: any) => e?.code === "23505",
  getIdempotencyKey: async (userId: string, key: string) => rows.get(`${userId}:${key}`) ?? null,
  createIngestionItem: async (opts: any) => {
    const { userId, source, rawType, payload, key, requestHash } = opts;
    if (key && rows.has(`${userId}:${key}`)) {
      const e: any = new Error("duplicate key");
      e.code = "23505";
      throw e;
    }
    const item = { id: crypto.randomUUID(), userId, source, rawType, payload, status: "pending" };
    items.push(item);
    if (key) {
      rows.set(`${userId}:${key}`, {
        userId,
        key,
        requestHash,
        itemId: item.id,
        statusCode: 202,
        completed: true,
      });
    }
    return { id: item.id };
  },
};

const app = build({ logger: false, repo: repo as any });
(app as any).redis = { xadd: async () => "1-0" };

before(() => {});
after(() => app.close());

const post = (body: object, headers: object = {}) =>
  app.inject({ method: "POST", url: "/ingest", payload: body as any, headers: headers as any });

test("first keyed ingest returns 202 and records the key", async () => {
  const res = await post({
    user_id: USER,
    raw_type: "text",
    payload: "note one",
    idempotency_key: "key-1",
  });
  assert.equal(res.statusCode, 202);
  const rec = await repo.getIdempotencyKey(USER, "key-1");
  assert.equal(rec!.completed, true);
  assert.ok(rec!.itemId);
});

test("same key + same body returns 200 duplicate with same item id, one item only", async () => {
  const body = { user_id: USER, raw_type: "text", payload: "note one", idempotency_key: "key-1" };
  const first = await post(body);
  const second = await post(body);
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.json(), { id: first.json().id, status: "duplicate" });
  assert.equal(items.length, 1);
});

test("same key + different body returns 422", async () => {
  const res = await post({
    user_id: USER,
    raw_type: "text",
    payload: "DIFFERENT",
    idempotency_key: "key-1",
  });
  assert.equal(res.statusCode, 422);
});

test("in-flight key returns 409", async () => {
  const body = {
    user_id: USER,
    raw_type: "text",
    payload: "inflight",
    idempotency_key: "key-inflight",
  };
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...body, source: "web" }))
    .digest("hex");
  rows.set(`${USER}:key-inflight`, {
    userId: USER,
    key: "key-inflight",
    requestHash: hash,
    itemId: null,
    statusCode: null,
    completed: false,
  });

  const res = await post(body);
  assert.equal(res.statusCode, 409);
});

test("email Message-ID header dedupes repeats", async () => {
  const headers = { "message-id": "<msg-1@example.com>" };
  const body = { user_id: USER, source: "email", raw_type: "text", payload: "forwarded" };
  const first = await post(body, headers);
  const second = await post(body, headers);
  assert.equal(first.statusCode, 202);
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().status, "duplicate");
});

test("request without a key is not deduped", async () => {
  const body = { user_id: USER, raw_type: "text", payload: "no key" };
  const a = await post(body);
  const b = await post(body);
  assert.equal(a.statusCode, 202);
  assert.equal(b.statusCode, 202);
  assert.notEqual(a.json().id, b.json().id);
});
