import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { idempotencyKeys, items } from "./schema";

export type NewItem = typeof items.$inferInsert;

export async function getIdempotencyKey(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)));
  return row ?? null;
}

/** Insert item (+ idempotency record when keyed) atomically. Throws 23505 on a raced duplicate key. */
export async function createIngestionItem(opts: {
  userId: string;
  source: string;
  rawType: string;
  payload: string;
  key?: string;
  requestHash?: string;
}) {
  const { userId, source, rawType, payload, key, requestHash } = opts;
  const isText = rawType === "text";

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({
        userId,
        source,
        rawType,
        transcriptOrOcr: isText ? payload : null,
        rawContentUrl: isText ? null : payload,
        status: "pending",
      })
      .returning({ id: items.id });

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
