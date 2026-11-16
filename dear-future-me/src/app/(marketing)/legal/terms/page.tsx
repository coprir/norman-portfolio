import { Contact, LegalPage, operator } from "@/components/marketing/legal";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="16 November 2026" intro={`These terms are the agreement between you and ${operator()} for using the service. We've tried to write them so they can be read.`}>
      <section>
        <h2>Your account</h2>
        <p>You must be at least 16 and give accurate details. Keep your email address current: it is how capsules reach you, sometimes many years later. You're responsible for activity on your account and for keeping your password private.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>Your memories remain yours. You give us permission to store, encrypt, process and deliver them only as needed to run the service for you. You must have the right to upload what you upload, and must not use the service for anything unlawful or to store content that exploits or endangers others. We may remove content or suspend accounts that break these rules.</p>
      </section>
      <section>
        <h2>Sealing is final</h2>
        <p>When you seal a capsule you confirm that you understand it cannot be opened, edited, rescheduled, downloaded or deleted until its release date, and that its contents are removed from your Memory Vault. We cannot reverse this for you. The only way a sealed capsule ends early is the deletion of your account, which destroys it unopened.</p>
      </section>
      <section>
        <h2>Delivery</h2>
        <p>We release capsules automatically at their scheduled time and notify recipients by email. Release normally happens within moments of the scheduled time, but we don't guarantee to-the-second delivery, and we can't guarantee an email reaches an address that has stopped working. A capsule remains available in the recipient's account after release.</p>
      </section>
      <section>
        <h2>Plans and payment</h2>
        <p>Paid plans are billed in advance and renew until cancelled. Storage and long-term safekeeping carry real, continuing costs, and subscriptions are what pay for them. If a paid plan ends, your account returns to the Free plan: nothing is deleted, sealed capsules still open on schedule and remain downloadable, but you cannot add content while over the Free limits.</p>
      </section>
      <section>
        <h2>How long we keep things, and what we don't promise</h2>
        <p>We intend to run this service for decades, and we design and budget for that. But we do not promise permanent preservation, and no honest service can. Our commitments if the service ever closes are set out in the <a href="/legal/retention">Data Retention Policy</a>. Please keep your own copies of anything irreplaceable that isn't sealed.</p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>We provide the service with reasonable care and skill. To the extent the law allows, we are not liable for indirect or consequential loss, and our total liability is limited to the amount you paid us in the twelve months before the claim. Nothing here limits rights you have as a consumer that cannot be excluded by law.</p>
      </section>
      <section>
        <h2>Ending the agreement</h2>
        <p>You can delete your account at any time. We may end or suspend an account for serious or repeated breach of these terms, with notice where practical.</p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>We'll notify you by email before material changes take effect. Questions: <Contact />.</p>
      </section>
    </LegalPage>
  );
}
