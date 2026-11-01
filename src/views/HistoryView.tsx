import { useState } from 'react';
import { IconArrow, IconClock, IconTrash } from '../components/Icons';
import { EmptyState, Modal, SectionHeading } from '../components/primitives';
import { useI18n } from '../i18n/context';
import type { HistoryEntry } from '../lib/types';

interface HistoryViewProps {
  entries: HistoryEntry[];
  loading: boolean;
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onGoScan: () => void;
}

export function HistoryView({ entries, loading, onOpen, onDelete, onClear, onGoScan }: HistoryViewProps) {
  const { t, lang } = useI18n();
  const [pending, setPending] = useState<{ kind: 'one'; id: string } | { kind: 'all' } | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <SectionHeading
        title={`${t('history.title')}${entries.length ? ` · ${t('history.count', { count: entries.length })}` : ''}`}
        hint={t('history.subtitle')}
        actions={
          entries.length > 0 ? (
            <button type="button" className="btn btn-ghost !min-h-9 !px-2.5 text-[12.5px]" onClick={() => setPending({ kind: 'all' })}>
              <IconTrash className="h-3.5 w-3.5" />
              {t('action.clearAll')}
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="surface-card flex items-center justify-center py-12 text-sm text-muted">{t('progress.analyse')}</div>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('history.empty')}
          hint={t('history.emptyHint')}
          action={
            <button type="button" className="btn btn-primary" onClick={onGoScan}>
              {t('action.scan')}
              <IconArrow className="h-4 w-4" />
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="surface-card px-3.5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface2">
                  <span className="mono text-[15px] font-semibold leading-none tabular-nums">{entry.grade === 'N/A' ? '—' : entry.score}</span>
                  <span className="mt-0.5 text-[9.5px] font-medium uppercase text-subtle">{entry.grade}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="mono truncate text-[13.5px] font-medium" title={entry.input}>
                      {entry.host ?? entry.input}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                      {entry.mode === 'online' ? t('mode.online') : entry.mode === 'local' ? t('mode.local') : t('mode.demo')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-subtle">
                    <span className="inline-flex items-center gap-1">
                      <IconClock className="h-3 w-3" />
                      {formatDate(entry.createdAt, lang)}
                    </span>
                    <span className="text-fail">● {entry.fail}</span>
                    <span className="text-warn">● {entry.warn}</span>
                    <span className="text-unv">● {entry.unverified}</span>
                    <span className="text-pass">● {entry.pass}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="btn btn-ghost !min-h-8 !px-2 text-[12px]" onClick={() => onOpen(entry)}>
                    {t('action.open')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon !min-h-8 !min-w-8"
                    onClick={() => setPending({ kind: 'one', id: entry.id })}
                    aria-label={t('action.delete')}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] text-subtle">
        {t('history.local')} · {t('footer.made')}
      </p>

      <Modal
        open={pending !== null}
        title={pending?.kind === 'all' ? t('action.clearAll') : t('action.delete')}
        onClose={() => setPending(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              {t('action.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (pending?.kind === 'all') onClear();
                else if (pending?.kind === 'one') onDelete(pending.id);
                setPending(null);
              }}
            >
              {t('action.delete')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {pending?.kind === 'all' ? t('history.clearConfirm') : t('history.deleteOne')}
        </p>
      </Modal>
    </div>
  );
}

function formatDate(iso: string, lang: 'zh' | 'en'): string {
  try {
    return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
