import { ArrowRight, Fingerprint, KeyRound, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import { CapsuleVisual } from "@/components/capsule/capsule";
import { CapsuleDemo } from "@/components/marketing/demo";
import { PlanCards } from "@/components/marketing/plans";
import { Rise } from "@/components/marketing/reveal-on-scroll";
import { LinkButton } from "@/components/ui/button";

export const revalidate = 300;

const steps = [
  { n: "01", title: "Capture your moment", body: "Add photographs, videos and voice recordings, or simply write. Use what's already in your vault or record something new." },
  { n: "02", title: "Seal your memory", body: "Choose the day it opens — tomorrow, a birthday, an anniversary, twenty years from now — and who it's for." },
  { n: "03", title: "Let time pass", body: "Once sealed, nobody can look inside, change it or bring the date forward. Not even you." },
  { n: "04", title: "Reconnect", body: "On the day, we write to you. Open it and meet the person you were when you made it." },
];

const timeline = [
  { when: "Today", title: "You seal “The year we moved”", note: "32 photographs, one letter", state: "sealed" },
  { when: "In 1 year", title: "A voice note to yourself", note: "Opens on your birthday", state: "locked" },
  { when: "In 5 years", title: "Graduation, with the five of you", note: "Shared with four friends", state: "locked" },
  { when: "In 13 years", title: "For Maya, on her 18th", note: "From Mum and Dad", state: "locked" },
];

const faqs = [
  {
    q: "Can I open a capsule early if I change my mind?",
    a: "No. Sealing is final. Once you confirm, the capsule can't be opened, edited, rescheduled, downloaded or deleted by you until its date, and our support team can't do it for you either. That's the whole point: the wait is what gives it meaning.",
  },
  {
    q: "What happens to the photos and videos I put inside?",
    a: "They're moved out of your Memory Vault and sealed. You won't see them again until the capsule opens, when everything is restored exactly as you left it and you can download it.",
  },
  {
    q: "Is it really impossible for anyone to read a sealed capsule?",
    a: "We'd rather be precise than impressive. Every capsule is encrypted with its own key, and the key needed to unlock it is held by a separate key service that refuses to release it before the unlock date. The website and its staff tools have no way to decrypt a sealed capsule. But a person operating that key service could, in principle, misuse it. We don't claim mathematically guaranteed time-locking, and we publish exactly how sealing works.",
  },
  {
    q: "Do I need to keep the app open, or log in, for a capsule to unlock?",
    a: "No. Capsules are released by our servers at the scheduled time whether or not you're signed in, and we email you when it happens.",
  },
  {
    q: "What if I stop paying?",
    a: "Nothing you've sealed is lost. Your account returns to the Free plan: capsules already sealed still open on their dates, and you can still view and download everything. You just can't add more until you're back within the Free limits.",
  },
  {
    q: "What if Dear Future Me shuts down?",
    a: "Keeping memories for decades costs money every year, and we won't pretend otherwise. If we ever have to close, we commit to at least 90 days' notice by email, and to releasing every sealed capsule to its owner and recipients for download before the service ends. The details are in our data retention policy.",
  },
  {
    q: "Can the person I'm sending it to see it before the date?",
    a: "They can see that something is waiting for them, who it's from, and when it opens. Nothing more.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* 1 — Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div className="starfield absolute inset-0 -z-20 opacity-70" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_70%_42%,rgb(100_139_255/0.16),transparent_70%)]" />
        <CapsuleVisual className="absolute inset-x-0 top-[7svh] -z-10 h-[42svh] lg:bottom-0 lg:left-[40%] lg:top-0 lg:h-auto" />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pb-10 pt-[46svh] sm:px-8 lg:justify-center lg:pb-0 lg:pt-16">
          <div className="max-w-xl">
            <p className="eyebrow">Digital time capsules</p>
            <h1 className="display mt-4 text-[2.9rem] sm:text-7xl lg:text-[5.6rem]">
              To the person <em className="italic text-[#c9d4ff]">you&apos;ll become.</em>
            </h1>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed text-silver sm:text-lg">Capture your moments today. Lock them away. Rediscover them when the time is right.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-9">
              <LinkButton href="/register" size="lg">
                Create Your First Capsule <ArrowRight className="size-4" />
              </LinkButton>
              <LinkButton href="#demo" variant="secondary" size="lg">Explore the Experience</LinkButton>
            </div>
          </div>
        </div>
        <p className="mx-auto hidden w-full max-w-6xl px-8 pb-8 text-xs text-mute lg:block">Free to start · No card required</p>
      </section>

      {/* 2 — The concept */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-36">
        <Rise>
          <p className="eyebrow">The idea</p>
          <h2 className="display mt-5 max-w-4xl text-4xl sm:text-6xl">Memories today, delivered tomorrow.</h2>
        </Rise>
        <Rise delay={120} className="mt-10 grid gap-10 text-lg leading-relaxed text-silver md:grid-cols-2 md:gap-16">
          <p>A photo you took this morning means one thing now. In ten years it will mean something else entirely — the flat you'd forgotten, the voice you'd lost, the worry that turned out fine.</p>
          <p>Dear Future Me keeps a moment sealed until the day you choose, then hands it back. It isn't a gallery or a feed. It's a way of writing to someone you haven't met yet.</p>
        </Rise>
      </section>

      {/* 3 — How it works */}
      <section id="how" className="scroll-mt-20 border-y border-line bg-navy/40">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <Rise>
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-5 text-4xl sm:text-5xl">Four steps, one of them is waiting.</h2>
          </Rise>
          <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.n}>
                <Rise delay={i * 90}>
                  <span className="font-serif text-5xl text-white/25">{s.n}</span>
                  <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-silver">{s.body}</p>
                </Rise>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Interactive demonstration */}
      <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Rise>
          <p className="eyebrow">Try it</p>
          <h2 className="display mt-5 max-w-2xl text-4xl sm:text-5xl">Seal one sentence and watch ten years go by.</h2>
        </Rise>
        <Rise delay={120} className="mt-12">
          <CapsuleDemo />
        </Rise>
      </section>

      {/* 5 + 6 — Vault and letters */}
      <section className="mx-auto grid max-w-6xl gap-5 px-5 pb-24 sm:px-8 sm:pb-32 lg:grid-cols-2">
        <Rise className="flex flex-col justify-between rounded-[2rem] border border-line bg-white/[0.02] p-8 sm:p-10">
          <div>
            <p className="eyebrow">Your Memory Vault</p>
            <h2 className="display mt-5 text-4xl">A private place for the things worth keeping.</h2>
            <p className="mt-5 leading-relaxed text-silver">Photographs, videos, voice recordings and documents, organised by the chapters of your life. View them whenever you like — until you choose to seal some of them away.</p>
          </div>
          <div className="mt-10 grid grid-cols-4 gap-2" aria-hidden="true">
            {["from-[#2b3564] to-[#141a30]", "from-[#3b2f66] to-[#16132b]", "from-[#1f3a5c] to-[#101a2b]", "from-[#4a3a55] to-[#1c1626]", "from-[#243b4f] to-[#101922]", "from-[#30305f] to-[#12122a]", "from-[#3a2c4e] to-[#171224]", "from-[#22335e] to-[#0f152b]"].map((g, i) => (
              <div key={i} className={`aspect-square rounded-xl bg-gradient-to-br ${g}`} />
            ))}
          </div>
        </Rise>
        <Rise delay={120} className="flex flex-col justify-between rounded-[2rem] border border-line bg-[#f3efe6] p-8 text-[#1c1a17] sm:p-10">
          <div>
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-[#8a8275]">Dear future me</p>
            <h2 className="display mt-5 text-4xl">Write to yourself. Answer again when it opens.</h2>
            <p className="mt-5 leading-relaxed text-[#5b554b]">Answer a few honest questions about your life today. Years later you'll read your answers, respond to the same questions, and see what changed.</p>
          </div>
          <div className="mt-10 space-y-5 font-serif text-[1.35rem] leading-snug">
            <p className="italic text-[#8a8275]">What do you hope never changes?</p>
            <p>“Sunday mornings. The four of us, and nowhere to be.”</p>
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-[#8a8275]">Sealed 14 March · opens in 5 years</p>
          </div>
        </Rise>
      </section>

      {/* 7 — Family and shared capsules */}
      <section id="shared" className="scroll-mt-20 border-y border-line bg-navy/40">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Rise>
            <p className="eyebrow">For someone else</p>
            <h2 className="display mt-5 text-4xl sm:text-5xl">Some things are meant to be opened by someone you love.</h2>
            <p className="mt-6 max-w-md leading-relaxed text-silver">Make a capsule for a child, a partner, or a group of friends. Invite people to add their own memories before it's sealed. Everyone is told the moment it opens.</p>
          </Rise>
          <Rise delay={120} className="divide-y divide-line rounded-[2rem] border border-line bg-ink/60">
            {[
              ["For your child", "A message recorded tonight, opened on their eighteenth birthday."],
              ["For the two of you", "Photographs from your first year, opened on your tenth anniversary."],
              ["For the five of you", "Everyone's graduation videos, opened together five years on."],
              ["For the family", "Grandparents' stories in their own voices, kept for the next generation."],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-4 p-6">
                <Users className="mt-0.5 size-5 shrink-0 text-violet" aria-hidden="true" />
                <div>
                  <h3 className="font-medium">{t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-silver">{d}</p>
                </div>
              </div>
            ))}
          </Rise>
        </div>
      </section>

      {/* 8 — The future timeline */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <Rise>
          <p className="eyebrow">The Time Machine</p>
          <h2 className="display mt-5 max-w-3xl text-4xl sm:text-5xl">Your life on one line — behind you and ahead.</h2>
          <p className="mt-6 max-w-xl leading-relaxed text-silver">Scroll back through what you've kept, and forward to what's waiting. You'll always know something is coming, and exactly when.</p>
        </Rise>
        <ol className="relative mt-14 space-y-4 before:absolute before:bottom-6 before:left-[0.6rem] before:top-6 before:w-px before:bg-gradient-to-b before:from-paper before:via-line-strong before:to-transparent sm:before:left-[9.1rem]">
          {timeline.map((t, i) => (
            <li key={t.title}>
              <Rise delay={i * 80} className="relative grid gap-1 pl-9 sm:grid-cols-[8rem_1fr] sm:gap-10 sm:pl-0">
                <span className="tnum pt-5 text-sm text-mute sm:text-right">{t.when}</span>
                <span className={`absolute left-[0.6rem] top-6 size-2.5 -translate-x-1/2 rounded-full sm:left-[9.1rem] ${t.state === "sealed" ? "bg-paper" : "border border-silver bg-ink"}`} aria-hidden="true" />
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white/[0.02] px-5 py-4">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-0.5 text-sm text-mute">{t.note}</p>
                  </div>
                  <Lock className="size-4 shrink-0 text-mute" aria-label="Sealed" />
                </div>
              </Rise>
            </li>
          ))}
        </ol>
      </section>

      {/* 9 — Privacy and security */}
      <section id="privacy" className="scroll-mt-20 border-y border-line bg-navy/40">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <Rise>
            <p className="eyebrow">Privacy and security</p>
            <h2 className="display mt-5 max-w-3xl text-4xl sm:text-5xl">Sealed means sealed — and we'll tell you exactly what that means.</h2>
          </Rise>
          <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [Lock, "Encrypted, one key per capsule", "When you seal a capsule its contents are encrypted with a key made only for it, and moved to separate sealed storage."],
              [KeyRound, "The key is kept somewhere else", "The key that can open a capsule is held by a separate key service that won't release it before the date. The website can't decrypt a sealed capsule."],
              [ShieldCheck, "No previews, no back door", "No thumbnails, links or admin screens show what's inside a sealed capsule. After it opens, files are served through links that expire in minutes."],
              [Fingerprint, "A permanent, tamper-evident record", "Every capsule keeps a chained history of when it was sealed, verified and released. Its contents are checked against their fingerprint before opening."],
              [Mail, "Links in email, never your media", "We email you a link when a capsule opens. Your photographs and videos are never attached to an email."],
              [Users, "Yours to take or erase", "Export everything you can read at any time, or delete your account and all of its data. We never use your memories to train AI."],
            ].map(([Icon, title, body], i) => {
              const I = Icon as typeof Lock;
              return (
                <Rise key={title as string} delay={(i % 3) * 80}>
                  <I className="size-5 text-blue" aria-hidden="true" />
                  <h3 className="mt-4 font-medium">{title as string}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-silver">{body as string}</p>
                </Rise>
              );
            })}
          </div>
          <Rise className="mt-14 max-w-3xl rounded-2xl border border-line bg-ink/50 p-6 text-sm leading-relaxed text-silver">
            <strong className="font-medium text-paper">What we don't claim.</strong> This is strong, deliberate separation — not a mathematical time-lock. The people who operate the key service could in principle misuse it, and we won't tell you otherwise. <a href="/legal/sealing" className="text-paper underline decoration-line-strong underline-offset-4 hover:decoration-paper">Read how sealing works</a>.
          </Rise>
        </div>
      </section>

      {/* 10 — Plans */}
      <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Rise>
          <p className="eyebrow">Plans</p>
          <h2 className="display mt-5 text-4xl sm:text-5xl">Start free. Grow when your archive does.</h2>
          <p className="mt-6 max-w-2xl leading-relaxed text-silver">Keeping your memories safe for years means storage, backups and people to look after them, every year. Paid plans are what fund that — which is why we charge for space rather than promising “forever” for nothing.</p>
        </Rise>
        <Rise delay={120} className="mt-12">
          <PlanCards />
        </Rise>
      </section>

      {/* 11 — Questions */}
      <section id="faq" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 sm:py-32 lg:grid-cols-[0.8fr_1.2fr]">
          <Rise>
            <p className="eyebrow">Questions</p>
            <h2 className="display mt-5 text-4xl sm:text-5xl">Things people ask before they seal one.</h2>
          </Rise>
          <div className="divide-y divide-line border-y border-line">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[1.05rem] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-silver transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pb-6 leading-relaxed text-silver">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 12 — Final call */}
      <section className="relative isolate overflow-hidden border-t border-line">
        <div className="starfield absolute inset-0 -z-10 opacity-60" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_70%_at_50%_100%,rgb(156_134_255/0.14),transparent_70%)]" />
        <div className="mx-auto max-w-3xl px-5 py-28 text-center sm:px-8 sm:py-40">
          <Rise>
            <h2 className="display text-5xl sm:text-7xl">Your past has something to tell you.</h2>
            <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-silver">Leave something for the future. It takes a few minutes today.</p>
            <LinkButton href="/register" size="lg" className="mt-10">
              Create Your First Capsule <ArrowRight className="size-4" />
            </LinkButton>
          </Rise>
        </div>
      </section>
    </>
  );
}
