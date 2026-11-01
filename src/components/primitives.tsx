import { useEffect, useRef, useState, type ReactNode } from 'react';
import { STATUS_ICON, STATUS_STYLE, IconChevron, IconCross } from './Icons';
import { useI18n } from '../i18n/context';
import type { Status } from '../lib/types';

/* ----------------------------------------------------------- status pill */

export function StatusPill({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useI18n();
  const Icon = STATUS_ICON[status];
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style.bg} ${style.text} ${style.ring}`}
      data-status={status}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{t(compact ? `status.${status}.short` : `status.${status}`)}</span>
    </span>
  );
}

/* -------------------------------------------------------------- score ring */

export function ScoreRing({ value, grade, size = 132 }: { value: number; grade: string; size?: number }) {
  const stroke = size < 110 ? 7 : 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, value / 100));
  const tone = value >= 80 ? 'var(--pass)' : value >= 60 ? 'var(--warn)' : 'var(--fail)';
  const color = grade === 'N/A' ? 'var(--fg-subtle)' : tone;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-3xl font-semibold tabular-nums leading-none" style={{ color }}>
          {grade === 'N/A' ? '—' : value}
        </span>
        <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-subtle">{grade}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</div>
      <div className={`mt-1 truncate text-sm font-medium ${tone ?? 'text-fg'}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </div>
    </div>
  );
}

export function Callout({
  tone = 'neutral',
  title,
  children,
  icon,
}: {
  tone?: 'neutral' | 'warn' | 'fail' | 'pass' | 'unv';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-surface2 text-fg',
    warn: 'border-warn/30 bg-warnbg text-warn',
    fail: 'border-fail/30 bg-failbg text-fail',
    pass: 'border-pass/30 bg-passbg text-pass',
    unv: 'border-unv/30 bg-unvbg text-unv',
  };
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-sm ${tones[tone]}`}>
      <div className="flex gap-2.5">
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          {title ? <div className="font-medium">{title}</div> : null}
          {children ? <div className={`${title ? 'mt-1' : ''} opacity-90 [overflow-wrap:anywhere]`}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function SectionHeading({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="surface-card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-md text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="surface-card safe-b w-full max-w-lg overflow-hidden rounded-b-none shadow-2xl outline-none sm:rounded-2xl sm:rounded-b-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <IconCross className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ toast */

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4">
      <div className="safe-b rounded-full border border-line bg-fg px-4 py-2 text-sm font-medium text-canvas shadow-lg" role="status">
        {message}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- details */

export function Disclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <IconChevron className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        {summary}
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
