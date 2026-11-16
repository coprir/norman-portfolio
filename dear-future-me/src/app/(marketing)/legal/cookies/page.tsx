import { LegalPage } from "@/components/marketing/legal";

export const metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="16 November 2026" intro="We use only the cookies needed to keep you signed in and secure. There are no advertising or cross-site tracking cookies, which is why you don't see a consent banner.">
      <section>
        <h2>Cookies we set</h2>
        <ul>
          <li><strong>Session cookie</strong> — keeps you signed in. Encrypted, HTTP-only, and removed when you sign out or after 30 days.</li>
          <li><strong>Security cookies</strong> — protect the sign-in form against forgery and remember where to return you after signing in.</li>
        </ul>
      </section>
      <section>
        <h2>Third parties</h2>
        <p>If you sign in with Google or pay for a plan, Google or our payment provider may set their own cookies on their own pages. We don't embed third-party analytics or advertising scripts.</p>
      </section>
      <section>
        <h2>Controlling cookies</h2>
        <p>You can block or delete cookies in your browser settings. If you block ours, you won't be able to stay signed in.</p>
      </section>
    </LegalPage>
  );
}
