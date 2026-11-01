import { Callout, SectionHeading, Stat } from '../../components/primitives';
import { FindingList } from '../../components/FindingCard';
import { IconExternal } from '../../components/Icons';
import { useI18n } from '../../i18n/context';
import { blocksEverything } from '../../lib/robots';
import type { Report, RobotsDoc, SitemapDoc } from '../../lib/types';

const PREVIEW_LIMIT = 20;

/* ------------------------------------------------------------------ robots */

export function RobotsPanel({ report }: { report: Report }) {
  const { t } = useI18n();
  const doc = report.robots;
  const findings = report.findings.filter((finding) => finding.category === 'robots');

  return (
    <div className="space-y-5">
      <SectionHeading
        title={t('nav.robots')}
        hint={doc ? `${doc.lines} ${t('label.info')} · ${doc.bytes} B` : undefined}
      />
      <FindingList findings={findings} />

      {doc ? <RuleGroups doc={doc} /> : null}

      {doc && doc.raw ? (
        <details className="surface-card overflow-hidden">
          <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-medium">{t('robots.raw')}</summary>
          <pre className="mono max-h-80 overflow-auto border-t border-line bg-surface2 px-3.5 py-3 text-[11.5px] leading-relaxed">
            {doc.raw}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function RuleGroups({ doc }: { doc: RobotsDoc }) {
  const { t } = useI18n();
  if (doc.groups.length === 0) {
    return <Callout tone="neutral">{t('robots.empty')}</Callout>;
  }
  return (
    <section>
      <SectionHeading title={t('robots.groups')} />
      <div className="space-y-2.5">
        {doc.groups.map((group, index) => {
          const blocked = blocksEverything(group);
          return (
            <div key={`${group.agents.join('-')}-${index}`} className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface2 px-3.5 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{t('robots.agent')}</span>
                {group.agents.map((agent) => (
                  <code key={agent} className="mono rounded bg-canvas px-1.5 py-0.5 text-[12px] ring-1 ring-line">
                    {agent}
                  </code>
                ))}
                {blocked ? (
                  <span className="ml-auto rounded-full bg-failbg px-2 py-0.5 text-[11px] font-medium text-fail">
                    Disallow: /
                  </span>
                ) : null}
                {typeof group.crawlDelay === 'number' ? (
                  <span className="rounded-full bg-warnbg px-2 py-0.5 text-[11px] font-medium text-warn">
                    {t('robots.crawlDelay', { value: group.crawlDelay })}
                  </span>
                ) : null}
              </div>
              <ul className="divide-y divide-line">
                {group.rules.length === 0 ? (
                  <li className="px-3.5 py-2 text-[12.5px] text-subtle">{t('robots.noRules')}</li>
                ) : null}
                {group.rules.map((rule) => {
                  const dangerous = rule.type === 'disallow' && rule.path === '/';
                  return (
                    <li
                      key={`${rule.type}-${rule.path}-${rule.line}`}
                      className={`flex flex-wrap items-baseline gap-x-2 px-3.5 py-1.5 text-[12.5px] ${dangerous ? 'bg-failbg/60' : ''}`}
                    >
                      <span className={`mono w-16 shrink-0 font-medium ${rule.type === 'allow' ? 'text-pass' : dangerous ? 'text-fail' : 'text-muted'}`}>
                        {rule.type === 'allow' ? t('robots.allow') : t('robots.disallow')}
                      </span>
                      <code className="mono min-w-0 flex-1 break-all">{rule.path || '""'}</code>
                      <span className="mono shrink-0 text-[11px] text-subtle">L{rule.line}</span>
                    </li>
                  );
                })}
                {group.sitemaps.map((sitemap) => (
                  <li key={sitemap} className="flex flex-wrap items-baseline gap-x-2 px-3.5 py-1.5 text-[12.5px]">
                    <span className="mono w-16 shrink-0 font-medium text-muted">Sitemap</span>
                    <code className="mono min-w-0 flex-1 break-all text-accent">{sitemap}</code>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- sitemap */

export function SitemapPanel({ report }: { report: Report }) {
  const { t } = useI18n();
  const findings = report.findings.filter((finding) => finding.category === 'sitemap');

  return (
    <div className="space-y-5">
      <SectionHeading title={t('nav.sitemap')} hint={report.sitemaps.length > 0 ? `${report.sitemaps.length} · ${t('sitemap.summary')}` : undefined} />
      <FindingList findings={findings} />
      {report.sitemaps.length === 0 ? <Callout tone="neutral">{t('sitemap.none')}</Callout> : null}
      {report.sitemaps.map((doc) => (
        <SitemapDocCard key={`${doc.source}-${doc.isChild ? 'child' : 'main'}`} doc={doc} />
      ))}
    </div>
  );
}

function SitemapDocCard({ doc }: { doc: SitemapDoc }) {
  const { t } = useI18n();
  const isIndex = doc.kind === 'index';
  const list = isIndex ? doc.childSitemaps : doc.entries;
  const count = list.length;

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface2 px-3.5 py-2">
        <code className="mono min-w-0 flex-1 truncate text-[12px]" title={doc.source}>
          {doc.source}
        </code>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium ring-1 ring-line">
          {isIndex ? t('sitemap.kind.index') : doc.kind === 'urlset' ? t('sitemap.kind.urlset') : '—'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-line px-3.5 py-2.5">
        <Stat label={isIndex ? t('sitemap.children') : t('sitemap.urls')} value={count} />
        <Stat label={t('sitemap.duplicates')} value={doc.duplicates.length} tone={doc.duplicates.length ? 'text-warn' : undefined} />
        <Stat label={t('html.size')} value={`${Math.round(doc.bytes / 1024)} KB`} />
      </div>

      {doc.parseError ? (
        <div className="p-3.5">
          <Callout tone="fail" title={t('sitemap.invalid-xml')}>
            <code className="mono text-[12px]">{doc.parseError}</code>
          </Callout>
        </div>
      ) : null}

      {list.length > 0 ? (
        <div className="px-3.5 py-2.5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            {t('sitemap.preview', { count: Math.min(list.length, PREVIEW_LIMIT) })}
          </p>
          <ul className="divide-y divide-line">
            {list.slice(0, PREVIEW_LIMIT).map((entry, index) => (
              <li key={`${entry.loc}-${index}`} className="flex items-baseline gap-2 py-1.5">
                <span
                  className={`mono shrink-0 text-[10px] ${entry.valid ? 'text-pass' : 'text-fail'}`}
                  aria-label={entry.valid ? t('status.pass') : t('status.fail')}
                >
                  {entry.valid ? '●' : '✗'}
                </span>
                <code className="mono min-w-0 flex-1 break-all text-[11.5px]">{entry.loc || '—'}</code>
                {entry.lastmod ? <span className="mono shrink-0 text-[11px] text-subtle">{entry.lastmod}</span> : null}
              </li>
            ))}
          </ul>
          {list.length > PREVIEW_LIMIT ? (
            <p className="mt-1.5 text-[11px] text-subtle">+{list.length - PREVIEW_LIMIT}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- seo */

export function SeoPanel({ report }: { report: Report }) {
  const { t } = useI18n();
  const findings = report.findings.filter((finding) => finding.category === 'seo');
  const html = report.html;

  return (
    <div className="space-y-5">
      <SectionHeading title={t('nav.seo')} />
      {html ? (
        <div className="surface-card divide-y divide-line">
          <MetaRow label={t('seo.title')} value={html.title} />
          <MetaRow label={t('seo.description')} value={html.description} />
          <MetaRow label={t('seo.h1')} value={html.h1.length ? html.h1.join(' · ') : null} />
          <MetaRow label={t('seo.canonical')} value={html.canonical} mono />
          <MetaRow label={t('seo.robotsmeta')} value={html.robotsMeta.join(', ') || null} mono />
          <MetaRow label={t('seo.lang')} value={html.lang} mono />
          <MetaRow label={t('seo.viewport')} value={html.viewport} mono />
          <MetaRow label={t('seo.og')} value={Object.keys(html.og).length ? `${Object.keys(html.og).length} · ${Object.keys(html.og).join(', ')}` : null} mono />
          <MetaRow label={t('seo.twitter')} value={Object.keys(html.twitter).length ? Object.keys(html.twitter).join(', ') : null} mono />
        </div>
      ) : null}
      <FindingList findings={findings} />
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[92px_1fr] items-baseline gap-3 px-3.5 py-2 sm:grid-cols-[130px_1fr]">
      <span className="text-[11.5px] font-medium uppercase tracking-wider text-subtle">{label}</span>
      <span className={`min-w-0 break-words text-[12.5px] ${mono ? 'mono' : ''} ${value ? 'text-fg' : 'text-subtle'}`}>
        {value ?? t('label.none')}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------- html */

export function HtmlPanel({ report }: { report: Report }) {
  const { t } = useI18n();
  const findings = report.findings.filter((finding) => finding.category === 'html');
  const html = report.html;

  return (
    <div className="space-y-5">
      <SectionHeading title={t('nav.html')} hint={html ? `${Math.round(html.bytes / 1024)} KB` : undefined} />
      {html ? (
        <div className="surface-card grid grid-cols-2 gap-x-3 gap-y-3.5 px-3.5 py-3.5 sm:grid-cols-3">
          <Stat label={t('html.images')} value={t('html.images.missing', { missing: html.images.missingAlt, total: html.images.total })} />
          <Stat label={t('html.links')} value={t('html.links.count', { internal: html.links.internal, external: html.links.external })} />
          <Stat label={t('html.headings')} value={t('html.headings.count', { h1: html.h1.length, h2: html.h2Count })} />
          <Stat label={t('html.structured')} value={`${html.structuredData}`} />
          <Stat label={t('html.charset')} value={html.charset ? html.charset.slice(0, 24) : '—'} />
          <Stat label={t('html.size')} value={`${Math.round(html.bytes / 1024)} KB`} />
        </div>
      ) : null}
      <FindingList findings={findings} />
      {report.htmlMeta.state === 'ok' && report.target.url ? (
        <a
          href={report.target.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
        >
          <IconExternal className="h-3.5 w-3.5" />
          {report.target.url}
        </a>
      ) : null}
    </div>
  );
}
