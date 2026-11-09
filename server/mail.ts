import { translator, type Lang } from '../src/i18n';
import { dateText } from '../src/model/entry';
import type { Due } from '../src/rules/reminders';

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

const page = (body: string) => `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f141b">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e1e4e9;border-radius:10px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:#0e7490">Hours to Go</p>
${body}
</div></body></html>`;

const button = (link: string, label: string) =>
  `<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0e7490;color:#fff;font-weight:700;text-decoration:none">${label}</a></p>`;

export function resetMail(to: string, link: string, minutes: number, language: Lang = 'en'): Mail {
  const tr = translator(language);
  const who = tr('Someone asked to reset the password for the Hours to Go profile with this email address.');
  const open = tr('To choose a new password, open this link in the next {minutes} minutes. It works once.', { minutes });
  const ignore = tr('If it wasn’t you, ignore this email. Your password stays as it is.');
  const text = [who, '', open, link, '', ignore].join('\n');
  // The link goes in as given: it is built from APP_URL and a base64url token, so it has no
  // characters that need escaping in HTML.
  const html = page(`<p style="margin:0 0 16px">${who}</p>
<p style="margin:0 0 24px">${open}</p>
${button(link, tr('Choose a new password'))}
<p style="margin:0;color:#5b6573;font-size:14px">${ignore}</p>`);
  return { to, subject: tr('Reset your Hours to Go password'), text, html };
}

/**
 * The link that confirms an address: the one a pilot signed up with, or, for a `change`, one they
 * are moving to. A change doesn't name the old address: a mistyped new one reaches a stranger.
 */
export function confirmMail(to: string, link: string, days: number, change: boolean, language: Lang = 'en'): Mail {
  const tr = translator(language);
  const why = change
    ? tr('Someone asked to move a Hours to Go profile to this email address.')
    : tr('Thanks for creating a Hours to Go profile. Confirm that this is your email address, so that a password reset can reach you if you ever need one.');
  const open = tr('Open this link in the next {days} days. It works once.', { days });
  const until = change ? ` ${tr('Until you do, the profile keeps its old address.')}` : '';
  const ignore = change ? tr('If it wasn’t you, ignore this email and nothing changes.') : tr('If you didn’t create a profile, ignore this email.');
  const text = [why, '', `${open}${until}`, link, '', ignore].join('\n');
  // As in the reset email, the link needs no escaping: APP_URL and a base64url token.
  const html = page(`<p style="margin:0 0 16px">${why}</p>
<p style="margin:0 0 24px">${open}${until}</p>
${button(link, change ? tr('Use this email') : tr('Confirm my email'))}
<p style="margin:0;color:#5b6573;font-size:14px">${ignore}</p>`);
  return { to, subject: change ? tr('Confirm your new email for Hours to Go') : tr('Confirm your email for Hours to Go'), text, html };
}

/** What's coming up, soonest first, to a pilot who turned reminders on. */
export function reminderMail(to: string, items: readonly Due[], appLink: string, stopLink: string, language: Lang = 'en'): Mail {
  const tr = translator(language);
  const when = (days: number) => (days === 0 ? tr('today') : days === 1 ? tr('tomorrow') : tr('in {days} days', { days }));
  const first = items[0]!;
  const subject = items.length === 1 ? tr('{what} runs out {when}', { what: tr(first.what), when: when(first.daysLeft) }) : tr('{n} things run out soon, the first {when}', { n: items.length, when: when(first.daysLeft) });
  const lead = tr('Coming up in your Hours to Go profile:');
  const check = tr('Worked out from the dates in your profile, so check them against your own documents.');
  const why = tr('You turned these reminders on in your Hours to Go profile.');
  const lastDay = (d: Due) => tr('last day {date}', { date: dateText(d.until, language) });
  const text = [lead, '', ...items.map((d) => `- ${tr('{label}: {value}', { label: tr(d.what), value: `${lastDay(d)} (${when(d.daysLeft)})` })}`), '', check, appLink, '', `${why} ${tr('To stop them:')} ${stopLink}`].join('\n');
  // As in the other emails, the links need no escaping: APP_URL and a base64url token.
  const rows = items.map((d) => `<li style="margin:0 0 8px"><strong>${escapeHtml(tr(d.what))}</strong><br>${escapeHtml(lastDay(d))} (${when(d.daysLeft)})</li>`).join('');
  const html = page(`<p style="margin:0 0 12px">${lead}</p>
<ul style="margin:0 0 16px;padding:0 0 0 20px">${rows}</ul>
<p style="margin:0 0 24px">${check}</p>
${button(appLink, tr('Open Hours to Go'))}
<p style="margin:0;color:#5b6573;font-size:14px">${why} <a href="${stopLink}" style="color:#0e7490">${tr('Stop these reminders')}</a></p>`);
  return { to, subject, text, html };
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** A pilot's own words go into the HTML as text, never as markup. */
/** To the address a profile has just left, in case that wasn't the pilot's doing. */
export function emailChangedMail(to: string, now: string, contact: string | undefined, language: Lang = 'en'): Mail {
  const tr = translator(language);
  const what = tr('The Hours to Go profile that used this email address now uses {email}.', { email: now });
  const fine = tr('If that was you, there’s nothing to do.');
  const help = contact ? ` ${tr('If it wasn’t you, write to {contact} right away.', { contact })}` : '';
  const text = [what, '', `${fine}${help}`].join('\n');
  const html = page(`<p style="margin:0 0 16px">${escapeHtml(what)}</p>
<p style="margin:0">${escapeHtml(`${fine}${help}`)}</p>`);
  return { to, subject: tr('Your Hours to Go email was changed'), text, html };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/**
 * To the owner: something failed that the pilot didn't cause. What was asked and the error's
 * stack, never the request's body, which can hold a password.
 */
export function alertMail(to: string, what: string, err: unknown, when: Date, perHour: number): Mail {
  const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
  const text = [
    `Something failed on the Hours to Go server at ${when.toISOString()}.`,
    '',
    what,
    '',
    detail,
    '',
    `At most ${perHour} of these are sent an hour. Render’s logs (hours-to-go-api → Logs) have every one.`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;color:#0f141b">
<pre style="margin:0;white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace">${escapeHtml(text)}</pre>
</body></html>`;
  return { to, subject: `Hours to Go: ${what}`, text, html };
}

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
