import { z } from "zod";

const ingestionAPIenvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.number().default(5001),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export const ingestionAPIenv = ingestionAPIenvSchema.parse(process.env);
