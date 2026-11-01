/** Persisted user preferences: theme, language, optional scan-service endpoint. */

import type { Lang } from '../i18n';

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'crawlcheck.theme';
const LANG_KEY = 'crawlcheck.lang';
const ENDPOINT_KEY = 'crawlcheck.endpoint';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be blocked; preferences simply do not persist */
  }
}

export function loadTheme(): Theme {
  const value = read(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function saveTheme(theme: Theme): void {
  write(THEME_KEY, theme);
}

export function prefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export function applyTheme(theme: Theme): 'light' | 'dark' {
  const effective: 'light' | 'dark' = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
  const root = document.documentElement;
  root.classList.toggle('dark', effective === 'dark');
  root.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#08090a' : '#fbfbfa');
  return effective;
}

export function loadLang(): Lang {
  const stored = read(LANG_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  try {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function saveLang(lang: Lang): void {
  write(LANG_KEY, lang);
}

export function loadEndpoint(): string {
  const stored = read(ENDPOINT_KEY);
  if (stored) return stored;
  // A deployment can ship a default scan service through the build environment.
  const buildDefault = (import.meta.env.VITE_SCAN_ENDPOINT as string | undefined)?.trim();
  return buildDefault ?? '';
}

export function saveEndpoint(endpoint: string): void {
  if (endpoint) write(ENDPOINT_KEY, endpoint);
  else {
    try {
      localStorage.removeItem(ENDPOINT_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function isValidEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
