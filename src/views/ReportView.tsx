import { useMemo } from 'react';
import { IconArrow, IconDownload, IconExternal, IconLayers } from '../components/Icons';
import { Stat, StatusPill } from '../components/primitives';
import { OverviewPanel } from './panels/OverviewPanel';
import { HtmlPanel, RobotsPanel, SeoPanel, SitemapPanel } from './panels/SectionPanels';
import { useI18n } from '../i18n/context';
import type { Category, Report } from '../lib/types';

export type ReportSection = 'overview' | Category;

const SECTIONS: { key: ReportSection; labelKey: string; category?: Category }[] = [
  { key: 'overview', labelKey: 'nav.overview' },
  { key: 'robots', labelKey: 'nav.robots', category: 'robots' },
  { key: 'sitemap', labelKey: 'nav.sitemap', category: 'sitemap' },
  { key: 'seo', labelKey: 'nav.seo', category: 'seo' },
  { key: 'html', labelKey: 'nav.html', category: 'html' },
];

interface ReportViewProps {
  report: Report;
  transport: 'direct' | 'endpoint' | null;
  section: ReportSection;
  onSectionChange: (section: ReportSection) => void;
  onBack: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
}

export function ReportView({ report, transport, section, onSectionChange, onBack, onExportJson, onExportMarkdown }: ReportViewProps) {
  const { t, lang } = useI18n();
  const counts = useMemo(() => {
    const map: Record<string, { fail: number; warn: number }> = {};
    for (const finding of report.findings) {
      if (finding.category === 'url') continue;
      const entry = map[finding.category] ?? { fail: 0, warn: 0 };
      if (finding.status === 'fail') entry.fail += 1;
      if (finding.status === 'warn') entry.warn += 1;
      map[finding.category] = entry;
    }
    return map;
  }, [report]);

  const checkedAt = formatDate(report.createdAt, lang);
  const target = report.target.host ?? report.target.input;

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* toolbar: back + actions on the first phone row, target on its own row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost order-1 !min-h-9 !px-2.5 text-[13px]" onClick={onBack}>
          <IconArrow className="h-3.5 w-3.5 rotate-180" />
          {t('action.backToScan')}
        </button>
        <div className="order-3 min-w-0 basis-full sm:order-2 sm:basis-auto sm:flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="mono min-w-0 flex-1 truncate text-[13.5px] font-medium" title={report.target.url ?? report.target.input}>
              {target}
            </h1>
            {report.mode === 'demo' ? (
              <span className="shrink-0 rounded-full bg-unvbg px-2 py-0.5 text-[10.5px] font-medium text-unv">{t('mode.demo.name')}</span>
            ) : null}
            {report.mode === 'local' ? (
              <span className="shrink-0 rounded-full bg-unvbg px-2 py-0.5 text-[10.5px] font-medium text-unv">{t('mode.local.name')}</span>
            ) : null}
          </div>
        </div>
        <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 sm:order-3">
          <button type="button" className="btn btn-ghost !min-h-9 !px-2.5 text-[12.5px]" onClick={onExportMarkdown}>
            <IconDownload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Markdown</span>
            <span className="sm:hidden">MD</span>
          </button>
          <button type="button" className="btn btn-ghost !min-h-9 !px-2.5 text-[12.5px]" onClick={onExportJson}>
            <IconDownload className="h-3.5 w-3.5" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[190px_minmax(0,1fr)_230px]">
        {/* desktop section nav */}
        <nav className="hidden lg:block" aria-label={t('nav.report')}>
          <ul className="sticky top-[104px] space-y-0.5">
            {SECTIONS.map((item) => {
              const badge = item.category ? counts[item.category] : undefined;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onSectionChange(item.key)}
                    aria-current={section === item.key ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                      section === item.key ? 'bg-surface2 font-medium text-fg' : 'text-muted hover:bg-surface2/60 hover:text-fg'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    {badge && badge.fail > 0 ? (
                      <span className="mono shrink-0 rounded bg-failbg px-1.5 text-[10.5px] font-medium text-fail">{badge.fail}</span>
                    ) : null}
                    {badge && badge.warn > 0 ? (
                      <span className="mono shrink-0 rounded bg-warnbg px-1.5 text-[10.5px] font-medium text-warn">{badge.warn}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* mobile section tabs */}
        <div className="-mx-4 mb-3 px-4 lg:hidden">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {SECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSectionChange(item.key)}
                aria-current={section === item.key ? 'true' : undefined}
                className={`min-h-9 shrink-0 rounded-lg border px-3 text-[12.5px] font-medium transition-colors ${
                  section === item.key
                    ? 'border-line bg-surface text-fg'
                    : 'border-transparent bg-surface2/60 text-muted'
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {/* Section title for assistive technology and document structure. */}
          <h1 className="sr-only">{t(SECTIONS.find((item) => item.key === section)?.labelKey ?? 'nav.overview')}</h1>

          {/* mobile info summary */}
          <details className="surface-card mb-4 lg:hidden">
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-medium">{t('overview.infoPanel')}</summary>
            <div className="border-t border-line px-3.5 py-3">
              <InfoBody report={report} transport={transport} checkedAt={checkedAt} />
            </div>
          </details>

          {section === 'overview' ? <OverviewPanel report={report} /> : null}
          {section === 'robots' ? <RobotsPanel report={report} /> : null}
          {section === 'sitemap' ? <SitemapPanel report={report} /> : null}
          {section === 'seo' ? <SeoPanel report={report} /> : null}
          {section === 'html' ? <HtmlPanel report={report} /> : null}

          {/* mobile limitation reminder */}
          <p className="mt-6 flex items-center gap-1.5 text-[11px] text-subtle">
            <IconLayers className="h-3.5 w-3.5" />
            {t('footer.made')}
          </p>
        </div>

        {/* desktop info rail */}
        <aside className="hidden xl:block">
          <div className="surface-card sticky top-[104px] px-3.5 py-3.5">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-subtle">{t('overview.infoPanel')}</p>
            <InfoBody report={report} transport={transport} checkedAt={checkedAt} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function InfoBody({ report, transport, checkedAt }: { report: Report; transport: 'direct' | 'endpoint' | null; checkedAt: string }) {
  const { t, lim } = useI18n();
  const modeLabel =
    report.mode === 'online' ? t('mode.online.name') : report.mode === 'local' ? t('mode.local.name') : t('mode.demo.name');
  const transportLabel =
    report.mode === 'demo'
      ? t('label.transport.demo')
      : report.mode === 'local'
        ? t('label.transport.local')
        : transport === 'endpoint'
          ? t('label.transport.endpoint')
          : transport === 'direct'
            ? t('label.transport.direct')
            : '—';

  return (
    <div className="space-y-2.5">
      <Stat label={t('label.mode')} value={modeLabel} />
      <Stat label={t('label.transport')} value={transportLabel} />
      <Stat label={t('label.checkedAt')} value={checkedAt} />
      <Stat label={t('label.target')} value={report.target.url ?? report.target.input} />
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <StatusPill status="fail" compact />
        <span className="mono text-[12px] text-muted">{report.score.fail}</span>
        <StatusPill status="warn" compact />
        <span className="mono text-[12px] text-muted">{report.score.warn}</span>
        <StatusPill status="unverified" compact />
        <span className="mono text-[12px] text-muted">{report.score.unverified}</span>
      </div>

      {report.limitationCodes.length > 0 ? (
        <div className="space-y-1.5 border-t border-line pt-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t('label.limitations')}</p>
          {report.limitationCodes.map((code) => {
            const text = lim(code);
            return (
              <p key={code} className="text-[11.5px] leading-relaxed text-muted">
                · {text.title}
              </p>
            );
          })}
        </div>
      ) : null}

      {report.target.url ? (
        <a
          href={report.target.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 border-t border-line pt-2.5 text-[11.5px] font-medium text-accent hover:underline"
        >
          <IconExternal className="h-3 w-3" />
          {t('action.open')}
        </a>
      ) : null}
    </div>
  );
}

function formatDate(iso: string, lang: 'zh' | 'en'): string {
  try {
    return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
