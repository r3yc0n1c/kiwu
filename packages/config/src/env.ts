import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

const ingestionAPIenvSchema = envSchema.extend({
  PORT: z.coerce.number().default(5001),
});

export const env = envSchema.parse(process.env);
export const ingestionAPIenv = ingestionAPIenvSchema.parse(process.env);
