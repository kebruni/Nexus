import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type Language, type TranslationKey } from '../i18n/translations';

type TParams = Record<string, string | number>;

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: TParams) => string;
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key, params) => interpolate(translations[key]?.en || key, params),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('nexus-lang') as Language) || 'en';
  });

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('nexus-lang', l);
  };

  const t = (key: TranslationKey, params?: TParams): string => {
    const template = translations[key]?.[lang] || translations[key]?.en || key;
    return interpolate(template, params);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
