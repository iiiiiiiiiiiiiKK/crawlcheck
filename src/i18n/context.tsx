import { createContext, useContext, type ReactNode } from 'react';
import { findingText, limitationText, t, type FindingText, type Lang } from './index';
import type { Finding } from '../lib/types';

interface I18n {
  lang: Lang;
  /** UI string lookup with `{param}` interpolation. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Finding title / current / why / fix. */
  ft: (finding: Finding) => FindingText;
  /** Limitation banner text. */
  lim: (code: string) => FindingText;
}

const LangContext = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useI18n(): I18n {
  const lang = useContext(LangContext);
  return {
    lang,
    t: (key, params) => t(lang, key, params),
    ft: (finding) => findingText(lang, finding),
    lim: (code) => limitationText(lang, code),
  };
}

export function useLang(): Lang {
  return useContext(LangContext);
}
