export const ingestBodySchema = {
  type: "object",
  required: ["user_id", "raw_type"],
  properties: {
    user_id: { type: "string", format: "uuid" },
    source: {
      type: "string",
      enum: ["web", "ios", "android", "email", "connector"],
      default: "web",
    },
    raw_type: { type: "string", enum: ["text", "audio", "image", "mixed"] },
    idempotency_key: { type: "string", minLength: 1, maxLength: 255 },
    // text notes: inline content; media notes: S3 key of the uploaded blob
    payload: { type: "string", minLength: 1, maxLength: 100000 },
    // caption the user typed/spoke alongside media
    user_note: { type: "string", minLength: 1, maxLength: 100000 },
    attachments: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        required: ["raw_content_url"],
        properties: {
          // raw_type derived server-side from the object's mime type
          raw_content_url: { type: "string", minLength: 1, maxLength: 1024 },
        },
        additionalProperties: false,
      },
    },
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
  raw_type: "text" | "audio" | "image" | "mixed";
  idempotency_key?: string;
  payload?: string;
  user_note?: string;
  attachments?: { raw_content_url: string }[];
};
