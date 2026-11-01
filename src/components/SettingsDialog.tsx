import { useEffect, useState } from 'react';
import { IconCheck, IconTrash } from '../components/Icons';
import { Modal } from '../components/primitives';
import { useI18n } from '../i18n/context';
import { isValidEndpoint, type Theme } from '../state/prefs';
import type { Lang } from '../i18n';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  lang: Lang;
  onLang: (lang: Lang) => void;
  endpoint: string;
  onEndpoint: (endpoint: string) => void;
  onClearData: () => void;
  toast: (message: string) => void;
}

export function SettingsDialog({
  open,
  onClose,
  theme,
  onTheme,
  lang,
  onLang,
  endpoint,
  onEndpoint,
  onClearData,
  toast,
}: SettingsDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(endpoint);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(endpoint);
      setError(null);
    }
  }, [open, endpoint]);

  const save = () => {
    const value = draft.trim();
    if (value && !isValidEndpoint(value)) {
      setError(t('online.endpoint.invalid'));
      return;
    }
    onEndpoint(value);
    setError(null);
    toast(t('online.endpoint.saved'));
  };

  return (
    <Modal open={open} title={t('settings.title')} onClose={onClose}>
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t('settings.theme')}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['light', 'dark', 'system'] as Theme[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onTheme(option)}
                className={`min-h-9 rounded-lg border px-2 text-[12.5px] ${
                  theme === option ? 'border-line-strong bg-surface2 font-medium text-fg' : 'border-line text-muted'
                }`}
                aria-pressed={theme === option}
              >
                {t(`settings.theme.${option}`)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t('settings.language')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['zh', 'en'] as Lang[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onLang(option)}
                className={`min-h-9 rounded-lg border px-2 text-[12.5px] ${
                  lang === option ? 'border-line-strong bg-surface2 font-medium text-fg' : 'border-line text-muted'
                }`}
                aria-pressed={lang === option}
              >
                {t(`settings.language.${option}`)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">{t('online.endpoint.title')}</p>
          <p className="mb-2 text-[12px] leading-relaxed text-muted">{t('online.endpoint.body')}</p>
          <div className="flex gap-1.5">
            <input
              className="field mono min-w-0 flex-1 !text-[12.5px]"
              type="text"
              inputMode="url"
              spellCheck={false}
              placeholder={t('online.endpoint.placeholder')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="button" className="btn btn-primary shrink-0" onClick={save}>
              {t('action.save')}
            </button>
          </div>
          {error ? <p className="mt-1.5 text-[11.5px] text-fail">{error}</p> : null}
          {endpoint ? (
            <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-pass">
              <IconCheck className="h-3.5 w-3.5" />
              <span className="mono truncate">{endpoint}</span>
            </p>
          ) : null}
        </section>

        <section className="border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">{t('settings.data')}</p>
          <button
            type="button"
            className="btn btn-ghost !min-h-9 text-[12.5px]"
            onClick={() => {
              onClearData();
              toast(t('settings.data.cleared'));
            }}
          >
            <IconTrash className="h-3.5 w-3.5" />
            {t('settings.data.clear')}
          </button>
          <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">{t('about.privacy.body')}</p>
        </section>
      </div>
    </Modal>
  );
}
