import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../src/app";

test("rejects invalid payload via schema validation", async (t) => {
  const app = build({ logger: false });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: { raw_type: "text" }, // missing user_id + payload
  });
  assert.equal(res.statusCode, 400);
});

test("rejects unknown raw_type", async (t) => {
  const app = build({ logger: false });
  t.after(() => app.close());

  const res = await app.inject({
    method: "POST",
    url: "/ingest",
    payload: {
      user_id: "00000000-0000-0000-0000-000000000000",
      raw_type: "video",
      payload: "hi",
    },
  });
  assert.equal(res.statusCode, 400);
});
