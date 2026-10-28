export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email. Resend in production; on a laptop the message is printed instead. */
export type SendMail = (mail: Mail) => Promise<void>;

/** Resend's HTTP API: one request per email, so no SDK. `from` must be on a domain verified there. */
export function resend(apiKey: string, from: string): SendMail {
  return async (mail) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text().catch(() => '')}`);
  };
}

/** For development: the email, link and all, goes to the terminal. */
export function printMail(mail: Mail): Promise<void> {
  console.log(`\n--- email to ${mail.to}: ${mail.subject}\n${mail.text}\n---\n`);
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
