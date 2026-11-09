import { chooseLang, lang } from '../i18n';

/** Names the other language in that language, so someone who can't read this page can still find it. */
export function LanguageSwitch() {
  const other = lang() === 'fr' ? 'en' : 'fr';
  return (
    <button type="button" className="link" lang={other === 'fr' ? 'fr-CA' : 'en-CA'} onClick={() => chooseLang(other)}>
      {other === 'fr' ? 'Français' : 'English'}
    </button>
  );
}
