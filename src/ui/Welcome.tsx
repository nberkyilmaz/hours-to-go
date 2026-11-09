import { useState } from 'react';
import type { LogbookState } from '../useLogbook';
import { BookIcon, CiteIcon, Mark, ProgressIcon } from './icons';
import { PRIVACY_URL } from './links';
import { LanguageSwitch } from './Language';
import { AuthForm, type AuthTab } from './Profile';
import { Ring } from './Ring';
import { t } from '../i18n';

const POINTS = [
  { Icon: BookIcon, title: t('Start from your paper logbook'), text: t('Copy your totals in a few lines, then log each flight as you fly it.') },
  { Icon: ProgressIcon, title: t('See what’s left'), text: t('Hours, exams and flight tests for every licence and rating, and the least flying you still need.') },
  { Icon: CiteIcon, title: t('Every requirement cited'), text: t('Each line points to the paragraph of CAR Standard 421 behind it.') },
];

/**
 * What a browser that has never been here opens to: what the app is, and a free profile
 * recommended first, so a logbook isn't left in one browser by default. Going on without
 * one is a click away.
 */
export function Welcome({ lb }: { lb: LogbookState }) {
  const [tab, setTab] = useState<AuthTab>('signup');
  return (
    <div className="welcome">
      <header className="welcome-head">
        <div className="welcome-hero">
          <div className="brand">
            <Mark size={32} />
            <span>{t('Hours to Go')}</span>
          </div>
          <p className="kicker">{t('For student pilots in Canada')}</p>
          <h1>{t('Know exactly how many hours you have to go.')}</h1>
          <p className="lede">{t('Log your flights and see what’s left for every Transport Canada licence and rating.')}</p>
          <div className="welcome-preview">
            <Ring percent={58} label={t('An example: 58% of the way to a licence')} />
            <div>
              <strong>
                26.1 <small>{t('of 45.0 h')}</small>
              </strong>
              <span>{t('18.9 h to go, about $5,800 left')}</span>
              <span>{t('Next flight: dual cross-country')}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="welcome-main">
        <section className="card welcome-card" aria-labelledby="welcome-title">
          {tab === 'signup' && (
            <>
              <h2 id="welcome-title">{t('Create your free profile')}</h2>
              <p className="muted">{t('Your logbook is safe, and the same on your phone and your computer.')}</p>
            </>
          )}
          {tab === 'signin' && (
            <>
              <h2 id="welcome-title">{t('Welcome back')}</h2>
              <p className="muted">{t('Sign in to open your logbook.')}</p>
            </>
          )}
          {tab === 'forgot' && <h2 id="welcome-title">{t('Forgot your password?')}</h2>}
          <AuthForm lb={lb} tab={tab} onTabChange={setTab} />
          <div className="welcome-skip">
            <button type="button" className="btn quiet" onClick={lb.skipWelcome}>
              {t('Continue without a profile')}
            </button>
            <p className="hint">{t('Your logbook stays in this browser only. You can create a profile any time from Profile.')}</p>
          </div>
        </section>

        <ul className="welcome-points">
          {POINTS.map(({ Icon, title, text }) => (
            <li key={title}>
              <span className="point-icon">
                <Icon />
              </span>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="welcome-foot">
          {t('A study and planning aid, not an official record: your certified personal log and Transport Canada decide what counts.')}{' '}
          <a href={PRIVACY_URL}>{t('Privacy and terms')}</a> · <LanguageSwitch />
        </p>
      </main>
    </div>
  );
}
