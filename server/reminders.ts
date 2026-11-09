import { today as todayDate } from '../src/model/entry';
import { comingUp, toSend } from '../src/rules/reminders';
import type { Store } from './db';
import { reminderMail, type SendMail } from './mail';

/** Under Resend's 100 a day, with room left for reset links. Whoever doesn't fit is still unsent tomorrow. */
const PER_RUN = 50;

export interface ReminderRun {
  checked: number;
  sent: number;
  failed: number;
  /** Over today's limit: they go in the next run. */
  waiting: number;
}

/** One email per pilot, with everything coming up in it. Soonest deadline first, in case the limit is reached. */
export async function sendReminders(
  store: Store,
  sendMail: SendMail,
  appUrl: string,
  onError: (err: unknown, what: string) => void,
  today: string = todayDate(),
): Promise<ReminderRun> {
  const recipients = await store.reminderRecipients();
  const work = [];
  for (const r of recipients) {
    const book = await store.getLogbook(r.id);
    const { items, marks } = toSend(comingUp(book.entries, book.profile, today), await store.sentReminders(r.id));
    if (items.length > 0) work.push({ ...r, items, marks });
  }
  work.sort((a, b) => a.items[0]!.daysLeft - b.items[0]!.daysLeft);

  let sent = 0;
  let failed = 0;
  for (const w of work.slice(0, PER_RUN)) {
    const stop = new URL(appUrl);
    stop.hash = `stop=${w.stop}`;
    try {
      await sendMail(reminderMail(w.email, w.items, appUrl, stop.toString(), w.lang));
      // After sending: if this fails they get it twice, rather than not at all.
      await store.markReminders(w.id, w.marks);
      sent++;
    } catch (err) {
      failed++;
      onError(err, 'reminder email not sent');
    }
  }
  return { checked: recipients.length, sent, failed, waiting: Math.max(0, work.length - PER_RUN) };
}
