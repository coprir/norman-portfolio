import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { formatInZone } from "@/lib/time/release";
import { getCurrentUser } from "@/server/auth/session";
import { acceptInviteToken, peekInvite } from "@/server/capsules/service";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "You're invited", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  const invite = /^[\w-]{20,100}$/.test(token) ? await peekInvite(token) : null;

  if (invite && user) {
    let capsuleId: string | null = null;
    try {
      capsuleId = (await acceptInviteToken(user, token)).capsuleId;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
    if (capsuleId) redirect(invite.released ? `/app/capsules/${capsuleId}/open` : `/app/capsules/${capsuleId}`);
  }

  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div className="starfield absolute inset-0 -z-10 opacity-50" />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8"><Link href="/" aria-label="Dear Future Me — home"><Logo /></Link></header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md text-center">
          {invite ? (
            <>
              <p className="eyebrow">{invite.released ? "It's time" : invite.draft ? "You're invited to add to" : "Something is waiting for you"}</p>
              <h1 className="display mt-4 text-5xl">{invite.title}</h1>
              <p className="mt-4 text-lg text-silver">
                {invite.released
                  ? `${invite.creatorName} sealed this for you some time ago. It's ready to open.`
                  : invite.draft
                    ? `${invite.creatorName} is putting together a time capsule and would like you to add your own memories before it's sealed.`
                    : `${invite.creatorName} has sealed a time capsule for you.${invite.unlockAt ? ` It opens on ${formatInZone(invite.unlockAt, invite.timezone)}.` : ""} Nobody can see inside until then.`}
              </p>
              <div className="mt-9 flex flex-col gap-2.5">
                <LinkButton href={`/register?next=${next}`} size="lg">Create an account to {invite.released ? "open it" : "accept"}</LinkButton>
                <LinkButton href={`/login?next=${next}`} variant="secondary" size="lg">I already have an account</LinkButton>
              </div>
            </>
          ) : (
            <>
              <h1 className="display text-5xl">This invitation isn't valid.</h1>
              <p className="mt-4 text-silver">It may have been used already. If you've accepted it before, sign in and you'll find the capsule waiting.</p>
              <div className="mt-9"><LinkButton href={user ? "/app/capsules" : "/login"}>{user ? "Go to your capsules" : "Sign in"}</LinkButton></div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
