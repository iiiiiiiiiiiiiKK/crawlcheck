import { useRef, useState } from 'react';
import { IconArrow, IconFile, IconLayers, IconSearch, IconSliders } from './Icons';
import { Callout } from './primitives';
import { useI18n } from '../i18n/context';
import type { ProgressStep } from '../lib/scanClient';
import type { LocalInputs } from '../lib/localScan';

export type ScanModeTab = 'online' | 'local' | 'demo';

interface ScanFormProps {
  mode: ScanModeTab;
  onModeChange: (mode: ScanModeTab) => void;
  busy: boolean;
  progress: ProgressStep | null;
  error: string | null;
  onScan: (url: string) => void;
  onLocalCheck: (inputs: LocalInputs) => void;
  onDemo: () => void;
  endpoint: string;
  onOpenSettings: () => void;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function ScanForm({
  mode,
  onModeChange,
  busy,
  progress,
  error,
  onScan,
  onLocalCheck,
  onDemo,
  endpoint,
  onOpenSettings,
}: ScanFormProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [local, setLocal] = useState({ robots: '', sitemap: '', html: '', baseUrl: '' });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitOnline = (event: React.FormEvent) => {
    event.preventDefault();
    onScan(url);
  };

  const submitLocal = () => {
    if (!local.robots.trim() && !local.sitemap.trim() && !local.html.trim()) {
      setLocalError(t('local.needOne'));
      return;
    }
    setLocalError(null);
    onLocalCheck({
      robotsText: local.robots,
      htmlText: local.html,
      baseUrl: local.baseUrl.trim() || null,
      sitemapTexts: local.sitemap.trim() ? [{ text: local.sitemap, source: 'sitemap.xml' }] : [],
      fileNames: [
        local.robots.trim() ? 'robots.txt' : null,
        local.sitemap.trim() ? 'sitemap.xml' : null,
        local.html.trim() ? 'index.html' : null,
      ].filter((value): value is string => !!value),
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-5 text-center sm:mb-7">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-4xl">
          {t('app.tagline')}
        </h1>
        <p className="mx-auto mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-muted sm:text-[15px]">
          {t('app.subtitle')}
        </p>
      </div>

      {/* mode tabs */}
      <div
        className="no-scrollbar mb-3 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1"
        role="tablist"
        aria-label={t('label.mode')}
      >
        {(['online', 'local', 'demo'] as ScanModeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mode === tab}
            onClick={() => onModeChange(tab)}
            className={`min-h-9 flex-1 shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors ${
              mode === tab ? 'bg-canvas text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'
            }`}
          >
            {t(`mode.${tab}`)}
          </button>
        ))}
      </div>

      {mode === 'online' ? (
        <form onSubmit={submitOnline} className="surface-card p-3 sm:p-4">
          <label htmlFor="site-url" className="mb-2 block text-[13px] font-medium text-muted">
            {t('input.label')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                id="site-url"
                ref={inputRef}
                className="field !pl-9"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t('input.placeholder')}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn btn-primary shrink-0" disabled={busy}>
              {busy ? t('action.scanning') : t('action.scan')}
              {!busy ? <IconArrow className="h-4 w-4" /> : null}
            </button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-subtle">
            <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full bg-subtle" />
            {t('input.hint')}
          </p>

          {busy ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2 text-[13px] text-muted" role="status">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-subtle border-t-transparent" />
              {t(`progress.${progress ?? 'home'}`)}
            </div>
          ) : null}

          {error ? (
            <div className="mt-3">
              <Callout tone="fail" title={t('error.title')}>
                {error}
              </Callout>
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <p className="font-medium text-fg">{t('online.cors.title')}</p>
            <p className="mt-1">{t('online.cors.body')}</p>
            <button type="button" onClick={onOpenSettings} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
              <IconSliders className="h-3.5 w-3.5" />
              {endpoint ? t('settings.scan') : t('online.endpoint.title')}
              <span className="mono truncate text-subtle">{endpoint ? shorten(endpoint) : ''}</span>
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'local' ? (
        <div className="surface-card p-3 sm:p-4">
          <p className="mb-3 text-[12.5px] leading-relaxed text-muted">{t('local.desc')}</p>
          <div className="grid gap-3">
            <LocalField
              id="robots-file"
              title={t('local.robots')}
              placeholder={'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml'}
              value={local.robots}
              onChange={(value) => setLocal((state) => ({ ...state, robots: value }))}
              accept=".txt,text/plain"
              busy={busy}
            />
            <LocalField
              id="sitemap-file"
              title={t('local.sitemap')}
              placeholder={'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>'}
              value={local.sitemap}
              onChange={(value) => setLocal((state) => ({ ...state, sitemap: value }))}
              accept=".xml,text/xml,application/xml"
              busy={busy}
            />
            <LocalField
              id="html-file"
              title={t('local.html')}
              placeholder={'<!doctype html>\n<html lang="en"><head><title>…</title></head><body>…</body></html>'}
              value={local.html}
              onChange={(value) => setLocal((state) => ({ ...state, html: value }))}
              accept=".html,.htm,text/html"
              busy={busy}
            />
            <div>
              <label htmlFor="local-base-url" className="mb-1.5 block text-[12.5px] font-medium text-muted">
                {t('input.label')} <span className="font-normal text-subtle">({t('label.details')})</span>
              </label>
              <input
                id="local-base-url"
                className="field"
                type="text"
                inputMode="url"
                spellCheck={false}
                placeholder={t('input.placeholder')}
                value={local.baseUrl}
                onChange={(event) => setLocal((state) => ({ ...state, baseUrl: event.target.value }))}
                disabled={busy}
              />
            </div>
          </div>

          {localError ? (
            <div className="mt-3">
              <Callout tone="fail">{localError}</Callout>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-subtle">{t('local.summary')}</p>
            <button type="button" className="btn btn-primary shrink-0" onClick={submitLocal} disabled={busy}>
              {t('action.analyse')}
              <IconArrow className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'demo' ? (
        <div className="surface-card p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-fg">
              <IconLayers className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('mode.demo.name')}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{t('mode.demo.desc')}</p>
              <button type="button" className="btn btn-primary mt-3" onClick={onDemo}>
                {t('action.tryDemo')}
                <IconArrow className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11.5px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <IconFile className="h-3.5 w-3.5" />
          {t('app.badge.local')}
        </span>
        <span aria-hidden="true">·</span>
        <span>{t('app.badge.opensource')}</span>
        <span aria-hidden="true">·</span>
        <a
          href="https://x.com/0xkillcoin"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-fg"
        >
          @0xkillcoin
        </a>
      </div>
    </div>
  );
}

function LocalField({
  id,
  title,
  value,
  onChange,
  placeholder,
  accept,
  busy,
}: {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accept: string;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError(t('local.tooBig', { size: 2 }));
      return;
    }
    try {
      const text = await file.text();
      onChange(text);
      setName(file.name);
      setError(null);
    } catch {
      setError(t('local.tooBig', { size: 2 }));
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface2/60 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[12.5px] font-medium">
          {title}
        </label>
        <div className="flex items-center gap-1.5">
          {value ? (
            <button
              type="button"
              className="text-[11.5px] text-subtle hover:text-fg"
              onClick={() => {
                onChange('');
                setName(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              {t('action.remove')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost !min-h-8 !px-2 text-[12px]" onClick={() => fileRef.current?.click()} disabled={busy}>
            <IconFile className="h-3.5 w-3.5" />
            {t('action.chooseFile')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            aria-label={title}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
        </div>
      </div>
      <textarea
        id={id}
        className="field mono !min-h-24 resize-y !text-[12.5px] leading-relaxed"
        rows={4}
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={busy}
      />
      {name ? <p className="mt-1 truncate text-[11px] text-subtle">{t('local.loaded', { name })}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-fail">{error}</p> : null}
    </div>
  );
}

function shorten(value: string): string {
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return value;
  }
}
