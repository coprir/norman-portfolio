import { env } from "../env";

export type EmailContent = { template: string; subject: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MARK = `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M26.4 9.5A12 12 0 1 0 28 16" stroke="#F5F6FA" stroke-width="2" stroke-linecap="round"/><circle cx="26.4" cy="9.5" r="2.2" fill="#648BFF"/><rect x="12.5" y="9" width="7" height="14" rx="3.5" stroke="#F5F6FA" stroke-width="2"/><path d="M12.5 16h7" stroke="#F5F6FA" stroke-width="2"/></svg>`;

/** One layout for every email: dark, quiet, a single action. */
function layout(opts: { preheader: string; paragraphs: string[]; cta?: { label: string; url: string }; signoff?: string; footnote?: string }) {
  const body = opts.paragraphs
    .map((p) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#C9CEDC;">${p}</p>`)
    .join("");
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 28px;"><tr><td style="border-radius:999px;background:#F5F6FA;"><a href="${esc(opts.cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#080A12;text-decoration:none;">${esc(opts.cta.label)}</a></td></tr></table>`
    : "";
  const signoff = opts.signoff
    ? `<p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:17px;line-height:1.6;color:#F5F6FA;">${esc(opts.signoff)}</p>`
    : "";
  const footnote = opts.footnote
    ? `<p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#7C849B;">${opts.footnote}</p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Dear Future Me</title></head>
<body style="margin:0;padding:0;background:#080A12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080A12;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;">${MARK}</td><td style="vertical-align:middle;padding-left:10px;font-size:14px;letter-spacing:0.14em;font-weight:600;color:#F5F6FA;">DEAR FUTURE ME</td></tr></table></td></tr>
<tr><td style="background:#101629;border:1px solid #1E2538;border-radius:20px;padding:36px 32px;">${body}${cta}${signoff}${footnote}</td></tr>
<tr><td style="padding:24px 4px 0;font-size:12px;line-height:1.6;color:#5E6680;">Capture today. Meet yourself tomorrow.<br>You're receiving this because of activity on your Dear Future Me account. Manage email preferences in <a href="${env.appUrl}/app/settings" style="color:#7C849B;">Settings</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

const text = (lines: string[], cta?: { label: string; url: string }, signoff?: string) =>
  [...lines, cta ? `${cta.label}: ${cta.url}` : "", signoff ?? "", "", "Dear Future Me — Capture today. Meet yourself tomorrow."]
    .filter((l) => l !== "")
    .join("\n\n");

export function verifyEmail(name: string, token: string): EmailContent {
  const cta = { label: "Confirm my email", url: `${env.appUrl}/verify-email?token=${token}` };
  const lines = [`Dear ${name},`, "Welcome. Please confirm this is your email address so your capsules can find you when the time comes.", "This link works for 24 hours."];
  return {
    template: "verify-email",
    subject: "Confirm your email",
    html: layout({ preheader: "One step before you can lock your first capsule.", paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

export function passwordReset(name: string, token: string): EmailContent {
  const cta = { label: "Choose a new password", url: `${env.appUrl}/reset-password?token=${token}` };
  const lines = [`Dear ${name},`, "Someone asked to reset the password for your account. If that was you, choose a new one below. The link works for one hour.", "If it wasn't you, you can ignore this email — your password hasn't changed."];
  return {
    template: "password-reset",
    subject: "Reset your password",
    html: layout({ preheader: "Choose a new password for Dear Future Me.", paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

export function capsuleLocked(name: string, capsule: { id: string; title: string }, unlockLabel: string): EmailContent {
  const cta = { label: "See your timeline", url: `${env.appUrl}/app/capsules/${capsule.id}` };
  const lines = [`Dear ${name},`, `Your capsule “${capsule.title}” is sealed.`, `It will open on ${unlockLabel}. Until then nobody can see inside — not even you. We'll write to you when it's time.`];
  return {
    template: "capsule-locked",
    subject: `“${capsule.title}” is sealed`,
    html: layout({ preheader: `Opens ${unlockLabel}.`, paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

export function capsuleReminder(name: string, capsule: { id: string; title: string }, when: string): EmailContent {
  const cta = { label: "View the countdown", url: `${env.appUrl}/app/capsules/${capsule.id}` };
  const lines = [`Dear ${name},`, `“${capsule.title}” opens ${when}.`, "Something you set aside is nearly here."];
  return {
    template: "capsule-reminder",
    subject: `“${capsule.title}” opens ${when}`,
    html: layout({ preheader: "A capsule is about to open.", paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

/** The unlock email. Contains a link only — never the media itself. */
export function capsuleUnlocked(opts: { name: string; capsule: { id: string; title: string }; fromSelf: boolean; creatorName: string; inviteToken?: string }): EmailContent {
  const url = opts.inviteToken ? `${env.appUrl}/invite/${opts.inviteToken}` : `${env.appUrl}/app/capsules/${opts.capsule.id}/open`;
  const cta = { label: "Open your capsule", url };
  const lines = opts.fromSelf
    ? [
        `Dear ${opts.name},`,
        "A moment you saved in the past is ready to meet you again.",
        `You created a time capsule called “${opts.capsule.title}”.`,
        "Today is the day it becomes available.",
        "Open Dear Future Me and rediscover the person you were when you created it.",
      ]
    : [
        `Dear ${opts.name},`,
        `${opts.creatorName} set something aside for you, to be opened today.`,
        `The time capsule is called “${opts.capsule.title}”.`,
        "It's ready whenever you are.",
      ];
  const signoff = opts.fromSelf ? "With love from your past self." : `With love, from ${opts.creatorName} — some time ago.`;
  return {
    template: "capsule-unlocked",
    subject: opts.fromSelf ? "A message from your past is waiting." : `${opts.creatorName} left something for you to open today.`,
    html: layout({
      preheader: `“${opts.capsule.title}” is ready to open.`,
      paragraphs: lines.map(esc),
      cta,
      signoff,
      footnote: "For your privacy, memories are never attached to emails. This link opens the capsule after you sign in.",
    }),
    text: text(lines, cta, signoff),
  };
}

export function capsuleInvite(opts: { name: string; creatorName: string; capsule: { title: string }; unlockLabel: string; canContribute: boolean; inviteToken: string }): EmailContent {
  const cta = { label: opts.canContribute ? "Accept and add a memory" : "Accept the invitation", url: `${env.appUrl}/invite/${opts.inviteToken}` };
  const lines = [
    `Dear ${opts.name},`,
    `${opts.creatorName} has included you in a time capsule called “${opts.capsule.title}”.`,
    opts.canContribute ? `It will open on ${opts.unlockLabel}.` : `It opens on ${opts.unlockLabel}. Nobody can see inside until then.`,
    opts.canContribute ? "You're invited to add your own photographs, videos or a note before it is sealed. Once sealed, nothing can be added or seen until it opens." : "Accept the invitation and we'll let you know when it's time.",
  ];
  return {
    template: "capsule-invite",
    subject: `${opts.creatorName} invited you to a time capsule`,
    html: layout({ preheader: `Opens ${opts.unlockLabel}.`, paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

export function capsuleContribution(name: string, contributorName: string, capsule: { id: string; title: string }): EmailContent {
  const cta = { label: "View the capsule", url: `${env.appUrl}/app/capsules/${capsule.id}` };
  const lines = [`Dear ${name},`, `${contributorName} added something to “${capsule.title}”.`, "Preview it before you seal the capsule. After sealing, nobody sees it again until the capsule opens."];
  return {
    template: "capsule-contribution",
    subject: `${contributorName} added to “${capsule.title}”`,
    html: layout({ preheader: "A new contribution is waiting in your draft.", paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}

export function storageWarning(name: string, percent: number): EmailContent {
  const cta = { label: "Review your storage", url: `${env.appUrl}/app/settings#plan` };
  const lines = [`Dear ${name},`, `You've used ${percent}% of your storage.`, "Everything you've saved stays safe. To keep adding memories, free up some space or move to a larger plan."];
  return {
    template: "storage-warning",
    subject: "You're close to your storage limit",
    html: layout({ preheader: `${percent}% of your storage is in use.`, paragraphs: lines.map(esc), cta }),
    text: text(lines, cta),
  };
}
