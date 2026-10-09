import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/app";

const USER = "11111111-1111-1111-1111-111111111111";

// stubs: repo records what it got; storage "sees" objects by key pattern
const captured: any[] = [];
let xaddFails = false;
const idemRows = new Map<string, any>();
const repo = {
  isUniqueViolation: (e: any) => e?.code === "23505",
  isObjectKeyViolation: (e: any) =>
    e?.code === "23505" && String(e?.message).includes("object_key"),
  getIdempotencyKey: async (userId: string, key: string) =>
    idemRows.get(`${userId}:${key}`) ?? null,
  createIngestionItem: async (opts: any) => {
    if (throwObjectKeyViolation) {
      const e: any = new Error(
        'duplicate key value violates unique constraint "item_attachments_object_key_unique"',
      );
      e.code = "23505";
      throw e;
    }
    const item = { id: crypto.randomUUID() };
    captured.push(opts);
    if (opts.key) {
      idemRows.set(`${opts.userId}:${opts.key}`, {
        userId: opts.userId,
        key: opts.key,
        requestHash: opts.requestHash,
        itemId: item.id,
        statusCode: 202,
        completed: true,
      });
    }
    return item;
  },
};
let throwObjectKeyViolation = false;
const removed: string[] = [];
const storage = {
  uploadRaw: async () => "",
  getRawUrl: async () => "",
  createPresignedPut: async (key: string) => `http://minio:9000/kiwu-raw/${key}`,
  headRaw: async (key: string) => {
    if (key.includes("missing")) throw new Error("NoSuchKey");
    if (key.includes("huge"))
      return { size: 999 * 1024 * 1024, metaData: { "content-type": "image/png" } };
    if (key.includes("evil"))
      return { size: 10, metaData: { "content-type": "application/x-msdownload" } };
    if (key.includes("voice"))
      return { size: 100, metaData: { "content-type": "audio/webm;codecs=opus" } };
    return { size: 100, metaData: { "content-type": "image/png" } };
  },
  removeRaw: async (key: string) => {
    removed.push(key);
  },
};

const app = build({ logger: false, repo: repo as any, storage: storage as any });
(app as any).redis = {
  xadd: async () => {
    if (xaddFails) throw new Error("redis down");
    return "1-0";
  },
};
after(() => app.close());

test("presign returns u/-namespaced PUT urls and rejects bad content types", async () => {
  const ok = await app.inject({
    method: "POST",
    url: "/uploads/presign",
    payload: { user_id: USER, files: [{ content_type: "audio/webm;codecs=opus" }] },
  });
  assert.equal(ok.statusCode, 200);
  const u = ok.json().uploads[0];
  assert.ok(u.key.startsWith(`u/${USER}/`), `key ${u.key} must be namespaced`);
  assert.equal(u.raw_type, "audio");
  assert.equal(u.content_type, "audio/webm");

  const bad = await app.inject({
    method: "POST",
    url: "/uploads/presign",
    payload: { user_id: USER, files: [{ content_type: "image/heic" }] },
  });
  assert.equal(bad.statusCode, 415);
});

test("capture with attachments stores derived mime/size, ordered", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: {
      user_id: USER,
      user_note: "remember this place, visit next year",
      raw_type: "mixed",
      attachments: [
        { raw_content_url: `u/${USER}/a1.png` },
        { raw_content_url: `u/${USER}/a2.png` },
        { raw_content_url: `u/${USER}/voice.webm` },
      ],
    },
  });
  assert.equal(res.statusCode, 202);
  const atts = captured.at(-1).attachments;
  assert.equal(atts.length, 3);
  assert.equal(atts[0].mimeType, "image/png");
  assert.equal(atts[0].rawType, "image");
  assert.equal(atts[2].rawType, "audio");
  assert.equal(captured.at(-1).userNote, "remember this place, visit next year");
  // text payload lands in user_note, not transcript_or_ocr
  assert.equal(captured.at(-1).payload, undefined);
});

test("text note: payload goes to the repo as text payload", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "text", payload: "buy milk" },
  });
  assert.equal(res.statusCode, 202);
  assert.equal(captured.at(-1).payload, "buy milk");
});

test("missing object -> 422, no item created", async () => {
  const before = captured.length;
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "image", payload: `u/${USER}/missing.png` },
  });
  assert.equal(res.statusCode, 422);
  assert.equal(captured.length, before);
});

test("foreign key namespace -> 403", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: {
      user_id: USER,
      raw_type: "image",
      payload: `u/99999999-9999-9999-9999-999999999999/x.png`,
    },
  });
  assert.equal(res.statusCode, 403);
});

test("oversized object -> 413 and object deleted", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "image", payload: `u/${USER}/huge.png` },
  });
  assert.equal(res.statusCode, 413);
  assert.ok(removed.includes(`u/${USER}/huge.png`));
});

test("wrong-type object -> 415 and object deleted", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "image", payload: `u/${USER}/evil.exe` },
  });
  assert.equal(res.statusCode, 415);
  assert.ok(removed.includes(`u/${USER}/evil.exe`));
});

test("duplicate key within one request -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: {
      user_id: USER,
      raw_type: "mixed",
      attachments: [
        { raw_content_url: `u/${USER}/a1.png` },
        { raw_content_url: `u/${USER}/a1.png` },
      ],
    },
  });
  assert.equal(res.statusCode, 400);
});

test("text without payload or attachments -> 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "text" },
  });
  assert.equal(res.statusCode, 400);
});

test("XADD failure still returns 202 (item is durable)", async () => {
  xaddFails = true;
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "text", payload: "redis down" },
  });
  xaddFails = false;
  assert.equal(res.statusCode, 202);
});

test("key already attached to another item -> 422", async () => {
  throwObjectKeyViolation = true;
  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { user_id: USER, raw_type: "image", payload: `u/${USER}/a1.png` },
  });
  throwObjectKeyViolation = false;
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error, "attachment_key_already_attached");
});

test("same idempotency key with different attachments -> 422", async () => {
  const body = {
    user_id: USER,
    raw_type: "mixed",
    user_note: "caption",
    attachments: [{ raw_content_url: `u/${USER}/a1.png` }],
    idempotency_key: "key-atts",
  };
  const first = await app.inject({ method: "POST", url: "/ingest", payload: body });
  assert.equal(first.statusCode, 202);
  const second = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { ...body, attachments: [{ raw_content_url: `u/${USER}/a2.png` }] },
  });
  assert.equal(second.statusCode, 422);
});
