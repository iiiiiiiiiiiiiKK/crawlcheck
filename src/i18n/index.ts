/**
 * Translation helpers. Deliberately tiny: no runtime i18n framework needed for a
 * two-language product, and this keeps the initial bundle small.
 */

import { FINDING_MESSAGES, type Msg } from './findings';
import { UI } from './ui';
import type { Finding, Report } from '../lib/types';

export type Lang = 'zh' | 'en';
export const LANGS: Lang[] = ['zh', 'en'];

/** Readable text for the machine reasons used in `{reason}` placeholders. */
const REASONS: Record<string, Msg> = {
  cors: { zh: '浏览器跨域限制（CORS）', en: 'browser CORS restriction' },
  network: { zh: '网络不可达', en: 'network unreachable' },
  timeout: { zh: '请求超时', en: 'request timed out' },
  'too-large': { zh: '响应体超过大小限制', en: 'response exceeded the size limit' },
  blocked: { zh: '跨域被浏览器拦截', en: 'blocked by the browser' },
  'not-checked': { zh: '未检查', en: 'not checked' },
  missing: { zh: '资源不存在', en: 'resource missing' },
  error: { zh: '抓取失败', en: 'fetch failed' },
  ssrf: { zh: '安全策略拒绝', en: 'blocked by the safety policy' },
  dns: { zh: 'DNS 解析失败', en: 'DNS resolution failed' },
  'rate-limited': { zh: '请求频率超限', en: 'rate limited' },
};

export function reasonText(lang: Lang, code: string): string {
  const known = REASONS[code];
  if (known) return known[lang];
  if (/^http-\d{3}$/.test(code)) return lang === 'zh' ? `HTTP ${code.slice(5)}` : `HTTP ${code.slice(5)}`;
  return code;
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const msg = UI[key];
  if (!msg) return key;
  return interpolate(msg[lang], params);
}

export function hasUiKey(key: string): boolean {
  return !!UI[key];
}

export interface FindingText {
  title: string;
  detail?: string;
  why?: string;
  fix?: string;
}

export function findingText(lang: Lang, finding: Finding): FindingText {
  const msg = FINDING_MESSAGES[finding.code];
  if (!msg) {
    return { title: finding.code, detail: Object.keys(finding.params).length ? JSON.stringify(finding.params) : undefined };
  }
  const params: Record<string, string | number> = { ...finding.params };
  if (typeof params.reason === 'string') params.reason = reasonText(lang, params.reason);
  return {
    title: msg.title[lang],
    detail: msg.detail ? interpolate(msg.detail[lang], params) : undefined,
    why: msg.why ? interpolate(msg.why[lang], params) : undefined,
    fix: msg.fix ? interpolate(msg.fix[lang], params) : undefined,
  };
}

export function limitationText(lang: Lang, code: string): FindingText {
  const msg = FINDING_MESSAGES[code];
  if (!msg) return { title: code };
  return {
    title: msg.title[lang],
    detail: msg.detail ? msg.detail[lang] : undefined,
  };
}

export function findingTitle(lang: Lang, finding: Finding): string {
  return findingText(lang, finding).title;
}

/** One-line human summary, used by Markdown export and the history list. */
export function reportHeadline(lang: Lang, report: Report): string {
  const { score } = report;
  const target = report.target.host ?? report.target.input;
  if (lang === 'zh') {
    return `${target}：健康度 ${score.value}/100（${score.grade}），错误 ${score.fail} · 警告 ${score.warn} · 无法验证 ${score.unverified}`;
  }
  return `${target}: health ${score.value}/100 (${score.grade}), errors ${score.fail} · warnings ${score.warn} · unverified ${score.unverified}`;
}

export { FINDING_MESSAGES } from './findings';
export { UI } from './ui';
