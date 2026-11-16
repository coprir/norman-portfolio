"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";

export function NewCapsuleButton({ kind = "STANDARD", children, variant = "primary", size = "md" }: { kind?: "STANDARD" | "FUTURE_SELF"; children?: React.ReactNode; variant?: "primary" | "secondary"; size?: "sm" | "md" | "lg" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { id } = await api<{ id: string }>("/capsules", { body: { kind } });
          router.push(`/app/capsules/${id}/edit`);
        } catch (err) {
          toast(errorMessage(err), "error");
          setBusy(false);
        }
      }}
    >
      {children ?? (<><Plus className="size-4" /> New capsule</>)}
    </Button>
  );
}
