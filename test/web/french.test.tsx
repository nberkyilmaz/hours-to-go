import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { lang, setLang, t } from '../../src/i18n';
import { parseCsv, readCsv, toCsv, type CsvRead } from '../../src/model/csv';
import { dateText, formatHours, parseDuration } from '../../src/model/entry';
import { shortDate } from '../../src/model/search';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { money } from '../../src/rules/cost';
import { line } from './fixtures';

describe('in French', () => {
  beforeEach(() => setLang('fr'));
  afterEach(() => setLang('en'));

  it('translates and fills in', () => {
    expect(t('Log a flight')).toBe('Inscrire un vol');
    expect(t('Page {n} of {total}', { n: 2, total: 9 })).toBe('Page 2 de 9');
  });

  it('shows English for anything not translated yet', () => {
    expect(t('Not in the table')).toBe('Not in the table');
  });

  it('writes dates the French way', () => {
    expect(dateText('2028-03-14')).toBe('14 mars 2028');
    expect(shortDate('2026-10-20')).toContain('oct');
  });

  it('writes hours with a comma, and reads one back', () => {
    expect(formatHours(90)).toBe('1,5');
    expect(parseDuration('1,5')).toBe(90);
  });

  it('writes money the French way', () => {
    expect(money(14500).replace(/\s/g, ' ')).toBe('14 500 $');
  });

  describe('a spreadsheet', () => {
    const flight = () => line('2026-10-01', { seDayPic: 1.5 }, { id: 'a1', solo: true, remarks: 'Vol local' });

    it('is made for French Excel: semicolons, decimal commas, French headings', () => {
      const csv = toCsv([flight()]);
      expect(csv.split('\r\n')[0]).toContain(';');
      const [header, row] = parseCsv(csv);
      expect(header).toContain('Monomoteur de jour CdB');
      expect(header).toContain('Immatriculation');
      expect(row![header!.indexOf('Monomoteur de jour CdB')]).toBe('1,5');
      expect(row![header!.indexOf('Solo')]).toBe('oui');
    });

    it('comes back the same', () => {
      const back = readCsv(toCsv([flight()])) as CsvRead;
      expect(back.problems).toEqual([]);
      expect(back.entries).toEqual([flight()]);
    });

    it('also reads one made in English', () => {
      setLang('en');
      const english = toCsv([flight()]);
      setLang('fr');
      expect((readCsv(english) as CsvRead).entries).toEqual([flight()]);
    });
  });
});

describe('choosing a language', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
    saveGuestLogbook(emptyLogbook());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setLang('en');
  });

  it('starts in English here', () => {
    expect(lang()).toBe('en');
  });

  it('offers the other language, named in that language', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
    const button = await screen.findByRole('button', { name: 'Français' });
    expect(button.getAttribute('lang')).toBe('fr-CA');
  });

  it('shows the screens in French once chosen', async () => {
    // Choosing a language reloads the page, which this does by loading the app afresh.
    localStorage.setItem('hours-to-go/lang', 'fr');
    vi.resetModules();
    const { App: French } = await import('../../src/App');
    render(<French />);
    expect(await screen.findByRole('button', { name: 'Carnet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Profil' }));
    expect(await screen.findByRole('button', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vos données' })).toBeTruthy();
  });

  it('puts what the server says into French', async () => {
    const { ApiError, api } = await import('../../src/api');
    setLang('fr');
    await expect(api.me()).rejects.toThrow(new ApiError('Connectez-vous pour continuer.', 401));
  });
});
