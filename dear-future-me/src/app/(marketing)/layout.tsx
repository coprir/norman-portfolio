import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";
import { getCurrentUser } from "@/server/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <>
      <MarketingNav signedIn={Boolean(user)} />
      <main id="main">{children}</main>
      <MarketingFooter />
    </>
  );
}
