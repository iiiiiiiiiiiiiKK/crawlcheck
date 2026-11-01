import { IconGlobe, IconLogo, IconMonitor, IconMoon, IconSliders, IconSun, IconX } from './Icons';
import { useI18n } from '../i18n/context';
import type { Theme } from '../state/prefs';
import type { Lang } from '../i18n';

export const AUTHOR_URL = 'https://x.com/0xkillcoin';
export const AUTHOR_HANDLE = '@0xkillcoin';

export type Route = 'scan' | 'report' | 'history' | 'about';

interface HeaderProps {
  lang: Lang;
  theme: Theme;
  route: Route;
  onLangChange: (lang: Lang) => void;
  onThemeChange: (theme: Theme) => void;
  onNavigate: (route: Route) => void;
  onOpenSettings: () => void;
}

const NAV: { route: Route; key: string }[] = [
  { route: 'scan', key: 'nav.scan' },
  { route: 'history', key: 'nav.history' },
  { route: 'about', key: 'nav.about' },
];

export function Header({ lang, theme, route, onLangChange, onThemeChange, onNavigate, onOpenSettings }: HeaderProps) {
  const { t } = useI18n();
  const nextTheme: Theme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const ThemeIcon = theme === 'dark' ? IconMoon : theme === 'light' ? IconSun : IconMonitor;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="safe-x mx-auto flex h-14 max-w-6xl items-center gap-2">
        <a
          href="#/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('scan');
          }}
          className="flex min-w-0 items-center gap-2 rounded-lg py-1 pr-1 text-fg"
          aria-label="CrawlCheck"
        >
          <span className="text-fg">
            <IconLogo className="h-7 w-7" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight">CrawlCheck</span>
        </a>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                route === item.route ? 'bg-surface2 font-medium text-fg' : 'text-muted hover:text-fg'
              }`}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {t(item.key)}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-icon gap-1.5 px-2 text-xs sm:px-2.5"
            aria-label={t('author.x')}
            title={`${t('author.x')} · ${AUTHOR_HANDLE}`}
          >
            <IconX className="h-3.5 w-3.5" />
            <span className="hidden text-[13px] font-medium sm:inline">{AUTHOR_HANDLE}</span>
          </a>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => onLangChange(lang === 'zh' ? 'en' : 'zh')}
            aria-label={t('lang.toggle')}
            title={t('lang.toggle')}
          >
            <IconGlobe className="h-4 w-4" />
            <span className="sr-only">{lang === 'zh' ? 'English' : '中文'}</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => onThemeChange(nextTheme)}
            aria-label={t('theme.toggle')}
            title={t('theme.toggle')}
          >
            <ThemeIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-icon hidden sm:inline-flex"
            onClick={onOpenSettings}
            aria-label={t('action.settings')}
            title={t('action.settings')}
          >
            <IconSliders className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile navigation: a scrollable row of tabs, comfortable to tap. */}
      <div className="safe-x no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-line py-1.5 md:hidden">
        {NAV.map((item) => (
          <button
            key={item.route}
            type="button"
            onClick={() => onNavigate(item.route)}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-[13px] transition-colors ${
              route === item.route ? 'bg-surface2 font-medium text-fg' : 'text-muted'
            }`}
            aria-current={route === item.route ? 'page' : undefined}
          >
            {t(item.key)}
          </button>
        ))}
        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-9 shrink-0 rounded-lg px-3 text-[13px] text-muted"
        >
          {t('action.settings')}
        </button>
      </div>
    </header>
  );
}
