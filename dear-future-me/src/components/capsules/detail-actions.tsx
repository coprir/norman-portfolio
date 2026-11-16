"use client";

import { Camera, Mic, PenLine, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { LetterDialog } from "@/components/vault/letter-dialog";
import { Recorder } from "@/components/vault/recorder";
import { Uploader } from "@/components/vault/uploader";
import { api, errorMessage } from "@/lib/client/api";
import type { MemoryDTO } from "@/server/memories";

/** Accept or decline being a recipient of someone else's capsule. */
export function InvitationActions({ capsuleId, status }: { capsuleId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    try {
      await api(`/capsules/${capsuleId}/invitation`, { body: { action } });
      toast(action === "accept" ? "Accepted. We'll write to you when it opens." : "Declined. You won't hear about this capsule again.");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(null);
  };
  if (status === "ACCEPTED") return <p className="text-sm text-silver">You've accepted this capsule. We'll email you the day it opens.</p>;
  if (status === "DECLINED") return <Button variant="secondary" size="sm" loading={busy === "accept"} onClick={() => respond("accept")}>Accept after all</Button>;
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button loading={busy === "accept"} onClick={() => respond("accept")}>Accept</Button>
      <Button variant="ghost" loading={busy === "decline"} onClick={() => respond("decline")}>Decline</Button>
    </div>
  );
}

/** For invited contributors, while the capsule is still a draft. */
export function ContributePanel({ capsuleId, initialCount }: { capsuleId: string; initialCount: number }) {
  const toast = useToast();
  const [count, setCount] = useState(initialCount);
  const [panel, setPanel] = useState<"upload" | "letter" | "video" | "audio" | null>(null);
  const contribute = async (m: MemoryDTO) => {
    try {
      const res = await api<{ contributions: number }>(`/capsules/${capsuleId}/contributions`, { body: { memoryId: m.id } });
      setCount(res.contributions);
      toast("Added to the capsule.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {([["upload", Upload, "Upload"], ["video", Camera, "Record video"], ["audio", Mic, "Record voice"], ["letter", PenLine, "Write a note"]] as const).map(([key, Icon, label]) => (
          <button key={key} type="button" onClick={() => setPanel(key)} className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-left text-sm hover:border-line-strong hover:bg-white/[0.05]">
            <Icon className="size-5 text-silver" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-silver" aria-live="polite">{count === 0 ? "You haven't added anything yet." : `You've added ${count} ${count === 1 ? "memory" : "memories"}.`} What you add goes straight into the capsule. Once it's sealed, you won't see it again until it opens.</p>
      <Dialog open={panel === "upload"} onClose={() => setPanel(null)} title="Add to this capsule">
        <Uploader onUploaded={contribute} inVault={false} />
      </Dialog>
      <LetterDialog open={panel === "letter"} onClose={() => setPanel(null)} onSaved={contribute} inVault={false} />
      {(panel === "video" || panel === "audio") && <Recorder kind={panel} open onClose={() => setPanel(null)} onSaved={contribute} inVault={false} />}
    </div>
  );
}

/** Refreshes the page while the worker is sealing, until the capsule is locked. */
export function SealingWatcher() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
