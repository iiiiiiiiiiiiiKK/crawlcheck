/**
 * Wire protocol shared by the web app and the optional scan service
 * (`worker/`). Keeping it in one file means the Worker and the client can never
 * drift apart.
 */

import type { ResourceState } from './types';

export interface RemoteFetchMeta {
  state: ResourceState;
  /** HTTP status, when the server answered at all. */
  status?: number;
  finalUrl?: string;
  contentType?: string;
  bytes?: number;
  redirects?: number;
  /** Machine code: 'cors' | 'timeout' | 'too-large' | 'ssrf' | 'dns' | 'network'. */
  message?: string;
  /** Bytes truncated because of the size limit. */
  truncated?: boolean;
}

export interface RemoteDoc {
  meta: RemoteFetchMeta;
  body?: string;
}

export interface RemoteSitemap extends RemoteDoc {
  source: string;
  isChild: boolean;
}

export interface ScanRequest {
  url: string;
}

export interface ScanResponseOk {
  ok: true;
  target: { input: string; url: string; origin: string; host: string };
  home: RemoteDoc;
  robots: RemoteDoc;
  sitemaps: RemoteSitemap[];
  service: {
    name: string;
    version: string;
    limits: Record<string, string | number>;
  };
}

export interface ScanResponseError {
  ok: false;
  code: string;
  message: string;
}

export type ScanResponse = ScanResponseOk | ScanResponseError;

export const SCAN_SERVICE_NAME = 'crawlcheck-scan';
export const SCAN_SERVICE_VERSION = '1.0.0';
