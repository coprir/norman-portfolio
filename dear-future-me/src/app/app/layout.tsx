import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { AppShell } from "@/components/app/shell";
import { getCurrentUser, isAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { DOWNLOAD_URL_TTL, storage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [unread, avatarUrl] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    user.avatarKey ? storage().signDownloadUrl(user.avatarKey, { ttlSec: DOWNLOAD_URL_TTL * 3, contentType: "image/webp" }) : null,
  ]);
  return (
    <SessionProvider>
      <AppShell me={{ name: user.name, email: user.email, emailVerified: user.emailVerified, isAdmin: isAdmin(user), avatarUrl, unread }}>{children}</AppShell>
    </SessionProvider>
  );
}
