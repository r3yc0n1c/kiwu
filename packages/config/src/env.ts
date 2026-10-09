import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  // S3-compatible object storage (MinIO locally, R2/S3/B2/Supabase in prod).
  // S3_ENDPOINT must be the browser-reachable host: it's part of the PUT signature.
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().default(9000),
  S3_USE_SSL: z.stringbool().default(false),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().default("admin"),
  S3_SECRET_KEY: z.string().default("password"),
  S3_BUCKET: z.string().default("kiwu-raw"),
});

const ingestionAPIenvSchema = envSchema.extend({
  PORT: z.coerce.number().default(5001),
});

export const env = envSchema.parse(process.env);
export const ingestionAPIenv = ingestionAPIenvSchema.parse(process.env);
