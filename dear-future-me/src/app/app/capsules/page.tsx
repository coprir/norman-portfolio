import { PageHeader, pageClass } from "@/components/app/shell";
import { CapsuleCard } from "@/components/capsules/capsule-card";
import { NewCapsuleButton } from "@/components/capsules/new-capsule-button";
import { requireUser } from "@/server/auth/session";
import { listCapsules, type CapsuleDTO } from "@/server/capsules/service";

export const metadata = { title: "Time Capsules" };

function Section({ title, note, capsules }: { title: string; note?: string; capsules: CapsuleDTO[] }) {
  if (!capsules.length) return null;
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-3xl">{title}</h2>
        {note && <p className="text-sm text-mute">{note}</p>}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capsules.map((c) => <CapsuleCard key={c.id} capsule={c} />)}
      </div>
    </section>
  );
}

export default async function CapsulesPage() {
  const user = await requireUser();
  const { created, received, contributing } = await listCapsules(user);
  const all = [...created, ...received];
  const ready = all.filter((c) => c.status === "AVAILABLE" && !c.iHaveOpened);
  const sealed = all.filter((c) => c.status === "LOCKED" || c.status === "SEALING");
  const drafts = created.filter((c) => c.status === "DRAFT");
  const opened = all.filter((c) => c.status === "OPENED" || (c.status === "AVAILABLE" && c.iHaveOpened));

  return (
    <div className={pageClass}>
      <PageHeader eyebrow="Time Capsules" title="Sealed, and waiting." description="Once a capsule is sealed, nobody can see inside until its date — including you." actions={<NewCapsuleButton />} />
      {!all.length && !contributing.length && (
        <div className="mt-12 rounded-3xl border border-line px-6 py-20 text-center">
          <p className="font-serif text-4xl">Nothing is waiting for you yet.</p>
          <p className="mx-auto mt-3 max-w-md text-silver">Choose a few memories, pick a date, and seal them. The rest is patience.</p>
          <div className="mt-7 flex justify-center"><NewCapsuleButton>Create your first capsule</NewCapsuleButton></div>
        </div>
      )}
      <Section title="Ready to open" capsules={ready} />
      <Section title="Sealed" note="Soonest first" capsules={sealed} />
      <Section title="Waiting for your memories" note="You've been invited to add to these before they're sealed" capsules={contributing} />
      <Section title="Drafts" note="Not sealed yet — you can still change these" capsules={drafts} />
      <Section title="Opened" capsules={opened} />
    </div>
  );
}
