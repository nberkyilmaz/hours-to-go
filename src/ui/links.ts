import { lang } from '../i18n';
import { STANDARD_421_URL } from '../rules/goals';

/** The privacy and terms page, a page of its own beside the app (privacy/index.html). */
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy/${lang() === 'fr' ? 'fr/' : ''}`;

/** Standard 421, in the pilot's language. The nightly check reads the English one. */
export const STANDARD_URL =
  lang() === 'fr'
    ? 'https://tc.canada.ca/fr/services-generaux/lois-reglements/liste-reglements/reglement-aviation-canadien-dors-96-433/normes/norme-421-permis-licences-qualifications-membres-equipage-conduite-reglement-aviation-canadien-rac'
    : STANDARD_421_URL;

/** The latest change to Standard 421 these rules were checked against. The nightly check says when it's out of date. */
export const STANDARD_CURRENT = 'NSA 2025-008';
