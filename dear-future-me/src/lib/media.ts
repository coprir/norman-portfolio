/** Shared by client and server: what can be uploaded and how it is classified. */
export type MediaKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "LETTER";

export const ACCEPTED: Record<string, { kind: Exclude<MediaKind, "LETTER">; ext: string[] }> = {
  "image/jpeg": { kind: "IMAGE", ext: ["jpg", "jpeg"] },
  "image/png": { kind: "IMAGE", ext: ["png"] },
  "image/webp": { kind: "IMAGE", ext: ["webp"] },
  "image/heic": { kind: "IMAGE", ext: ["heic"] },
  "image/heif": { kind: "IMAGE", ext: ["heif"] },
  "video/mp4": { kind: "VIDEO", ext: ["mp4"] },
  "video/quicktime": { kind: "VIDEO", ext: ["mov"] },
  "video/webm": { kind: "VIDEO", ext: ["webm"] },
  "audio/mpeg": { kind: "AUDIO", ext: ["mp3"] },
  "audio/wav": { kind: "AUDIO", ext: ["wav"] },
  "audio/mp4": { kind: "AUDIO", ext: ["m4a"] },
  "audio/aac": { kind: "AUDIO", ext: ["aac"] },
  "audio/webm": { kind: "AUDIO", ext: [] },
  "audio/ogg": { kind: "AUDIO", ext: [] },
  "application/pdf": { kind: "DOCUMENT", ext: ["pdf"] },
  "text/plain": { kind: "DOCUMENT", ext: ["txt"] },
};

const ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
};

/** Canonical MIME type, or null when the type isn't supported. */
export function normalizeMime(mime: string, filename?: string): string | null {
  let m = (mime || "").toLowerCase().split(";")[0].trim();
  m = ALIASES[m] ?? m;
  if (ACCEPTED[m]) return m;
  // Browsers often report no type for HEIC/MOV/M4A: fall back to the extension.
  const ext = filename?.toLowerCase().split(".").pop();
  if (ext && (!m || m === "application/octet-stream")) {
    for (const [type, def] of Object.entries(ACCEPTED)) if (def.ext.includes(ext)) return type;
  }
  return null;
}

export const ACCEPT_ATTR = [
  ...Object.keys(ACCEPTED),
  ...Object.values(ACCEPTED).flatMap((d) => d.ext.map((e) => `.${e}`)),
].join(",");

export const KIND_LABEL: Record<MediaKind, string> = {
  IMAGE: "Photograph",
  VIDEO: "Video",
  AUDIO: "Audio",
  DOCUMENT: "Document",
  LETTER: "Letter",
};
