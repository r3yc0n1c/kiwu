import type { FastifyPluginAsync } from "fastify";
import { ALLOWED_TYPES, MAX_FILES, extFor, normalizeContentType, objectKeyFor } from "../media";

// ponytail: in-memory per-IP rate limit; ceiling = resets on restart & per-process.
// Upgrade to Redis sliding window when we run more than one API instance.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // presign requests per minute per IP
const hits = new Map<string, number[]>();

const presignBodySchema = {
  type: "object",
  required: ["user_id", "files"],
  properties: {
    user_id: { type: "string", format: "uuid" },
    files: {
      type: "array",
      minItems: 1,
      maxItems: MAX_FILES,
      items: {
        type: "object",
        required: ["content_type"],
        properties: {
          content_type: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

type PresignBody = {
  user_id: string;
  files: { content_type: string }[];
};

const uploadsRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: PresignBody }>(
    "/uploads/presign",
    { schema: { body: presignBodySchema } },
    async (req, reply) => {
      const now = Date.now();
      const window = (hits.get(req.ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
      if (window.length >= RATE_MAX) {
        return reply.code(429).send({ error: "rate_limited" });
      }
      window.push(now);
      hits.set(req.ip, window);

      const uploads = [];
      for (const f of req.body.files) {
        const contentType = normalizeContentType(f.content_type);
        const rule = ALLOWED_TYPES[contentType];
        if (!rule) {
          return reply.code(415).send({ error: `unsupported_content_type: ${contentType}` });
        }
        // server-generated key, namespaced by user (never client filename);
        // the PUT host is part of the signature: S3_ENDPOINT must be browser-reachable
        const key = objectKeyFor(req.body.user_id, extFor(contentType));
        const url = await app.storage.createPresignedPut(key);
        uploads.push({ raw_type: rule.rawType, content_type: contentType, key, url });
      }
      return reply.code(200).send({ uploads });
    },
  );
};

export default uploadsRoutes;
