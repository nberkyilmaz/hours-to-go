/**
 * Reads Transport Canada's Standard 421 and tells what changed since it was last read (D42). The
 * rules in `src/rules/goals.ts` are only as right as the standard they were written from.
 */
import { GOALS, type Goal, type Req } from '../src/rules/goals';

export interface StandardSection {
  title: string;
  /** Subsections by number, as lines of text; `intro` is what comes before the first. */
  parts: Record<string, string[]>;
}

export interface Standard {
  /** The page's own "Date modified". */
  dateModified: string | null;
  sections: Record<string, StandardSection>;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', eacute: 'é' };

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) return String.fromCodePoint(code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? whole;
  });
}

function toLines(html: string): string[] {
  const text = html
    .replace(/<(script|style)\b.*?<\/\1>/gis, '')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|td|th|table|br|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(text)
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter(Boolean);
}

export function readStandard(html: string): Standard {
  const sections: Record<string, StandardSection> = {};
  const heads = [...html.matchAll(/<h3\b[^>]*\bid="421_(\d+)"[^>]*>/gi)];
  for (const head of heads) {
    const start = head.index;
    // To the next heading of this level or above; a Division's heading comes between sections.
    const rest = html.slice(start + head[0].length);
    const end = rest.search(/<h[1-3]\b/i);
    const lines = toLines(html.slice(start, start + head[0].length + (end === -1 ? rest.length : end)));
    const parts: Record<string, string[]> = { intro: [] };
    let current = 'intro';
    let next = 1;
    for (const line of lines.slice(1)) {
      const number = /^\((\d+)\)/.exec(line)?.[1];
      // Only the next number along: a stray "(5)" inside a paragraph doesn't start a subsection.
      if (number !== undefined && Number(number) === next) {
        current = number;
        parts[current] = [];
        next += 1;
      }
      parts[current]!.push(line);
    }
    sections[`421.${head[1]}`] = { title: lines[0] ?? '', parts };
  }
  const dateModified = /<time[^>]*dateModified[^>]*>\s*([\d-]+)/i.exec(html)?.[1] ?? null;
  return { dateModified, sections };
}

export interface Citation {
  cite: string;
  /** What in the app rests on it. */
  where: string;
}

export function citations(goals: readonly Goal[] = GOALS): Citation[] {
  const out: Citation[] = [];
  const walk = (goal: Goal, req: Req) => {
    out.push({ cite: req.cite, where: `${goal.short}: ${req.label}` });
    req.sub?.forEach((s) => walk(goal, s));
  };
  for (const goal of goals) {
    out.push({ cite: goal.cite, where: goal.short });
    for (const section of goal.sections) section.reqs.forEach((r) => walk(goal, r));
    for (const gate of goal.gates) {
      out.push({ cite: gate.cite, where: `${goal.short}: ${gate.label}` });
      if (Array.isArray(gate.needs)) gate.needs.forEach((r) => walk(goal, r));
    }
  }
  return out;
}

/** "421.14(3)(b), (4)(c)" is section 421.14, with (b) under (3) and (c) under (4). */
export function parseCite(cite: string): { section: string; parts: { part: string; path: string[] }[] } | null {
  const found = /^(421\.\d+)(.*)$/.exec(cite.trim());
  if (!found) return null;
  const parts: { part: string; path: string[] }[] = [];
  for (const [, token] of found[2]!.matchAll(/\(([^)]+)\)/g)) {
    if (/^\d+$/.test(token!)) parts.push({ part: token!, path: [] });
    else parts.at(-1)?.path.push(token!);
  }
  return { section: found[1]!, parts };
}

/** The citations the standard no longer backs: a section, subsection or paragraph that isn't there. */
export function missing(standard: Standard, cited: readonly Citation[]): string[] {
  const problems = new Set<string>();
  for (const { cite, where } of cited) {
    const parsed = parseCite(cite);
    if (!parsed) continue;
    const section = standard.sections[parsed.section];
    if (!section) {
      problems.add(`${cite} (${where}): there is no section ${parsed.section}`);
      continue;
    }
    for (const { part, path } of parsed.parts) {
      const lines = section.parts[part];
      if (!lines) {
        problems.add(`${cite} (${where}): there is no subsection (${part})`);
        continue;
      }
      const text = lines.join('\n');
      let at = 0;
      for (const token of path) {
        const hit = text.indexOf(`(${token})`, at);
        if (hit === -1) {
          problems.add(`${cite} (${where}): there is no (${token}) under (${part})`);
          break;
        }
        at = hit;
      }
    }
  }
  return [...problems];
}

/** Only what the app rests on: a change to the helicopter sections is no reason to alert anyone. */
export function citedOnly(standard: Standard, cited: readonly Citation[]): Standard {
  const names = [...new Set(cited.map(({ cite }) => parseCite(cite)?.section))].filter((n): n is string => n !== undefined).sort();
  const sections: Record<string, StandardSection> = {};
  for (const name of names) {
    const section = standard.sections[name];
    if (section) sections[name] = section;
  }
  return { dateModified: standard.dateModified, sections };
}

export interface Change {
  section: string;
  part: string;
  removed: string[];
  added: string[];
}

export function compare(before: Standard, now: Standard): Change[] {
  const changes: Change[] = [];
  for (const [section, old] of Object.entries(before.sections)) {
    const current = now.sections[section];
    if (!current) throw new Error(`Section ${section} is no longer on the page. Either it was renumbered, or the page's layout changed and scripts/standard.ts needs updating.`);
    for (const part of new Set([...Object.keys(old.parts), ...Object.keys(current.parts)])) {
      const a = old.parts[part] ?? [];
      const b = current.parts[part] ?? [];
      if (a.join('\n') === b.join('\n')) continue;
      changes.push({ section, part, removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) });
    }
  }
  return changes;
}

const label = (c: Change) => (c.part === 'intro' ? c.section : `${c.section}(${c.part})`);

/** GitHub refuses an issue longer than 65,536 characters. */
const MOST = 60_000;

/** The alert: what changed, and which of the app's requirements rest on it. */
export function report(changes: readonly Change[], before: Standard, now: Standard, cited: readonly Citation[], url: string): string {
  const lines = [
    `Transport Canada's page for Standard 421 differs from the copy this app was last checked against (page dated ${now.dateModified ?? 'unknown'}, was ${before.dateModified ?? 'unknown'}).`,
    '',
    `Read it on [the page](${url}).`,
    '',
  ];
  for (const c of changes) {
    const using = [
      ...new Set(
        cited
          .filter(({ cite }) => {
            const parsed = parseCite(cite);
            return parsed?.section === c.section && parsed.parts.some((p) => p.part === c.part);
          })
          .map((x) => `- ${x.where} (${x.cite})`),
      ),
    ];
    lines.push(`### ${label(c)}`, '', using.length > 0 ? 'The app rests on this for:' : 'Nothing in the app cites this subsection directly, but it is in a section the app uses.', '');
    if (using.length > 0) lines.push(...using, '');
    lines.push('```diff', ...c.removed.map((l) => `- ${l}`), ...c.added.map((l) => `+ ${l}`), '```', '');
  }
  lines.push(
    '### What to do',
    '',
    '1. Read the change, and if it alters a requirement, update `src/rules/goals.ts` and its tests.',
    '2. Run `npm run standard:update` to take this as the new copy, and put it in the same pull request.',
    '3. Merging that stops this alert. Close this issue.',
  );
  const text = lines.join('\n');
  return text.length > MOST ? `${text.slice(0, MOST)}\n\n…cut short. The page has the rest.` : text;
}
