import Fastify, { type FastifyInstance } from "fastify";
import Redis from "ioredis";
import { ingestionAPIenv as env } from "@kiwu/config";
import { ingestionRepo, type IngestionRepo } from "@kiwu/db";
import ingestRoutes from "./routes/ingest";

export function build(opts: { logger?: boolean; repo?: IngestionRepo } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", (err: Error) => app.log.error(`redis: ${err.message}`));
  app.decorate("redis", redis);
  app.addHook("onClose", async () => redis.disconnect());

  app.decorate("repo", opts.repo ?? ingestionRepo);

  app.setErrorHandler((err: any, _req, reply) => {
    app.log.error(err);
    const status = err.validation ? 400 : (err.statusCode ?? 500);
    reply.code(status).send({ status, message: err.message });
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(ingestRoutes);
  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
    repo: IngestionRepo;
  }
}
