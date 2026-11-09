// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { citations, citedOnly, compare, missing, parseCite, readStandard, report, type Standard } from '../../scripts/standard';

const page = (hours: number) => `<html><main>
<h2>Division VI</h2>
<h3 id="421_26">421.26 Aeroplanes - Requirements</h3>
<h4>(1) Age</h4><p>An applicant shall be 17.</p>
<h4>(2) Experience</h4>
<p>(a) A minimum of ${hours} hours, including:</p>
<ul><li>(i) 17 hours dual&nbsp;instruction</li><li>(ii) 12 hours solo &amp; alone</li></ul>
<p>(5) a stray number in a paragraph</p>
<p>(amended 2012/02/19)</p>
<h2>Division VII</h2>
<h3 id="421_27">421.27 Helicopters</h3>
<p>(1) Anything at all</p>
</main><time property="dateModified">2026-08-20</time></html>`;

const cited = [
  { cite: '421.26', where: 'PPL' },
  { cite: '421.26(2)(a)', where: 'PPL: 45 h of training' },
  { cite: '421.26(2)(a)(ii)', where: 'PPL: 12 h solo' },
];

describe('reading the page', () => {
  it('splits each section into its numbered subsections, up to the next heading', () => {
    const { dateModified, sections } = readStandard(page(45));
    expect(dateModified).toBe('2026-08-20');
    expect(sections['421.26']?.title).toBe('421.26 Aeroplanes - Requirements');
    expect(sections['421.26']?.parts).toEqual({
      intro: [],
      1: ['(1) Age', 'An applicant shall be 17.'],
      // A number out of order is part of the paragraph, and the entities are read.
      2: ['(2) Experience', '(a) A minimum of 45 hours, including:', '(i) 17 hours dual instruction', '(ii) 12 hours solo & alone', '(5) a stray number in a paragraph', '(amended 2012/02/19)'],
    });
    expect(Object.keys(sections)).toEqual(['421.26', '421.27']);
  });

  it('keeps only the sections the app cites', () => {
    expect(Object.keys(citedOnly(readStandard(page(45)), cited).sections)).toEqual(['421.26']);
  });
});

describe('a citation', () => {
  it('is read down to its paragraphs, across commas and ranges', () => {
    expect(parseCite('421.26')).toEqual({ section: '421.26', parts: [] });
    expect(parseCite('421.14(3)(b), (4)(c)')).toEqual({
      section: '421.14',
      parts: [
        { part: '3', path: ['b'] },
        { part: '4', path: ['c'] },
      ],
    });
    expect(parseCite('421.42(1)(a)(ii)–(iii)')?.parts).toEqual([{ part: '1', path: ['a', 'ii', 'iii'] }]);
    expect(parseCite('401.05')).toBeNull();
  });

  it('is reported when the standard doesn’t have it', () => {
    const standard = readStandard(page(45));
    expect(missing(standard, cited)).toEqual([]);
    expect(
      missing(standard, [
        { cite: '421.99(1)', where: 'A' },
        { cite: '421.26(8)', where: 'B' },
        { cite: '421.26(2)(c)', where: 'C' },
      ]),
    ).toEqual(['421.99(1) (A): there is no section 421.99', '421.26(8) (B): there is no subsection (8)', '421.26(2)(c) (C): there is no (c) under (2)']);
  });

  it('in the app is on Transport Canada’s page, every one', () => {
    const copy = JSON.parse(readFileSync(new URL('../../scripts/standard-421.json', import.meta.url), 'utf8')) as Standard;
    expect(citations().length).toBeGreaterThan(100);
    expect(missing(copy, citations())).toEqual([]);
  });
});

describe('a change', () => {
  const before = citedOnly(readStandard(page(45)), cited);
  const now = citedOnly(readStandard(page(40)), cited);

  it('is the lines that differ, by subsection', () => {
    expect(compare(before, before)).toEqual([]);
    expect(compare(before, now)).toEqual([
      { section: '421.26', part: '2', removed: ['(a) A minimum of 45 hours, including:'], added: ['(a) A minimum of 40 hours, including:'] },
    ]);
  });

  it('says which requirements rest on it and what to do', () => {
    const text = report(compare(before, now), { ...before, dateModified: '2026-01-01' }, now, cited, 'https://example.com/421');
    expect(text).toContain('(page dated 2026-08-20, was 2026-01-01)');
    expect(text).toContain('### 421.26(2)');
    expect(text).toContain('- PPL: 45 h of training (421.26(2)(a))');
    expect(text).not.toContain('- PPL (421.26)');
    expect(text).toContain('- (a) A minimum of 45 hours, including:\n+ (a) A minimum of 40 hours, including:');
    expect(text).toContain('npm run standard:update');
  });

  it('fails loudly when a section has gone, rather than looking like no change', () => {
    expect(() => compare(before, { ...now, sections: {} })).toThrow(/Section 421.26 is no longer on the page/);
  });
});
