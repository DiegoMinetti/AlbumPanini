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

/**
 * Settings — usa M3 tokens en todos los textos de slate hard-coded.
 * Toggle reescrito como M3 Switch nativo (track 52dp, thumb 32dp).
 */
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
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('settings.appearance')}
        </h2>

        <div>
          <label className="mb-1 block text-label-md text-on-surface-variant">
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
          <label className="mb-1 block text-label-md text-on-surface-variant">
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
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('nav.collections')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('settings.collectionsHint')}
        </p>
        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => navigate('/collections')}
        >
          {t('settings.openCollections')}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('settings.data')}
        </h2>
        <button
          type="button"
          className="btn-danger self-start"
          onClick={() => setResetOpen(true)}
          disabled={!active}
        >
          {t('settings.resetInventory')}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('settings.support')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('settings.supportHint')}
        </p>
        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => navigate('/donations')}
        >
          {t('settings.openDonations')}
        </button>
      </section>

      <section className="card flex flex-col gap-2 text-body-md">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('settings.about')}
        </h2>
        <div className="flex justify-between text-on-surface">
          <span className="text-on-surface-variant">
            {t('settings.version')}
          </span>
          <span className="font-mono">{APP_VERSION}</span>
        </div>
        <div className="flex justify-between text-on-surface">
          <span className="text-on-surface-variant">
            {t('settings.dbVersion')}
          </span>
          <span className="font-mono">v{LATEST_DB_VERSION}</span>
        </div>
        {history && history.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-on-surface-variant">
              {t('settings.dbVersion')} history
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-label-md text-on-surface-variant">
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

/**
 * M3 Switch — track 52x32dp con thumb 24x24dp, colores primary cuando
 * está activo, outline cuando inactivo. Animación spring con motion-short4.
 */
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
      className="flex min-h-tap items-center justify-between gap-4"
    >
      <span className="text-body-md text-on-surface">{label}</span>
      <span
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full
          transition-colors duration-motion-short2 ease-standard ${
            checked
              ? 'bg-primary'
              : 'bg-surface-container-highest border border-outline-variant'
          }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-surface shadow-elev-1
            transition-transform duration-motion-short3 ease-emphasized ${
              checked ? 'translate-x-7' : 'translate-x-1'
            }`}
        />
      </span>
    </button>
  );
}
