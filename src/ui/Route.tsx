import { Fragment } from 'react';
import { shortName, t } from '../i18n';
import type { GoalResult } from '../rules/evaluate';
import { routeOf } from '../rules/route';
import { PlaneIcon } from './icons';

/** The goal as a flight plan, one leg for each part of the standard (D60). Only the leg being flown is named, so it fits a phone in French too. */
export function Route({ result }: { result: GoalResult }) {
  const legs = routeOf(result);
  if (!legs) return null;
  const at = legs.findIndex((leg) => !leg.complete);
  const next = legs[at + 1];
  const summary = legs.map((leg) => t('{label}: {value}', { label: t(leg.title), value: leg.complete ? t('done') : t('{have} of {need}', { have: leg.done, need: leg.total }) })).join('. ');
  return (
    <div className="route">
      <div className="route-line" role="img" aria-label={t('Your route to the {goal}. {legs}.', { goal: shortName(result.goal.short), legs: summary })}>
        {legs.map((leg, i) => (
          <Fragment key={leg.title}>
            <span className={`route-fix${leg.complete ? ' is-done' : ''}`} />
            <span className="route-leg">
              <span className="route-flown" style={{ width: `${leg.part * 100}%` }} />
              {i === at && (
                <span className="route-plane" style={{ left: `${leg.part * 100}%` }}>
                  <PlaneIcon />
                </span>
              )}
            </span>
          </Fragment>
        ))}
        <span className="route-fix route-end" />
      </div>
      <p className="route-now">
        <strong>{t(legs[at]!.title)}</strong> · {next ? t('then {leg}', { leg: t(next.title) }) : t('then your application')}
      </p>
    </div>
  );
}
