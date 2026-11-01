import { useCallback, useEffect, useRef, useState } from 'react';
import { Header, type Route } from './components/Header';
import { ScanForm, type ScanModeTab } from './components/ScanForm';
import { SettingsDialog } from './components/SettingsDialog';
import { Toast } from './components/primitives';
import { ReportView, type ReportSection } from './views/ReportView';
import { HistoryView } from './views/HistoryView';
import { AboutView } from './views/AboutView';
import { LangProvider, useI18n } from './i18n/context';
import { t as translate } from './i18n';
import { loadLang, loadTheme, loadEndpoint, saveLang, saveTheme, saveEndpoint, applyTheme, type Theme } from './state/prefs';
import { runOnlineScan, type ProgressStep, type ScanOutcome } from './lib/scanClient';
import { runLocalCheck, type LocalInputs } from './lib/localScan';
import { buildDemoReport } from './lib/demo';
import { clearHistory, deleteEntry, listHistory, saveReport } from './lib/history';
import { download, reportFilename, toJsonReport, toMarkdown } from './lib/export';
import { AUTHOR_HANDLE, AUTHOR_URL, REPO_URL } from './constants';
import type { HistoryEntry, Report } from './lib/types';
import type { Lang } from './i18n';

const ROUTES: Route[] = ['scan', 'report', 'history', 'about'];

function readRoute(): Route {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    const candidate = raw as Route;
    return ROUTES.includes(candidate) ? candidate : 'scan';
  } catch {
    return 'scan';
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => loadLang());
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [endpoint, setEndpoint] = useState<string>(() => loadEndpoint());
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [scanMode, setScanMode] = useState<ScanModeTab>('online');
  const [report, setReport] = useState<Report | null>(null);
  const [transport, setTransport] = useState<'direct' | 'endpoint' | null>(null);
  const [section, setSection] = useState<ReportSection>('overview');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ------------------------------------------------------------ effects */

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    saveLang(lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    const list = await listHistory();
    setEntries(list);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  /* ---------------------------------------------------------- navigation */

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    const hash = `#/${next}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  /* -------------------------------------------------------------- scans */

  const L = (key: string, params?: Record<string, string | number>): string | null => {
    const text = translate(lang, key, params);
    return text === key ? null : text;
  };

  const describeFailure = (failure: Extract<ScanOutcome, { ok: false }>): string => {
    if (failure.code === 'ssrf.blocked') {
      const reasonKey = `error.ssrf.reason.${failure.reason ?? 'ip-format'}`;
      const reason = L(reasonKey) ?? failure.reason ?? '';
      return L('error.ssrf.blocked', { reason }) ?? '';
    }
    const key = `error.${failure.code}`;
    return L(key, { detail: failure.detail ?? '' }) ?? L('error.unknown') ?? '';
  };

  const persist = useCallback(
    async (value: Report) => {
      if (value.mode === 'demo') return;
      await saveReport(value);
      await refreshHistory();
    },
    [refreshHistory],
  );

  const handleScan = async (rawUrl: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanError(null);
    setBusy(true);
    setProgress('home');
    try {
      const outcome = await runOnlineScan(rawUrl, {
        endpoint: endpoint || null,
        onProgress: setProgress,
        signal: controller.signal,
      });
      if (!outcome.ok) {
        setScanError(describeFailure(outcome));
        return;
      }
      setReport(outcome.report);
      setTransport(outcome.transport);
      setSection('overview');
      await persist(outcome.report);
      navigate('report');
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const handleLocal = async (inputs: LocalInputs) => {
    setScanError(null);
    const value = runLocalCheck(inputs);
    setReport(value);
    setTransport(null);
    setSection('overview');
    await persist(value);
    navigate('report');
  };

  const handleDemo = () => {
    setScanError(null);
    const value = buildDemoReport();
    setReport(value);
    setTransport(null);
    setSection('overview');
    navigate('report');
  };

  /* ------------------------------------------------------------ exports */

  const exportJson = () => {
    if (!report) return;
    download(reportFilename(report, 'json'), JSON.stringify(toJsonReport(report, lang), null, 2), 'application/json');
  };

  const exportMarkdown = () => {
    if (!report) return;
    download(reportFilename(report, 'md'), toMarkdown(report, lang), 'text/markdown');
  };

  /* ------------------------------------------------------------ history */

  const handleOpenEntry = (entry: HistoryEntry) => {
    setReport(entry.report);
    setTransport(null);
    setSection('overview');
    navigate('report');
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteEntry(id);
    await refreshHistory();
    setToastMessage(translate(lang, 'history.deleted'));
  };

  const handleClearHistory = async () => {
    await clearHistory();
    await refreshHistory();
    setToastMessage(translate(lang, 'history.cleared'));
  };

  const handleClearAllData = async () => {
    await clearHistory();
    await refreshHistory();
    saveEndpoint('');
    setEndpoint('');
    setReport(null);
  };

  /* -------------------------------------------------------------- render */

  const showReport = route === 'report' && report !== null;

  return (
    <LangProvider lang={lang}>
      <div className="flex min-h-screen flex-col">
        <button
          type="button"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:text-canvas"
          onClick={() => document.getElementById('main')?.focus()}
        >
          <SkipLabel />
        </button>

        <Header
          lang={lang}
          theme={theme}
          route={showReport ? 'report' : route}
          onLangChange={setLang}
          onThemeChange={setTheme}
          onNavigate={(next) => {
            if (next === 'report' && !report) {
              navigate('scan');
              return;
            }
            navigate(next);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main id="main" className="safe-x flex-1 py-5 sm:py-8">
          {route === 'scan' || (route === 'report' && !report) ? (
            <div className="flex min-h-[60vh] flex-col justify-center">
              <ScanForm
                mode={scanMode}
                onModeChange={setScanMode}
                busy={busy}
                progress={progress}
                error={scanError}
                onScan={(url) => void handleScan(url)}
                onLocalCheck={(inputs) => void handleLocal(inputs)}
                onDemo={handleDemo}
                endpoint={endpoint}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          ) : null}

          {showReport && report ? (
            <ReportView
              report={report}
              transport={transport}
              section={section}
              onSectionChange={setSection}
              onBack={() => navigate('scan')}
              onExportJson={exportJson}
              onExportMarkdown={exportMarkdown}
            />
          ) : null}

          {route === 'history' ? (
            <HistoryView
              entries={entries}
              loading={historyLoading}
              onOpen={handleOpenEntry}
              onDelete={(id) => void handleDeleteEntry(id)}
              onClear={() => void handleClearHistory()}
              onGoScan={() => navigate('scan')}
            />
          ) : null}

          {route === 'about' ? <AboutView /> : null}
        </main>

        <footer className="safe-x safe-b border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 py-4 text-[11.5px] text-subtle sm:flex-row">
            <span>CrawlCheck · MIT · {new Date().getFullYear()}</span>
            <div className="flex items-center gap-3">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                GitHub
              </a>
              <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                {AUTHOR_HANDLE}
              </a>
              <a href="#/about" onClick={(event) => { event.preventDefault(); navigate('about'); }} className="hover:text-fg">
                MIT License
              </a>
            </div>
          </div>
        </footer>

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          onTheme={setTheme}
          lang={lang}
          onLang={setLang}
          endpoint={endpoint}
          onEndpoint={(value) => {
            saveEndpoint(value);
            setEndpoint(value);
          }}
          onClearData={() => void handleClearAllData()}
          toast={setToastMessage}
        />

        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      </div>
    </LangProvider>
  );
}

function SkipLabel() {
  const { t } = useI18n();
  return <>{t('a11y.skip')}</>;
}
