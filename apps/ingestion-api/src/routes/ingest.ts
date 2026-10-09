import type { FastifyPluginAsync } from "fastify";
import { ingestBodySchema, ingestAcceptedSchema, type IngestBody } from "../schemas/ingest";
import { captureItem, requestHash, resolveIdempotencyKey } from "../capture";

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
      const { user_id, source = "web", raw_type, payload, user_note, attachments } = req.body;
      if (!payload && !attachments?.length) {
        return reply.code(400).send({ error: "payload_or_attachments_required" });
      }

      const key = resolveIdempotencyKey({ headers: req.headers, body: req.body, source });

      const result = await captureItem(app, {
        userId: user_id,
        source,
        rawType: raw_type,
        payload,
        userNote: user_note,
        attachments,
        key,
        hash: requestHash(req.body),
      });

      if (result.code !== 202) {
        if (result.error) return reply.code(result.code).send({ error: result.error });
        return reply.code(result.code).send({ id: result.id, status: result.status });
      }
      return reply.code(202).send({ id: result.id, status: "accepted" });
    },
  );
};

export default ingestRoutes;
