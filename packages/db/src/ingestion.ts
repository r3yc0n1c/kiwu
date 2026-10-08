import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { idempotencyKeys, itemAttachments, items } from "./schema";

export type NewItem = typeof items.$inferInsert;

export async function getIdempotencyKey(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  return row ?? null;
}

/** Insert item (+ attachments + idempotency record when keyed) atomically. Throws 23505 on a raced duplicate key. */
export async function createIngestionItem(opts: {
  userId: string;
  source: string;
  rawType?: string; // optional: derived from attachments when absent
  payload?: string; // text-only note → items.user_note
  userNote?: string;
  attachments?: {
    objectKey: string;
    rawType: string;
    mimeType: string;
    sizeBytes?: number;
  }[];
  key?: string;
  requestHash?: string;
}) {
  const { userId, source, payload, userNote, attachments, key, requestHash } = opts;
  const atts = attachments ?? [];
  const isText = atts.length === 0;
  // raw_type: 'text' with no attachments, the shared type, else 'mixed'
  const rawType =
    opts.rawType ??
    (isText
      ? "text"
      : atts.every((a) => a.rawType === atts[0].rawType)
        ? atts[0].rawType
        : "mixed");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({
        userId,
        source,
        rawType,
        userNote: userNote ?? (isText ? (payload ?? null) : null),
        status: "pending",
      })
      .returning({ id: items.id });

    if (atts.length) {
      await tx.insert(itemAttachments).values(
        atts.map((a, i) => ({
          itemId: row.id,
          objectKey: a.objectKey,
          rawType: a.rawType,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes ?? null,
          position: i,
        })),
      );
    }

    if (key) {
      await tx.insert(idempotencyKeys).values({
        userId,
        key,
        requestHash: requestHash!,
        itemId: row.id,
        statusCode: 202,
        completed: true,
      });
    }
    return row;
  });
}

export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === "23505";
}

/** 23505 on item_attachments.object_key — the key is already attached to another item */
export function isObjectKeyViolation(e: unknown): boolean {
  return (
    isUniqueViolation(e) && String((e as { message?: string })?.message).includes("object_key")
  );
}

// Facade used by the API layer; tests inject an in-memory stub via build() opts.
export const ingestionRepo = {
  getIdempotencyKey,
  createIngestionItem,
  isUniqueViolation,
  isObjectKeyViolation,
};
export type IngestionRepo = typeof ingestionRepo;
