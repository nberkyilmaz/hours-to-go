import { MEDICAL_LABEL, type Medical, type Profile } from '../model/profile';
import { t } from '../i18n';

interface Props {
  label: string;
  profile: Profile;
  updateProfile: (fn: (p: Profile) => Profile) => unknown;
}

/**
 * The medical and its "valid to" date (D44). How long one lasts depends on the pilot's age, their
 * licence and the flying they do, so the app takes the date from the certificate. A different
 * category is a different certificate, so changing it clears the date.
 */
export function MedicalFields({ label, profile, updateProfile }: Props) {
  return (
    <div className="medical-fields">
      <label className="inline-field">
        <span>{label}</span>
        <select value={profile.medical} onChange={(e) => updateProfile((p) => ({ ...p, medical: e.target.value as Medical, medicalUntil: '' }))}>
          {Object.entries(MEDICAL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </select>
      </label>
      {profile.medical !== 'none' && (
        <label className="inline-field">
          <span>{t('Valid to')}</span>
          <input type="date" value={profile.medicalUntil} onChange={(e) => updateProfile((p) => ({ ...p, medicalUntil: e.target.value }))} />
        </label>
      )}
    </div>
  );
}
