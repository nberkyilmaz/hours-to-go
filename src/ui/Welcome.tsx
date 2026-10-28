import { useState } from 'react';
import type { LogbookState } from '../useLogbook';
import { BookIcon, CiteIcon, Mark, ProgressIcon } from './icons';
import { AuthForm, type AuthTab } from './Profile';

const POINTS = [
  { Icon: BookIcon, title: 'Start from your paper logbook', text: 'Copy your totals in a few lines, then log each flight as you fly it.' },
  { Icon: ProgressIcon, title: 'See what’s left', text: 'Hours, exams and flight tests for every licence and rating, and the least flying you still need.' },
  { Icon: CiteIcon, title: 'Every requirement cited', text: 'Each line points to the paragraph of CAR Standard 421 behind it.' },
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
            <span>Hours to Go</span>
          </div>
          <p className="kicker">For student pilots in Canada</p>
          <h1>Know exactly how many hours you have to go.</h1>
          <p className="lede">Log your flights and see what’s left for each Transport Canada licence and rating, from the PPL to the ATPL.</p>
        </div>
      </header>

      <main className="welcome-main">
        <section className="card welcome-card" aria-labelledby="welcome-title">
          {tab === 'signup' && (
            <>
              <h2 id="welcome-title">Create your free profile</h2>
              <p className="muted">Your logbook is saved to your profile, so it’s safe, and it’s the same on your phone and your computer.</p>
            </>
          )}
          {tab === 'signin' && (
            <>
              <h2 id="welcome-title">Welcome back</h2>
              <p className="muted">Sign in to open your logbook.</p>
            </>
          )}
          {tab === 'forgot' && <h2 id="welcome-title">Forgot your password?</h2>}
          <AuthForm lb={lb} tab={tab} onTabChange={setTab} />
          <div className="welcome-skip">
            <button type="button" className="btn quiet" onClick={lb.skipWelcome}>
              Continue without a profile
            </button>
            <p className="hint">Your logbook stays in this browser only. You can create a profile any time from Profile.</p>
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

        <p className="welcome-foot">A study and planning aid, not an official record: your certified personal log and Transport Canada decide what counts.</p>
      </main>
    </div>
  );
}
