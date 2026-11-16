"use client";

import { Circle, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/client/api";
import { uploadFile } from "@/lib/client/upload";
import type { MemoryDTO } from "@/server/memories";

function pickMime(kind: "video" | "audio") {
  const options = kind === "video" ? ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Records a video or voice message with the device camera/microphone, then uploads it. */
export function Recorder({ kind, open, onClose, onSaved, inVault = true }: { kind: "video" | "audio"; open: boolean; onClose: () => void; onSaved: (m: MemoryDTO) => void; inVault?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "ready" | "recording" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const live = useRef<HTMLVideoElement>(null);

  const stopStream = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("idle");
    setError(null);
    setBlob(null);
    setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser. You can upload a file instead.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia(kind === "video" ? { video: { facingMode: "user" }, audio: true } : { audio: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (live.current) live.current.srcObject = s;
        setPhase("ready");
      })
      .catch(() => !cancelled && setError(`We couldn't use your ${kind === "video" ? "camera and microphone" : "microphone"}. Check your browser's permissions and try again.`));
    return () => {
      cancelled = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopStream();
    };
  }, [open, kind]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (!blob) return setPreviewUrl(null);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  function begin() {
    if (!stream.current) return;
    const mimeType = pickMime(kind);
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const type = (r.mimeType || mimeType || (kind === "video" ? "video/webm" : "audio/webm")).split(";")[0];
      // Browsers label audio-only WebM as video/webm; keep the kind the user chose.
      setBlob(new Blob(chunks, { type: kind === "audio" ? type.replace("video/", "audio/") : type }));
      setPhase("review");
    };
    recorder.current = r;
    setSeconds(0);
    r.start(1000);
    setPhase("recording");
  }

  async function save() {
    if (!blob) return;
    setPhase("saving");
    setError(null);
    try {
      const ext = blob.type.includes("mp4") ? (kind === "video" ? "mp4" : "m4a") : blob.type.includes("ogg") ? "ogg" : "webm";
      const stamp = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const memory = await uploadFile(blob, { filename: `${kind === "video" ? "Video" : "Voice"} message, ${stamp}.${ext}`, inVault, onProgress: setProgress }).promise;
      stopStream();
      onSaved(memory);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setPhase("review");
    }
  }

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "video" ? "Record a video" : "Record your voice"}
      footer={
        phase === "review" || phase === "saving" ? (
          <>
            <Button variant="ghost" disabled={phase === "saving"} onClick={() => { setBlob(null); setPhase("ready"); }}>Record again</Button>
            <Button loading={phase === "saving"} onClick={save}>{phase === "saving" ? `Saving ${Math.round(progress * 100)}%` : "Keep this"}</Button>
          </>
        ) : phase === "recording" ? (
          <Button variant="danger" onClick={() => recorder.current?.stop()}><Square className="size-3.5 fill-current" /> Stop</Button>
        ) : (
          <Button disabled={phase !== "ready"} onClick={begin}><Circle className="size-3.5 fill-danger text-danger" /> Start recording</Button>
        )
      }
    >
      {error && <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffd0d0]">{error}</p>}
      {phase === "review" || phase === "saving" ? (
        kind === "video" ? (
          <video src={previewUrl ?? undefined} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
        ) : (
          <audio src={previewUrl ?? undefined} controls className="w-full" />
        )
      ) : kind === "video" ? (
        <div className="relative">
          <video ref={live} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 rounded-2xl bg-black object-cover" />
          {phase === "recording" && <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-ink/70 px-3 py-1.5 text-sm tnum backdrop-blur"><span className="size-2 animate-[breathe_1.2s_infinite] rounded-full bg-danger" />{time}</span>}
        </div>
      ) : (
        <div className="grid place-items-center rounded-2xl bg-white/[0.03] py-14" aria-live="polite">
          <span className="font-serif text-6xl tnum">{time}</span>
          <span className="mt-3 flex items-center gap-2 text-sm text-silver">
            {phase === "recording" ? <><span className="size-2 animate-[breathe_1.2s_infinite] rounded-full bg-danger" /> Recording</> : phase === "ready" ? "Ready when you are" : "Waiting for your microphone…"}
          </span>
        </div>
      )}
    </Dialog>
  );
}
