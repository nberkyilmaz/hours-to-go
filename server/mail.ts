export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a reply goes, when not to the sender: the pilot, on feedback. */
  replyTo?: string;
}

/** Sends one email. Resend in production; on a laptop the message is printed instead. */
export type SendMail = (mail: Mail) => Promise<void>;

/** Resend's HTTP API: one request per email, so no SDK. `from` must be on a domain verified there. */
export function resend(apiKey: string, from: string): SendMail {
  return async (mail) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, reply_to: mail.replyTo }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text().catch(() => '')}`);
  };
}

/** For development: the email, link and all, goes to the terminal. */
export function printMail(mail: Mail): Promise<void> {
  const replyTo = mail.replyTo ? ` (reply to ${mail.replyTo})` : '';
  console.log(`\n--- email to ${mail.to}${replyTo}: ${mail.subject}\n${mail.text}\n---\n`);
  return Promise.resolve();
}

export function resetMail(to: string, link: string, minutes: number): Mail {
  const text = [
    'Someone asked to reset the password for the Hours to Go profile with this email address.',
    '',
    `To choose a new password, open this link in the next ${minutes} minutes. It works once.`,
    link,
    '',
    'If it wasn’t you, ignore this email. Your password stays as it is.',
  ].join('\n');
  // The link goes in as given: it is built from APP_URL and a base64url token, so it has no
  // characters that need escaping in HTML.
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f141b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e1e4e9;border-radius:10px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:#0e7490">Hours to Go</p>
<p style="margin:0 0 16px">Someone asked to reset the password for the Hours to Go profile with this email address.</p>
<p style="margin:0 0 24px">To choose a new password, open this link in the next ${minutes} minutes. It works once.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0e7490;color:#fff;font-weight:700;text-decoration:none">Choose a new password</a></p>
<p style="margin:0;color:#5b6573;font-size:14px">If it wasn’t you, ignore this email. Your password stays as it is.</p>
</div></body></html>`;
  return { to, subject: 'Reset your Hours to Go password', text, html };
}

/**
 * The link that confirms an address: the one a pilot signed up with, or, for a `change`, one they
 * are moving to. A change doesn't name the old address: a mistyped new one reaches a stranger.
 */
export function confirmMail(to: string, link: string, days: number, change: boolean): Mail {
  const why = change
    ? 'Someone asked to move a Hours to Go profile to this email address.'
    : 'Thanks for creating a Hours to Go profile. Confirm that this is your email address, so that a password reset can reach you if you ever need one.';
  const until = change ? 'Until you do, the profile keeps its old address.' : '';
  const ignore = change ? 'If it wasn’t you, ignore this email and nothing changes.' : 'If you didn’t create a profile, ignore this email.';
  const text = [why, '', `Open this link in the next ${days} days. It works once. ${until}`.trim(), link, '', ignore].join('\n');
  // As in the reset email, the link needs no escaping: APP_URL and a base64url token.
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f141b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e1e4e9;border-radius:10px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:#0e7490">Hours to Go</p>
<p style="margin:0 0 16px">${why}</p>
<p style="margin:0 0 24px">Open this link in the next ${days} days. It works once. ${until}</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0e7490;color:#fff;font-weight:700;text-decoration:none">${change ? 'Use this email' : 'Confirm my email'}</a></p>
<p style="margin:0;color:#5b6573;font-size:14px">${ignore}</p>
</div></body></html>`;
  return { to, subject: change ? 'Confirm your new email for Hours to Go' : 'Confirm your email for Hours to Go', text, html };
}

const HTML_ESCAPES: Record<string, string> ={ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** A pilot's own words go into the HTML as text, never as markup. */
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

export interface Feedback {
  message: string;
  /** The pilot's address, to reply to: their profile's, or one they typed. */
  from: string | null;
  signedIn: boolean;
  /** The browser's User-Agent, which helps when the message is about something not working. */
  browser: string;
}

/** A pilot's message, to the owner. Replying in the inbox answers the pilot, when they gave an address. */
export function feedbackMail(to: string, f: Feedback): Mail {
  const firstLine = f.message.split('\n')[0]!.trim();
  const subject = `Feedback: ${firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine}`;
  const who = `${f.from ?? 'No email given, so no reply possible'} (${f.signedIn ? 'signed in' : 'not signed in'})`;
  const text = [f.message, '', '---', `From: ${who}`, `Browser: ${f.browser || 'not given'}`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f141b">
<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(f.message)}</p>
<p style="margin:0;padding-top:12px;border-top:1px solid #e1e4e9;color:#5b6573;font-size:14px">From: ${escapeHtml(who)}<br>Browser: ${escapeHtml(f.browser || 'not given')}</p>
</body></html>`;
  return { to, subject, text, html, ...(f.from ? { replyTo: f.from } : {}) };
}
