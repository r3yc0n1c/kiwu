import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { ingestBodySchema, ingestAcceptedSchema, type IngestBody } from "../schemas/ingest";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ingestRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: IngestBody }>(
    "/ingest",
    {
      schema: {
        body: ingestBodySchema,
        response: { 202: ingestAcceptedSchema },
      },
    },
    async (req, reply) => {
      const { user_id, source = "web", raw_type, payload } = req.body;
      const headerKey = req.headers["idempotency-key"];
      const messageId = req.headers["message-id"];
      const key =
        req.body.idempotency_key ??
        (typeof headerKey === "string" ? headerKey : undefined) ??
        (source === "email" && typeof messageId === "string" ? messageId : undefined);

      const requestHash = sha256(JSON.stringify(req.body));

      if (key) {
        const existing = await app.repo.getIdempotencyKey(user_id, key);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            return reply.code(422).send({ error: "idempotency_key_reused_with_different_body" });
          }
          if (!existing.completed) {
            return reply.code(409).send({ error: "idempotent_request_in_flight" });
          }
          return reply.code(200).send({ id: existing.itemId, status: "duplicate" });
        }
      }

      let item;
      try {
        item = await app.repo.createIngestionItem({
          userId: user_id,
          source,
          rawType: raw_type,
          payload,
          key,
          requestHash,
        });
      } catch (e) {
        if (key && app.repo.isUniqueViolation(e)) {
          const existing = await app.repo.getIdempotencyKey(user_id, key);
          if (existing?.completed) {
            return reply.code(200).send({ id: existing.itemId, status: "duplicate" });
          }
          return reply.code(409).send({ error: "idempotent_request_in_flight" });
        }
        throw e;
      }

      await app.redis.xadd("ingest:jobs", "*", "item_id", item.id, "raw_type", raw_type);
      return reply.code(202).send({ id: item.id, status: "accepted" });
    },
  );
};

export default ingestRoutes;
