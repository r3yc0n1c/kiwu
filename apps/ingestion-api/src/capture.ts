import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { REDIS_STREAM } from "@kiwu/config";
import { ALLOWED_TYPES, normalizeContentType } from "./media";

/** Stable stringify (sorted object keys; array order is semantic — attachment position) */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const requestHash = (body: unknown) =>
  createHash("sha256").update(canonical(body)).digest("hex");

/** header → body idempotency_key → Message-ID (email source only); scoped (user_id, key) in the repo */
export function resolveIdempotencyKey(req: {
  headers: Record<string, unknown>;
  body: Record<string, unknown>;
  source?: string;
}): string | undefined {
  const headerKey = req.headers["idempotency-key"];
  const messageId = req.headers["message-id"];
  return (
    (req.body.idempotency_key as string | undefined) ??
    (typeof headerKey === "string" ? headerKey : undefined) ??
    (req.source === "email" && typeof messageId === "string" ? messageId : undefined)
  );
}

export type Attachment = {
  objectKey: string;
  rawType: string;
  mimeType: string;
  sizeBytes: number;
};

export type CaptureResult = {
  code: 200 | 202 | 400 | 403 | 409 | 413 | 415 | 422;
  id?: string | null;
  status?: "accepted" | "duplicate";
  error?: string;
};

/**
 * Shared DUMP path used by POST /ingest (and POST /chat later):
 * idempotency replay → HEAD-verify media (type/size/namespace, delete on violation)
 * → tx {item, attachments, idem claim} → XADD.
 */
export async function captureItem(
  app: FastifyInstance,
  input: {
    userId: string;
    source: string;
    rawType: string;
    payload?: string; // text content, or an object key for single-media captures
    userNote?: string;
    attachments?: { raw_content_url: string }[];
    key?: string;
    hash?: string;
  },
): Promise<CaptureResult> {
  const { userId, key, hash } = input;

  if (key) {
    const existing = await app.repo.getIdempotencyKey(userId, key);
    if (existing) {
      if (existing.requestHash !== hash) {
        return { code: 422, error: "idempotency_key_reused_with_different_body" };
      }
      if (!existing.completed) {
        return { code: 409, error: "idempotent_request_in_flight" };
      }
      return { code: 200, id: existing.itemId, status: "duplicate" };
    }
  }

  // single-media captures (voice note): payload is an object key
  const keys = [
    ...(input.rawType !== "text" && input.payload ? [input.payload] : []),
    ...(input.attachments ?? []).map((a) => a.raw_content_url),
  ];

  // one file can belong to only one item
  if (new Set(keys).size !== keys.length) {
    return { code: 400, error: "duplicate_attachment_key" };
  }

  // HEAD-verify: namespace (forged keys → 403), existence, mime allowlist, size cap
  const atts: Attachment[] = [];
  for (const k of keys) {
    if (!k.startsWith(`u/${userId}/`)) return { code: 403, error: "invalid_key_namespace" };
    let stat;
    try {
      stat = await app.storage.headRaw(k);
    } catch {
      return { code: 422, error: "file_missing" };
    }
    const mimeType = normalizeContentType(stat.metaData?.["content-type"] ?? "");
    const rule = ALLOWED_TYPES[mimeType];
    if (!rule) {
      await app.storage.removeRaw(k).catch(() => {});
      return { code: 415, error: `unsupported_content_type: ${mimeType}` };
    }
    if (stat.size > rule.maxBytes) {
      await app.storage.removeRaw(k).catch(() => {});
      return { code: 413, error: "file_too_large" };
    }
    atts.push({ objectKey: k, rawType: rule.rawType, mimeType, sizeBytes: stat.size });
  }

  let item;
  try {
    item = await app.repo.createIngestionItem({
      userId,
      source: input.source,
      payload: input.rawType === "text" ? input.payload : undefined,
      userNote: input.userNote,
      attachments: atts,
      key,
      requestHash: hash,
    });
  } catch (e) {
    if (key && app.repo.isUniqueViolation(e)) {
      const existing = await app.repo.getIdempotencyKey(userId, key);
      if (existing?.completed) {
        return { code: 200, id: existing.itemId, status: "duplicate" };
      }
      return { code: 409, error: "idempotent_request_in_flight" };
    }
    if (app.repo.isObjectKeyViolation?.(e)) {
      return { code: 422, error: "attachment_key_already_attached" };
    }
    throw e;
  }

  // item is durable after the commit: never 5xx here. Log and let the
  // KIWU-82 stuck-pending sweeper re-enqueue it.
  try {
    await app.redis.xadd(REDIS_STREAM, "*", "item_id", item.id);
  } catch (e) {
    app.log.error(`xadd failed for item ${item.id}, sweeper will re-enqueue: ${e}`);
  }
  return { code: 202, id: item.id, status: "accepted" };
}
