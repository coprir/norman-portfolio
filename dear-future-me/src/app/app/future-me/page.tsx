import Link from "next/link";
import { PageHeader, pageClass } from "@/components/app/shell";
import { CapsuleCard } from "@/components/capsules/capsule-card";
import { NewCapsuleButton } from "@/components/capsules/new-capsule-button";
import { FUTURE_SELF_PROMPTS } from "@/lib/prompts";
import { requireUser } from "@/server/auth/session";
import { listCapsules } from "@/server/capsules/service";

export const metadata = { title: "Dear Future Me" };

export default async function FutureMePage() {
  const user = await requireUser();
  const { created } = await listCapsules(user);
  const mine = created.filter((c) => c.kind === "FUTURE_SELF");
  const reflect = mine.filter((c) => c.isReleased);
  const waiting = mine.filter((c) => !c.isReleased);

  return (
    <div className={pageClass}>
      <PageHeader eyebrow="Dear Future Me" title="Write to who you'll be." description="Answer a few honest questions about your life as it is today. When the capsule opens you'll read your answers, answer again, and see what changed." />
      <section className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[2rem] bg-[#f3efe6] p-8 text-[#26231e] sm:p-10">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-[#8a8275]">A few of the questions</p>
          <ul className="mt-6 space-y-4 font-serif text-[1.45rem] leading-snug">
            {FUTURE_SELF_PROMPTS.slice(0, 6).map((p) => <li key={p.key}>{p.prompt}</li>)}
          </ul>
        </div>
        <div className="flex flex-col justify-between gap-8 rounded-[2rem] border border-line p-8 sm:p-10">
          <div>
            <h2 className="font-serif text-3xl leading-tight">You can also add a video, a voice note, photographs or a letter.</h2>
            <p className="mt-3 leading-relaxed text-silver">Take your time — it saves as a draft until you seal it. After that, you won't be able to read your answers again until the day it opens.</p>
          </div>
          <div><NewCapsuleButton kind="FUTURE_SELF" size="lg">Begin writing</NewCapsuleButton></div>
        </div>
      </section>

      {reflect.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif text-3xl">Then and now</h2>
          <p className="mt-2 text-silver">These have opened. Read what you wrote and answer again.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{reflect.map((c) => <CapsuleCard key={c.id} capsule={c} />)}</div>
        </section>
      )}
      {waiting.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif text-3xl">Still on their way</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{waiting.map((c) => <CapsuleCard key={c.id} capsule={c} />)}</div>
        </section>
      )}
      {!mine.length && <p className="mt-10 text-sm text-mute">Nothing written yet. <Link href="/app/capsules" className="underline hover:text-silver">See all your capsules</Link></p>}
    </div>
  );
}
