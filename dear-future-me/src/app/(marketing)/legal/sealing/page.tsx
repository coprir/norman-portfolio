import { LegalPage } from "@/components/marketing/legal";

export const metadata = { title: "How sealing works" };

export default function SealingPage() {
  return (
    <LegalPage title="How sealing works" updated="16 November 2026" intro="A time capsule is only worth something if it stays shut. This page explains, plainly, what happens when you seal one, what protects it while it waits, and where the limits of that protection are.">
      <section>
        <h2>What happens when you seal</h2>
        <ul>
          <li>You confirm a declaration that sealing is irreversible. That confirmation is recorded in the capsule's permanent history.</li>
          <li>Every photograph, video, recording, letter and message in the capsule is encrypted (AES-256-GCM) with a random key created for that capsule alone, and written to separate sealed storage.</li>
          <li>The titles and text of what's inside are encrypted too. While a capsule is sealed, our database holds only its label (title, optional description, cover image), its dates, its recipients and a fingerprint of its encrypted contents.</li>
          <li>The originals are then removed from your Memory Vault and deleted from ordinary storage.</li>
          <li>All of this happens as one step. If anything fails part-way, the partial encrypted copy is discarded and your draft and vault are left exactly as they were.</li>
        </ul>
      </section>
      <section>
        <h2>Where the key goes</h2>
        <p>The capsule's key is never stored in readable form. It is locked using the public half of a key pair, and can only be unlocked with the private half, which is held by a separate key service. The website and its administration tools hold only the public half: they can seal capsules, but have no means of opening one.</p>
        <p>The key service refuses to unlock a capsule's key before that capsule's release time, checked against its own clock.</p>
      </section>
      <section>
        <h2>While it waits</h2>
        <ul>
          <li>Nobody can open, edit, reschedule, download or delete a sealed capsule through the product: not you, not its recipients, not our support staff.</li>
          <li>These rules are enforced inside the database itself as well as in our software, so a programming mistake can't quietly bypass them. The database will reject any attempt to mark a capsule as released before its date.</li>
          <li>No thumbnails, previews or links to sealed content exist anywhere. The one image visible is the cover you chose for the outside.</li>
          <li>Recipients can see that something is waiting, who it's from and when it opens.</li>
        </ul>
      </section>
      <section>
        <h2>On the day</h2>
        <p>A background service — not your browser, and not a timer on a web page — releases the capsule at its scheduled time, whether or not anyone is signed in. Before opening it, the service checks the encrypted contents against the fingerprint recorded at sealing. If anything doesn't match, the capsule is not released and our team is alerted. Once verified, the contents are decrypted, the recipients are emailed a link, and files are served only through links that expire after five minutes.</p>
      </section>
      <section>
        <h2>What we do not claim</h2>
        <p><strong>This is not a mathematical time-lock.</strong> The protection above is strong separation of duties: the systems you interact with cannot decrypt a sealed capsule. But the people who operate the key service hold a key that could, in principle, be misused to open a capsule early, and a court could compel us to do so. We would rather tell you that than imply something stronger.</p>
        <p>We are working toward moving key release to an independently operated service and adding a second layer of publicly verifiable time-lock encryption, so that early opening would require more than one party to break their word. We will update this page when that changes, and not before.</p>
      </section>
      <section>
        <h2>The one exception: erasing your account</h2>
        <p>You have a legal right to have your data erased. If you delete your account, your sealed capsules are destroyed, still encrypted and unopened. Erasure can destroy a capsule; it can never reveal one.</p>
      </section>
    </LegalPage>
  );
}
