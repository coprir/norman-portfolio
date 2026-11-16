import { normalizeMime } from "@/lib/media";
import type { MemoryDTO } from "@/server/memories";
import { api } from "./api";

export type UploadHandle = { promise: Promise<MemoryDTO>; cancel: () => void };

const CONCURRENCY = 3;
const PART_RETRIES = 4;

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(xhr.status === 403 ? "expired" : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/**
 * Uploads a file in parts straight to storage using short-lived signed URLs.
 * Each part is retried with backoff; if the connection drops, parts that
 * already arrived are not sent again. Passing `resumeId` continues an upload
 * that was interrupted earlier in this session.
 */
export function uploadFile(file: File | Blob, opts: { filename?: string; inVault?: boolean; onProgress?: (fraction: number) => void; resumeId?: string; onStarted?: (memoryId: string) => void } = {}): UploadHandle {
  const controller = new AbortController();
  const filename = opts.filename ?? (file instanceof File ? file.name : "recording");

  const run = async (): Promise<MemoryDTO> => {
    const mimeType = normalizeMime(file.type, filename);
    if (!mimeType) throw new Error("That file type isn't supported.");
    let memoryId = opts.resumeId;
    let partSize: number;
    let partCount: number;
    const done = new Map<number, string>();

    if (memoryId) {
      const existing = await api<{ parts: { partNumber: number; etag: string; size: number }[] }>(`/memories/${memoryId}/parts`);
      partSize = 8 * 1024 * 1024;
      partCount = Math.max(1, Math.ceil(file.size / partSize));
      for (const p of existing.parts) done.set(p.partNumber, p.etag);
    } else {
      const init = await api<{ memoryId: string; partSize: number; partCount: number }>("/memories/uploads", {
        body: { filename, mimeType, size: file.size, inVault: opts.inVault ?? true, captureDate: file instanceof File && file.lastModified ? new Date(file.lastModified).toISOString() : null },
        signal: controller.signal,
      });
      ({ memoryId, partSize, partCount } = init);
      opts.onStarted?.(memoryId);
    }

    const loaded = new Map<number, number>();
    for (const n of done.keys()) loaded.set(n, Math.min(partSize, file.size - (n - 1) * partSize));
    const report = () => opts.onProgress?.(Math.min(0.99, [...loaded.values()].reduce((a, b) => a + b, 0) / file.size));
    report();

    const queue = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    const worker = async () => {
      for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
        const blob = file.slice((n - 1) * partSize, n * partSize);
        for (let attempt = 0; ; attempt++) {
          try {
            // A fresh signed URL per attempt: links are short-lived by design.
            const { parts } = await api<{ parts: { partNumber: number; url: string }[] }>(`/memories/${memoryId}/parts`, { body: { partNumbers: [n] }, signal: controller.signal });
            const part = n;
            const etag = await putPart(parts[0].url, blob, (l) => (loaded.set(part, l), report()), controller.signal);
            done.set(n, etag);
            loaded.set(n, blob.size);
            report();
            break;
          } catch (err) {
            if ((err as Error).name === "AbortError" || attempt >= PART_RETRIES) throw err;
            loaded.set(n, 0);
            await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** attempt)));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker));

    const memory = await api<MemoryDTO>(`/memories/${memoryId}/complete`, { body: { parts: [...done].map(([partNumber, etag]) => ({ partNumber, etag })) } });
    opts.onProgress?.(1);
    if (memory.mediaType === "VIDEO") {
      const poster = await captureVideoPoster(file).catch(() => null);
      if (poster) {
        const res = await fetch(`/api/v1/memories/${memory.id}/thumbnail`, { method: "POST", body: poster, headers: { "Content-Type": "image/jpeg" } });
        if (res.ok) return (await res.json()) as MemoryDTO;
      }
    }
    return memory;
  };

  return { promise: run(), cancel: () => controller.abort() };
}

/** Grabs a frame about a second in, to use as the video's preview image. */
function captureVideoPoster(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (b: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      if (!canvas.width || !canvas.height) return finish(null);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => finish(b), "image/jpeg", 0.82);
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
  });
}
