import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScenarioStore } from '@/stores/scenarioStore';
import { createScenario, deleteScenario } from '@/services/scenarioService';
import { PromptModal } from '@/components/ui/PromptModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import type { StoredScenario } from '@/types/scenario';

interface ScenarioBarProps {
  collectionId: string;
  scenarios: StoredScenario[];
  activeScenario: StoredScenario | null;
}

/**
 * Scenario switcher: pick which set of results to view/edit, spin up a new
 * "what-if" simulation (seeded from the current one) or delete a custom one.
 * The official scenario is protected from deletion.
 *
 * M3 styling: outlined select (`input` M3), M3 icon-buttons for new/delete.
 */
export function ScenarioBar({
  collectionId,
  scenarios,
  activeScenario,
}: ScenarioBarProps) {
  const { t } = useTranslation();
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canDelete = !!activeScenario && !activeScenario.isOfficial;

  return (
    <div className="flex items-center gap-2">
      <select
        className="input flex-1"
        aria-label={t('tournament.scenario')}
        value={activeScenario?.id ?? ''}
        onChange={(e) => setActiveScenario(collectionId, e.target.value)}
      >
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.isOfficial ? t('tournament.official') : s.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="has-state-layer group relative inline-flex h-10 w-10 shrink-0
          items-center justify-center overflow-hidden rounded-full
          bg-primary-container text-on-primary-container
          transition-all duration-motion-short2 ease-standard
          hover:shadow-elev-1
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          disabled:opacity-40 disabled:pointer-events-none"
        onClick={() => setCreating(true)}
        title={t('tournament.newScenario')}
        aria-label={t('tournament.newScenario')}
      >
        <Icon name="add" size={20} />
        <span aria-hidden className="state-layer" />
      </button>

      <button
        type="button"
        className="has-state-layer group relative inline-flex h-10 w-10 shrink-0
          items-center justify-center overflow-hidden rounded-full
          bg-surface-container text-on-surface-variant
          transition-all duration-motion-short2 ease-standard
          hover:bg-error-container hover:text-on-error-container
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          disabled:opacity-40 disabled:pointer-events-none"
        disabled={!canDelete}
        onClick={() => setConfirmDelete(true)}
        title={t('tournament.deleteScenario')}
        aria-label={t('tournament.deleteScenario')}
      >
        <Icon name="delete" size={20} />
        <span aria-hidden className="state-layer" />
      </button>

      <PromptModal
        open={creating}
        title={t('tournament.newScenario')}
        label={t('tournament.scenarioName')}
        confirmLabel={t('common.create')}
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          setCreating(false);
          void createScenario(
            collectionId,
            name || t('tournament.simulation'),
            activeScenario?.id
          ).then((s) => setActiveScenario(collectionId, s.id));
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('tournament.deleteScenario')}
        message={t('tournament.deleteScenarioConfirm', {
          name: activeScenario?.name ?? '',
        })}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          if (activeScenario) void deleteScenario(activeScenario.id);
        }}
      />
    </div>
  );
}
