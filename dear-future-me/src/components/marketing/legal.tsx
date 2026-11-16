export const operator = () => process.env.LEGAL_ENTITY_NAME || "Dear Future Me";
export const contact = () => process.env.CONTACT_EMAIL || null;

export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-5 pb-28 pt-32 sm:px-8">
      <p className="eyebrow">Last updated {updated}</p>
      <h1 className="display mt-4 text-5xl sm:text-6xl">{title}</h1>
      {intro && <p className="mt-6 text-lg leading-relaxed text-silver">{intro}</p>}
      <div className="mt-12 space-y-10 leading-relaxed text-silver [&_a]:text-paper [&_a]:underline [&_a]:underline-offset-4 [&_h2]:font-serif [&_h2]:text-3xl [&_h2]:text-paper [&_li]:mt-2 [&_p]:mt-3 [&_strong]:font-medium [&_strong]:text-paper [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </article>
  );
}

export function Contact() {
  const email = contact();
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>the contact address shown in your account emails</>;
}
