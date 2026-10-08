import * as Minio from "minio";
import { env } from "@kiwu/config";

export const minio = new Minio.Client({
  endPoint: env.S3_ENDPOINT,
  port: env.S3_PORT,
  useSSL: env.S3_USE_SSL,
  region: env.S3_REGION,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

/** Upload a raw blob; returns the bucket/key path to store in items.raw_content_url */
export async function uploadRaw(key: string, data: Buffer, contentType: string) {
  await minio.putObject(env.S3_BUCKET, key, data, data.length, {
    "Content-Type": contentType,
  });
  return `${env.S3_BUCKET}/${key}`;
}

/** Short-lived download URL for a raw blob */
export async function getRawUrl(key: string, expiresSec = 3600) {
  return minio.presignedGetObject(env.S3_BUCKET, key, expiresSec);
}

/**
 * Presigned PUT: client uploads directly to S3. Works on every S3-compatible
 * backend (MinIO, R2, B2, S3, Supabase) — unlike POST policies, which R2/B2 don't support.
 * Size/type are NOT enforced by the signature (PUT can't); captureItem HEAD-verifies
 * and deletes on violation. The endpoint must be the browser-reachable host —
 * the host is part of the signature, so S3_ENDPOINT must not be a docker-internal name in prod.
 */
export async function createPresignedPut(key: string, expiresSec = 900) {
  return minio.presignedPutObject(env.S3_BUCKET, key, expiresSec);
}

/** HEAD-equivalent: throws if the object doesn't exist; returns size + metadata */
export async function headRaw(key: string) {
  return minio.statObject(env.S3_BUCKET, key);
}

/** Delete a raw blob (orphan cleanup / rejected uploads) */
export async function removeRaw(key: string) {
  await minio.removeObject(env.S3_BUCKET, key);
}

// Facade used by the API layer; tests inject a stub via build() opts.
export const storageRepo = { uploadRaw, getRawUrl, createPresignedPut, headRaw, removeRaw };
export type StorageRepo = typeof storageRepo;
