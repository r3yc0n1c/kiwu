import type { FastifyPluginAsync } from "fastify";
import { db, items } from "@kiwu/db";
import { ingestBodySchema, ingestAcceptedSchema, type IngestBody } from "../schemas/ingest";

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
      const isText = raw_type === "text";

      const [item] = await db
        .insert(items)
        .values({
          userId: user_id,
          source,
          rawType: raw_type,
          transcriptOrOcr: isText ? payload : null,
          rawContentUrl: isText ? null : payload,
          status: "pending",
        })
        .returning({ id: items.id });

      await app.redis.xadd("ingest:jobs", "*", "item_id", item.id, "raw_type", raw_type);
      return reply.code(202).send({ id: item.id, status: "accepted" });
    },
  );
};

export default ingestRoutes;
