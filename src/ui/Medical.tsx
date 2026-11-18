import { dateText, today } from '../model/entry';
import { MEDICAL_AGE_LABEL, MEDICAL_LABEL, type Medical, type MedicalAge, type Profile } from '../model/profile';
import { PRIVILEGES_LABEL, medicalPeriods } from '../rules/medical';
import { t } from '../i18n';

interface Props {
  label: string;
  profile: Profile;
  updateProfile: (fn: (p: Profile) => Profile) => unknown;
}

/**
 * The medical as the certificate shows it: its category and the date of the exam, and the pilot's age that day (D70).
 * The app works out when it ends for each kind of flying (CAR 404.04), and says so under it. A different category is a
 * different certificate, so changing it clears the date.
 */
export function MedicalFields({ label, profile, updateProfile }: Props) {
  const periods = medicalPeriods(profile);
  const now = today();
  return (
    <div className="medical-fields">
      <label className="inline-field">
        <span>{label}</span>
        <select value={profile.medical} onChange={(e) => updateProfile((p) => ({ ...p, medical: e.target.value as Medical, medicalExam: '', medicalUntil: '' }))}>
          {Object.entries(MEDICAL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </select>
      </label>
      {profile.medical !== 'none' && (
        <>
          <label className="inline-field">
            <span>{t('Date of the exam')}</span>
            <input
              type="date"
              max={now}
              value={profile.medicalExam}
              // The old "valid to" date is only kept until there's an exam date to work from.
              onChange={(e) => updateProfile((p) => ({ ...p, medicalExam: e.target.value, ...(e.target.value ? { medicalUntil: '' } : {}) }))}
            />
          </label>
          <label className="inline-field">
            <span>{t('Your age that day')}</span>
            <select value={profile.medicalAge} onChange={(e) => updateProfile((p) => ({ ...p, medicalAge: e.target.value as MedicalAge }))}>
              {Object.entries(MEDICAL_AGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </label>
          {!profile.medicalExam && !profile.medicalUntil && <p className="hint medical-says">{t('The exam date is on your medical certificate. The app works out when it ends from it.')}</p>}
          {!profile.medicalExam && profile.medicalUntil && (
            <p className="hint medical-says">{t('Valid to {date}, as you entered it before. Add the date of the exam and the app works it out instead.', { date: dateText(profile.medicalUntil) })}</p>
          )}
          {profile.medicalExam && periods.length > 0 && (
            <ul className="medical-says" aria-label={t('How long it lasts')}>
              {periods.map((m) => (
                <li key={m.privileges}>
                  {t(PRIVILEGES_LABEL[m.privileges])}:{' '}
                  {now > m.until ? <span className="warn-text">{t('ran out on {date}', { date: dateText(m.until) })}</span> : <strong>{t('to {date}', { date: dateText(m.until) })}</strong>}
                </li>
              ))}
              <li className="cite">{t('CAR 404.04')}</li>
            </ul>
          )}
          {profile.medicalExam && profile.medical === 'cat1' && profile.medicalAge === 'over40' && (
            <p className="hint medical-says">{t('Flying passengers for hire on your own, a Category 1 lasts 6 months at 40 or older (404.04(6.2)).')}</p>
          )}
        </>
      )}
    </div>
  );
}
