import { Contact, LegalPage } from "@/components/marketing/legal";

export const metadata = { title: "Data Retention Policy" };

export default function RetentionPage() {
  return (
    <LegalPage title="Data Retention Policy" updated="16 November 2026" intro="How long we keep what you give us, and what happens to it if you stop paying, leave, or if we ever have to close.">
      <section>
        <h2>While your account is open</h2>
        <ul>
          <li><strong>Vault memories</strong> are kept until you delete them.</li>
          <li><strong>Sealed capsules</strong> are kept, encrypted, until their release date, and remain available to you and their recipients after they open.</li>
          <li><strong>Unfinished uploads</strong> are removed automatically after 24 hours.</li>
          <li><strong>Security and activity records</strong> are kept for up to 24 months.</li>
          <li><strong>A capsule's history</strong> (when it was sealed, verified and released — never its contents) is kept permanently as an integrity record.</li>
        </ul>
      </section>
      <section>
        <h2>Backups</h2>
        <p>Our database and media storage are backed up on a rolling schedule and can be restored to a recent point in time. Backups are encrypted, and anything you delete leaves our backups within 35 days.</p>
      </section>
      <section>
        <h2>If you stop paying</h2>
        <p>Nothing is deleted. Your account moves to the Free plan. Capsules you have already sealed still open on their dates, and everything you can read remains viewable and downloadable. You won't be able to upload or seal anything new while you're over the Free plan's limits.</p>
      </section>
      <section>
        <h2>If you don't use your account</h2>
        <p>We do not delete accounts for inactivity while they hold sealed capsules — waiting is the point. For accounts with no sealed capsules and no sign-in for three years, we may email you, more than once and with at least 90 days' notice, before removing the account.</p>
      </section>
      <section>
        <h2>If you delete your account</h2>
        <p>Your profile, vault and capsules are erased from live systems immediately and from backups within 35 days. Sealed capsules are destroyed unopened, including ones made for other people — so please think of them first. Capsule history entries are kept without any personal content.</p>
      </section>
      <section>
        <h2>If the service ever closes</h2>
        <p>Preserving memories for decades depends on the service continuing to be funded and operated, and we won't promise “forever”. If we ever decide to close, we commit to:</p>
        <ul>
          <li>at least 90 days' notice by email to every account holder and capsule recipient;</li>
          <li>releasing every sealed capsule to its creator and recipients before closure, so nothing is lost unopened;</li>
          <li>keeping export and download available throughout the notice period;</li>
          <li>securely deleting all remaining data afterwards.</li>
        </ul>
      </section>
      <section>
        <h2>Questions</h2>
        <p>Write to us at <Contact />.</p>
      </section>
    </LegalPage>
  );
}
