import { Contact, LegalPage, operator } from "@/components/marketing/legal";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="16 November 2026" intro={`${operator()} keeps some of the most personal things people own. This policy explains what we collect, why, and the control you have over it.`}>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your name, email address, timezone, an optional date of birth and profile picture, and a securely hashed password.</li>
          <li><strong>Your memories:</strong> the photographs, videos, audio, documents and letters you upload, with the titles, descriptions, tags and dates you give them.</li>
          <li><strong>Capsules:</strong> their titles, dates, recipients' email addresses, and their contents (encrypted once sealed).</li>
          <li><strong>Activity records:</strong> security-relevant actions such as sign-ins, sealing and opening, with IP address, so we can protect your account and investigate problems.</li>
          <li><strong>Payment details</strong> are handled by our payment provider. We never see or store your card number.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>To provide the service you asked for: storing your memories, sealing and releasing capsules, and notifying you and your recipients. To keep accounts secure and prevent abuse. To send service emails. Our legal bases under the GDPR are performance of our contract with you, our legitimate interest in running a secure service, and your consent where we ask for it (AI features).</p>
        <p>We do not sell your data, show advertising, or use your memories to train AI models.</p>
      </section>
      <section>
        <h2>Who can see your memories</h2>
        <p>You, and the people you choose as recipients once a capsule has opened. Our staff tools show operational information only and cannot display your media. Sealed capsules are encrypted and cannot be read by the application or its administrators — see <a href="/legal/sealing">How sealing works</a>, including its limits.</p>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>We use carefully chosen providers to run the service: cloud hosting and database, private object storage for media, a transactional email provider, a payment processor, and error monitoring. If you turn on AI features, the specific content needed for a request is sent to Anthropic for processing only; it is not used for training. Providers act on our instructions under data-processing agreements, with appropriate safeguards for any transfer outside your country.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <ul>
          <li><strong>Access and portability:</strong> export your data at any time from Settings.</li>
          <li><strong>Correction:</strong> edit your profile and vault memories directly. Sealed capsules cannot be changed, by design.</li>
          <li><strong>Erasure:</strong> delete your account from Settings. This removes your vault and destroys your capsules, including sealed ones.</li>
          <li><strong>Objection, restriction and complaints:</strong> contact us at <Contact />. You may also complain to your local data protection authority.</li>
        </ul>
      </section>
      <section>
        <h2>Security</h2>
        <p>Data is encrypted in transit and at rest. Media is kept in private storage and served only through short-lived signed links after an access check. Passwords are hashed. Access to production systems is restricted and logged. No system is perfectly secure; if a breach affects you, we will tell you promptly.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>The service is for people aged 16 and over. Capsules may of course be made <em>for</em> a child, to be opened when they are older.</p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>We'll email you about any material change to this policy before it takes effect. Questions: <Contact />. See also our <a href="/legal/retention">Data Retention Policy</a> and <a href="/legal/cookies">Cookie Policy</a>.</p>
      </section>
    </LegalPage>
  );
}
