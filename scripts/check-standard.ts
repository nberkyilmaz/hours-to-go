/**
 * npm run standard:check: compares Transport Canada's Standard 421 with the copy kept here, and
 * says what changed. `--report <file>` writes the alert there when something did. A page it can't
 * read is a failure, so a broken watcher doesn't look like a quiet standard.
 *
 * npm run standard:update: takes the page as the new copy, once a change has been dealt with.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STANDARD_421_URL } from '../src/rules/goals';
import { citations, citedOnly, compare, missing, readStandard, report, type Standard } from './standard';

const SNAPSHOT = fileURLToPath(new URL('standard-421.json', import.meta.url));
const SOURCE = `Transport Canada, Standard 421 of the Canadian Aviation Regulations, ${STANDARD_421_URL}. The sections this app cites, kept only to notice when they change.`;
const TRIES = 3;

async function page(): Promise<string> {
  let last: unknown;
  for (let i = 0; i < TRIES; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 20_000));
    try {
      const res = await fetch(STANDARD_421_URL, { headers: { 'user-agent': 'hours-to-go-standard-watch (+https://github.com/nberkyilmaz/hours-to-go)' } });
      if (res.ok) return await res.text();
      last = new Error(`The page answered ${res.status}.`);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

const args = process.argv.slice(2);
const cited = citations();
const now = citedOnly(readStandard(await page()), cited);
if (Object.keys(now.sections).length === 0) throw new Error('No sections found on the page: its layout has changed, and scripts/standard.ts needs updating.');

const gone = missing(now, cited);
if (args.includes('--update')) {
  writeFileSync(SNAPSHOT, `${JSON.stringify({ source: SOURCE, ...now }, null, 1)}\n`);
  console.log(`Kept ${Object.keys(now.sections).length} sections, page dated ${now.dateModified ?? 'unknown'}.`);
  if (gone.length > 0) console.log(`These citations aren't on the page:\n${gone.join('\n')}`);
} else {
  const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Standard;
  const changes = compare(before, now);
  if (changes.length === 0) {
    console.log(`No change in the ${Object.keys(now.sections).length} sections the app cites (page dated ${now.dateModified ?? 'unknown'}).`);
  } else {
    const text = report(changes, before, now, cited, STANDARD_421_URL);
    console.log(text);
    const at = args.indexOf('--report');
    if (at !== -1) writeFileSync(args[at + 1]!, text);
  }
}
