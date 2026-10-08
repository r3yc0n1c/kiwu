// Media allowlist + per-type size caps, shared by /uploads/presign and capture HEAD-verify.

export const ALLOWED_TYPES: Record<string, { rawType: "image" | "audio"; maxBytes: number }> = {
  "image/jpeg": { rawType: "image", maxBytes: 10 * 1024 * 1024 },
  "image/png": { rawType: "image", maxBytes: 10 * 1024 * 1024 },
  "image/webp": { rawType: "image", maxBytes: 10 * 1024 * 1024 },
  // heic rejected until the worker conversion ticket lands (VLM can't read it)
  "audio/webm": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
  "audio/mp4": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
  "audio/aac": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
  "audio/mpeg": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
  "audio/ogg": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
  "audio/wav": { rawType: "audio", maxBytes: 25 * 1024 * 1024 },
};

export const MAX_FILES = 10;

/** MediaRecorder sends e.g. "audio/webm;codecs=opus" — strip parameters before checking */
export const normalizeContentType = (ct: string) => ct.split(";")[0].trim().toLowerCase();

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

export const extFor = (contentType: string) => EXT_BY_TYPE[contentType] ?? "bin";

/** Server-generated key, namespaced by user; clients never influence the path */
export const objectKeyFor = (userId: string, ext: string, id = crypto.randomUUID()) =>
  `u/${userId}/${id}.${ext}`;
