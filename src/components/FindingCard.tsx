import { StatusPill } from './primitives';
import { useI18n } from '../i18n/context';
import type { Finding } from '../lib/types';

/** One finding row: status, what we saw, why it matters, how to fix it. */
export function FindingCard({ finding, showAdvice = true }: { finding: Finding; showAdvice?: boolean }) {
  const { t, ft } = useI18n();
  const text = ft(finding);
  const advice = showAdvice && finding.status !== 'pass' && (text.why || text.fix);

  return (
    <li className="border-b border-line py-3 last:border-b-0" data-code={finding.code} data-status={finding.status}>
      <div className="flex items-start gap-2.5">
        <StatusPill status={finding.status} compact />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium leading-snug [overflow-wrap:anywhere]">{text.title}</p>
          {text.detail ? (
            <p className="mono mt-1 text-[12px] leading-relaxed text-muted [overflow-wrap:anywhere]">{text.detail}</p>
          ) : null}
          {finding.line ? <p className="mt-1 text-[11.5px] text-subtle">{t('label.line', { line: finding.line })}</p> : null}
          {advice ? (
            <div className="mt-2 space-y-1.5 rounded-lg bg-surface2 px-3 py-2">
              {text.why ? (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  <span className="font-medium text-fg">{t('label.why')}</span>
                  <span className="mx-1.5 text-line">|</span>
                  {text.why}
                </p>
              ) : null}
              {text.fix ? (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  <span className="font-medium text-fg">{t('label.fix')}</span>
                  <span className="mx-1.5 text-line">|</span>
                  {text.fix}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function FindingList({ findings, showAdvice = true }: { findings: Finding[]; showAdvice?: boolean }) {
  if (findings.length === 0) return null;
  return (
    <ul className="surface-card divide-y-0 px-3.5">
      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} showAdvice={showAdvice} />
      ))}
    </ul>
  );
}
