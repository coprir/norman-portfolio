import { notFound, redirect } from "next/navigation";
import { Reveal } from "@/components/capsules/reveal";
import { aiConfigured } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { getCapsule } from "@/server/capsules/service";
import { ApiError } from "@/server/errors";

export const metadata = { title: "Open your capsule" };

export default async function OpenCapsulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const capsule = await getCapsule(user, id).catch((err) => {
    if (err instanceof ApiError) notFound();
    throw err;
  });
  // The server decides whether this can be opened; a sealed capsule never reaches the reveal.
  if (!capsule.canViewContents) redirect(`/app/capsules/${id}`);
  return <Reveal capsule={capsule} ai={aiConfigured() && user.aiConsent} />;
}
