// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { t, translator } from '../../src/i18n';
import { FR, GOAL_SHORT_FR } from '../../src/i18n/fr';
import { AFTER_PPL_LABEL, COLUMN_LABEL, LOG_GROUPS } from '../../src/model/entry';
import { MEDICAL_LABEL } from '../../src/model/profile';
import { LOG_FILTERS } from '../../src/model/search';
import { GOALS } from '../../src/rules/goals';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n') sources(path, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const parse = (path: string) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const walk = (node: ts.Node, visit: (n: ts.Node) => void) => {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
};

/** Every phrase the code asks to be translated. */
function phrasesInCode(): string[] {
  const found = new Set<string>();
  for (const path of [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'server'))]) {
    walk(parse(path), (n) => {
      if (ts.isCallExpression(n) && ['t', 'tr'].includes(n.expression.getText()) && n.arguments[0]) {
        const a = n.arguments[0];
        for (const x of ts.isConditionalExpression(a) ? [a.whenTrue, a.whenFalse] : [a]) if (ts.isStringLiteralLike(x)) found.add(x.text);
      }
      if (path.endsWith('app.ts') && ts.isPropertyAssignment(n) && n.name.getText() === 'error' && ts.isStringLiteralLike(n.initializer)) found.add(n.initializer.text);
    });
  }
  return [...found];
}

/** Every phrase in the regulatory data, which is shown through t() by whatever displays it. */
function phrasesInData(): string[] {
  const found = new Set<string>();
  const add = (s?: string) => s && found.add(s);
  const req = (r: any) => {
    add(r.label);
    add(r.note);
    if (r.kind === 'milestone') add(r.label.split(/:|, within/)[0]);
    (r.sub ?? []).forEach(req);
  };
  for (const g of GOALS as any[]) {
    add(g.name);
    add(g.scope?.label);
    for (const s of g.sections) {
      add(s.title);
      s.reqs.forEach(req);
    }
    for (const gate of g.gates) {
      add(gate.label);
      if (Array.isArray(gate.needs)) gate.needs.forEach(req);
    }
    add(g.cost.note);
    add(g.cost.solo);
    add(g.cost.unpriced);
  }
  Object.values(COLUMN_LABEL).forEach(add);
  LOG_GROUPS.forEach((g) => add(g.title));
  Object.values(AFTER_PPL_LABEL).forEach(add);
  Object.values(MEDICAL_LABEL).forEach(add);
  LOG_FILTERS.forEach((f) => add(f.label));
  return [...found];
}

describe('the French table', () => {
  it('has every phrase the code asks for', () => {
    expect(phrasesInCode().filter((k) => !(k in FR))).toEqual([]);
  });

  it('has every phrase in the regulatory data', () => {
    expect(phrasesInData().filter((k) => !(k in FR))).toEqual([]);
  });

  it('has the sentences the rules hand back', () => {
    const goals = readFileSync(join(ROOT, 'src/rules/goals.ts'), 'utf8');
    const said = [...goals.matchAll(/\? '([A-Z][^']*[a-z] [^']*\.)'/g)].map((m) => m[1]!);
    expect(said.length).toBeGreaterThan(2);
    expect(said.filter((k) => !(k in FR))).toEqual([]);
    for (const exam of ['PPAER', 'CPAER', 'AIRAF']) expect(`Used for the ${exam} you’ve passed.` in FR).toBe(true);
    for (const name of [...readFileSync(join(ROOT, 'src/rules/next.ts'), 'utf8').matchAll(/ name: '([^']+)'/g)].map((m) => m[1]!)) expect(name in FR).toBe(true);
  });

  it('names every goal in French', () => {
    const shorts = GOALS.map((g) => g.short).filter((s) => !['PPL', 'CPL'].includes(s));
    expect(shorts.filter((s) => !(s in GOAL_SHORT_FR))).toEqual([]);
  });

  it('calls the department by its French name', () => {
    expect(Object.values(FR).filter((f) => /Transport Canada/.test(f))).toEqual([]);
  });

  it('keeps every placeholder, so nothing shows up as {n}', () => {
    const marks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.entries(FR).filter(([en, fr]) => marks(en).join() !== marks(fr).join())).toEqual([]);
  });

  it('doesn’t leave English behind, apart from what reads the same', () => {
    const SAME = new Set(['Hours to Go', 'Sections', 'Solo', 'Date', 'Message', 'FTD', 'Id', 'Type', 'Total', 'Page', 'h', 'Co', 'App', 'Inst', '1 page', '{n} pages']);
    expect(Object.entries(FR).filter(([en, fr]) => en === fr && !SAME.has(en)).map(([en]) => en)).toEqual([]);
  });

  it('keeps French punctuation from starting a line', () => {
    expect(t('Not used:')).toBe('Not used:');
    expect(translator('fr')('Not used:')).toBe('Non utilisé :');
    expect(translator('fr')('Tax, %')).toBe('Taxes, %');
  });
});

describe('every word on the screens goes through it', () => {
  it('has no bare text in a component’s props', () => {
    const NOT_WORDS = new Set(['className', 'd', 'viewBox', 'style', 'href', 'accept', 'autoComplete', 'aria-labelledby', 'transform', 'points']);
    const bare: string[] = [];
    for (const path of sources(join(ROOT, 'src'))) {
      if (!path.endsWith('.tsx')) continue;
      walk(parse(path), (n) => {
        if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && /[a-z] [a-z]/i.test(n.initializer.text) && !NOT_WORDS.has(n.name.getText())) bare.push(`${path}: ${n.getText().slice(0, 60)}`);
      });
    }
    expect(bare).toEqual([]);
  });

  it('has no bare text in JSX', () => {
    const bare: string[] = [];
    for (const path of sources(join(ROOT, 'src'))) {
      if (!path.endsWith('.tsx')) continue;
      walk(parse(path), (n) => {
        if (ts.isJsxText(n) && /[A-Za-z]/.test(n.getText())) bare.push(`${path}: ${n.getText().trim().slice(0, 50)}`);
      });
    }
    expect(bare).toEqual([]);
  });
});
