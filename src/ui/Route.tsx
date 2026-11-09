import { shortName, t } from '../i18n';
import { formatHours } from '../model/entry';
import type { GateResult, GoalResult } from '../rules/evaluate';
import type { GoalProgress } from '../rules/progress';
import { routeOf } from '../rules/route';
import { PlaneIcon } from './icons';

/** What a step toward the licence is waiting on. */
export function gateStatus(g: GateResult): string {
  const open = g.open.length;
  return g.passed ? t('Passed') : g.met ? (g.gate.exams ? t('You can write it') : t('Unlocked')) : open === 1 ? t('1 thing left') : t('{n} things left', { n: open });
}

/** The goal as a flight plan (D60): how far along, where the flight test comes, and what's next. */
export function Route({ result, progress }: { result: GoalResult; progress: GoalProgress }) {
  const route = routeOf(result, progress);
  if (!route) return null;
  const { percent, fixes, next } = route;
  return (
    <div className="route">
      <div className="route-line" role="img" aria-label={t('Your route to the {goal}: {percent} of the way.', { goal: shortName(result.goal.short), percent: t('{n}%', { n: percent }) })}>
        <span className="route-flown" style={{ width: `${percent}%` }} />
        {fixes.map((f) => (
          <span key={f.at} className={`route-fix${f.passed ? ' is-done' : ''}`} style={{ left: `${f.at * 100}%` }} />
        ))}
        <span className="route-fix route-end" />
        <span className="route-plane" style={{ left: `clamp(10px, ${percent}%, calc(100% - 26px))` }}>
          <PlaneIcon />
        </span>
      </div>
      {progress.need > 0 && (
        <div className="route-marks" aria-hidden="true">
          {fixes.map((f) => (
            <span key={f.at} style={{ left: `${f.at * 100}%` }}>
              {t('Flight test')}
            </span>
          ))}
          <span className="route-goal">
            {formatHours(progress.need)}{' '}{t('h')}
          </span>
        </div>
      )}
      {next && (
        <p className="route-now">
          <strong>{t('Next:')}</strong>{' '}{t(next.gate.label)} · {gateStatus(next)}
        </p>
      )}
    </div>
  );
}
