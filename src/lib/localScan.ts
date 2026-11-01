/** Local (offline) check path: the same analyser, fed from files the user pasted. */

import { analyze } from './analysis';
import type { Report, ResourceMeta } from './types';

export interface LocalInputs {
  robotsText?: string | null;
  sitemapTexts?: { text: string; source: string; isChild?: boolean }[];
  htmlText?: string | null;
  /** Optional site URL so relative links in HTML can be classified. */
  baseUrl?: string | null;
  fileNames?: string[];
}

export function runLocalCheck(inputs: LocalInputs): Report {
  const robots = (inputs.robotsText ?? '').trim() ? inputs.robotsText! : null;
  const html = (inputs.htmlText ?? '').trim() ? inputs.htmlText! : null;
  const sitemaps = (inputs.sitemapTexts ?? []).filter((item) => item.text.trim().length > 0);

  const ok = (label: string): ResourceMeta => ({ state: 'ok', message: undefined, url: label });
  const skipped = (): ResourceMeta => ({ state: 'not-checked', message: 'not-checked' });

  const sources = sitemaps.length > 0 ? sitemaps : [];

  return analyze({
    mode: 'local',
    target: {
      input: inputs.fileNames?.length ? inputs.fileNames.join(', ') : 'local files',
      url: inputs.baseUrl ?? undefined,
      origin: inputs.baseUrl ? safeOrigin(inputs.baseUrl) : undefined,
      host: inputs.baseUrl ? safeHost(inputs.baseUrl) : undefined,
    },
    http: null,
    htmlText: html,
    htmlMeta: html ? ok('html') : skipped(),
    robotsText: robots,
    robotsMeta: robots ? ok('robots.txt') : skipped(),
    sitemapTexts: sources,
    sitemapMeta: sources.length > 0 ? ok(sources[0].source) : skipped(),
  });
}

function safeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}
