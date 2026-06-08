import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useSettingsStore } from '@/stores/settingsStore';
import { useActiveCollection } from '@/hooks';
import { resetInventory } from '@/services/inventoryService';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LATEST_DB_VERSION } from '@/db';
import { toast } from '@/stores/uiStore';
import type { Language, ThemeMode } from '@/types/settings';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const haptics = useSettingsStore((s) => s.haptics);
  const toggleHaptics = useSettingsStore((s) => s.toggleHaptics);
  const showImages = useSettingsStore((s) => s.showImages);
  const setShowImages = useSettingsStore((s) => s.setShowImages);

  const { active } = useActiveCollection();
  const history = useLiveQuery(() => db.getVersionHistory(), []);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4">
        <h2 className="text-base font-semibold">{t('settings.appearance')}</h2>

        <div>
          <label className="mb-1 block text-sm text-slate-500">
            {t('settings.theme')}
          </label>
          <SegmentedControl<ThemeMode>
            ariaLabel={t('settings.theme')}
            options={[
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
              { value: 'system', label: t('settings.themeSystem') },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-500">
            {t('settings.language')}
          </label>
          <SegmentedControl<Language>
            ariaLabel={t('settings.language')}
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={setLanguage}
          />
        </div>

        <Toggle
          label={t('settings.haptics')}
          checked={haptics}
          onChange={toggleHaptics}
        />
        <Toggle
          label={t('settings.showImages')}
          checked={showImages}
          onChange={() => setShowImages(!showImages)}
        />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('settings.data')}</h2>
        <button
          type="button"
          className="btn-danger"
          onClick={() => setResetOpen(true)}
          disabled={!active}
        >
          {t('settings.resetInventory')}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('settings.support')}</h2>
        <p className="text-sm text-slate-500">{t('settings.supportHint')}</p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/donations')}
        >
          {t('settings.openDonations')}
        </button>
      </section>

      <section className="card flex flex-col gap-2 text-sm">
        <h2 className="text-base font-semibold">{t('settings.about')}</h2>
        <div className="flex justify-between">
          <span className="text-slate-500">{t('settings.version')}</span>
          <span className="font-mono">{APP_VERSION}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">{t('settings.dbVersion')}</span>
          <span className="font-mono">v{LATEST_DB_VERSION}</span>
        </div>
        {history && history.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-slate-500">
              {t('settings.dbVersion')} history
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
              {history.map((h) => (
                <li key={h.version}>
                  v{h.version} — {h.description}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <ConfirmDialog
        open={resetOpen}
        danger
        message={t('settings.resetConfirm')}
        confirmLabel={t('settings.resetInventory')}
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          if (active) {
            await resetInventory(active.id);
            toast.success(t('toast.inventoryReset'));
          }
          setResetOpen(false);
        }}
      />
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex min-h-tap items-center justify-between"
    >
      <span className="text-sm">{label}</span>
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
