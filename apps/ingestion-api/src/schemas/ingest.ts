export const ingestBodySchema = {
  type: "object",
  required: ["user_id", "raw_type", "payload"],
  properties: {
    user_id: { type: "string", format: "uuid" },
    source: {
      type: "string",
      enum: ["web", "ios", "android", "email", "connector"],
      default: "web",
    },
    raw_type: { type: "string", enum: ["text", "audio", "image"] },
    idempotency_key: { type: "string", minLength: 1, maxLength: 255 },
    payload: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

export const ingestAcceptedSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    status: { type: "string" },
  },
} as const;

export type IngestBody = {
  user_id: string;
  source?: "web" | "ios" | "android" | "email" | "connector";
  raw_type: "text" | "audio" | "image";
  idempotency_key?: string;
  payload: string;
};
