import { beforeEach, describe, expect, it } from 'vitest';
import { blankProfile } from '../../src/model/profile';
import { emptyLogbook } from '../../src/model/store';
import { applyChanges, applyOps, clearCopy, lastAccount, loadCopy, profileChanges, saveCopy, type AccountCopy } from '../../src/model/sync';
import { line, profile } from './fixtures';

const account = { email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false };

describe('a profile change', () => {
  it('is the fields that changed, and the items of a set one by one', () => {
    const before = profile({ milestones: { 'ppl-ground': { date: '2026-10-01' } }, held: { ppl: { date: '2025-06-01' } } });
    const after = profile({ milestones: { 'ppl-letter': { date: '2026-11-01' } }, focus: 'cpl', rates: { aircraft: 235, instructor: 92, sim: null, tax: 13 } });
    expect(profileChanges(before, after)).toEqual([
      { key: 'held', item: 'ppl', removed: true },
      { key: 'milestones', item: 'ppl-ground', removed: true },
      { key: 'milestones', item: 'ppl-letter', value: { date: '2026-11-01' } },
      { key: 'focus', value: 'cpl' },
      { key: 'rates', value: { aircraft: 235, instructor: 92, sim: null, tax: 13 } },
    ]);
    expect(profileChanges(after, after)).toEqual([]);
  });

  it('lands on the newest profile without undoing what another device changed', () => {
    const phoneBefore = profile();
    // Offline on the phone: a milestone ticked, and the CPL picked.
    const phoneAfter = profile({ milestones: { 'ppl-letter': { date: '2026-11-07' } }, focus: 'cpl' });
    // Meanwhile on the laptop: another milestone and the medical.
    const server = profile({ milestones: { 'ppl-ground': { date: '2026-11-06' } }, medical: 'cat1' });
    expect(applyChanges(server, profileChanges(phoneBefore, phoneAfter))).toEqual(
      profile({ milestones: { 'ppl-ground': { date: '2026-11-06' }, 'ppl-letter': { date: '2026-11-07' } }, medical: 'cat1', focus: 'cpl' }),
    );
  });
});

describe('the changes waiting', () => {
  it('go on top of the server’s logbook in order', () => {
    const a = line('2026-11-01', { seDayDual: 1.2 });
    const b = line('2026-11-02', { seDayDual: 1.4 });
    const book = applyOps({ ...emptyLogbook(), entries: [a] }, [
      { kind: 'entry', entry: b },
      { kind: 'entry', entry: { ...a, remarks: 'Circuits' } },
      { kind: 'delete', id: b.id },
      { kind: 'profile', changes: [{ key: 'focus', value: 'night' }] },
    ]);
    expect(book.entries).toEqual([{ ...a, remarks: 'Circuits' }]);
    expect(book.profile).toEqual({ ...blankProfile(), focus: 'night' });
  });
});

describe('the copy on this device', () => {
  beforeEach(() => localStorage.clear());

  it('is kept per profile, with its changes, until signing out', () => {
    const entry = line('2026-11-07', { seDayDual: 1.3 });
    const copy: AccountCopy = { account, server: emptyLogbook(), ops: [{ kind: 'entry', entry }] };
    expect(saveCopy(copy)).toBe(true);
    expect(lastAccount()).toBe('student@example.com');
    expect(loadCopy()).toEqual(copy);
    expect(loadCopy('other@example.com')).toBeNull();
    clearCopy('student@example.com');
    expect(loadCopy('student@example.com')).toBeNull();
    expect(lastAccount()).toBeNull();
  });

  it('keeps only what it can read back', () => {
    localStorage.setItem('hours-to-go/account', 'student@example.com');
    localStorage.setItem('hours-to-go/account/student@example.com', '{not json');
    expect(loadCopy()).toBeNull();
    localStorage.setItem(
      'hours-to-go/account/student@example.com',
      JSON.stringify({ account, server: emptyLogbook(), ops: [{ kind: 'entry', entry: { date: 'never' } }, { kind: 'delete', id: 'x' }, { kind: 'odd' }] }),
    );
    expect(loadCopy()?.ops).toEqual([{ kind: 'delete', id: 'x' }]);
  });
});
