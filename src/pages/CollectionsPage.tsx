import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCollections } from '@/hooks/useCollections';
import { useManifest } from '@/hooks/useManifest';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  fetchPackage,
  installPackage,
  isInstalled,
} from '@/services/collectionLoader';
import {
  archiveCollection,
  deleteCollection,
  duplicateCollection,
  renameCollection,
  setCollectionIncludeExtras,
  unarchiveCollection,
} from '@/services/collectionService';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PromptModal } from '@/components/ui/PromptModal';
import { toast } from '@/stores/uiStore';
import type { StoredCollection } from '@/types/collection';
import type { CollectionManifestEntry } from '@/types/collection';

type DialogState =
  | { type: 'none' }
  | { type: 'rename'; collection: StoredCollection }
  | { type: 'duplicate'; collection: StoredCollection }
  | { type: 'delete'; collection: StoredCollection };

/**
 * Collections — usa M3 tokens. Fila activa tiene `outline` en M3 color
 * en lugar de brand-500 hard-coded; chips usan M3 secondary-container
 * cuando es "selected".
 */
export function CollectionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const collections = useCollections();
  const manifest = useManifest();
  const activeId = useSettingsStore((s) => s.activeCollectionId);
  const setActive = useSettingsStore((s) => s.setActiveCollection);
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [installing, setInstalling] = useState<string | null>(null);

  if (!collections) return <Spinner />;

  const active = collections.filter((c) => c.status === 'active');
  const archived = collections.filter((c) => c.status === 'archived');
  const installedIds = new Set(collections.map((c) => c.sourceId ?? c.id));
  const available = (manifest.data ?? []).filter(
    (entry) => !installedIds.has(entry.id)
  );

  const handleInstall = async (entry: CollectionManifestEntry) => {
    setInstalling(entry.id);
    try {
      if (await isInstalled(entry.id)) {
        toast.info(t('collections.installed'));
        return;
      }
      const pkg = await fetchPackage(entry);
      const created = await installPackage(pkg);
      setActive(created.id);
      toast.success(t('toast.collectionInstalled'));
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setInstalling(null);
    }
  };

  const closeDialog = () => setDialog({ type: 'none' });

  return (
    <div className="flex flex-col gap-6">
      <CollectionGroup title={t('collections.active')}>
        {active.length === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          active.map((c) => (
            <CollectionRow
              key={c.id}
              collection={c}
              isActive={c.id === activeId}
              onSelect={() => setActive(c.id)}
              onRename={() => setDialog({ type: 'rename', collection: c })}
              onDuplicate={() =>
                setDialog({ type: 'duplicate', collection: c })
              }
              onArchive={() => void archiveCollection(c.id)}
              onDelete={() => setDialog({ type: 'delete', collection: c })}
              onToggleExtras={(v) => void setCollectionIncludeExtras(c.id, v)}
            />
          ))
        )}
      </CollectionGroup>

      {archived.length > 0 ? (
        <CollectionGroup title={t('collections.archived')}>
          {archived.map((c) => (
            <CollectionRow
              key={c.id}
              collection={c}
              isActive={false}
              archived
              onSelect={() => {
                void unarchiveCollection(c.id);
                setActive(c.id);
              }}
              onRename={() => setDialog({ type: 'rename', collection: c })}
              onDuplicate={() =>
                setDialog({ type: 'duplicate', collection: c })
              }
              onArchive={() => void unarchiveCollection(c.id)}
              onDelete={() => setDialog({ type: 'delete', collection: c })}
              onToggleExtras={(v) => void setCollectionIncludeExtras(c.id, v)}
            />
          ))}
        </CollectionGroup>
      ) : null}

      <CollectionGroup title={t('collections.available')}>
        {manifest.isLoading ? (
          <Spinner />
        ) : available.length === 0 ? (
          <EmptyState title={t('onboarding.noCollections')} />
        ) : (
          available.map((entry) => (
            <div
              key={entry.id}
              className="card flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-on-surface">
                  {entry.name}
                </p>
                <p className="truncate text-label-md text-on-surface-variant">
                  {t('collections.version', { version: entry.version })} ·{' '}
                  {entry.description}
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleInstall(entry)}
                disabled={installing === entry.id}
              >
                {installing === entry.id
                  ? t('common.loading')
                  : t('onboarding.install')}
              </button>
            </div>
          ))
        )}
      </CollectionGroup>

      {/* Dialogs */}
      <PromptModal
        open={dialog.type === 'rename'}
        title={t('common.rename')}
        label={t('collections.renamePrompt')}
        initialValue={dialog.type === 'rename' ? dialog.collection.name : ''}
        onCancel={closeDialog}
        onConfirm={async (value) => {
          if (dialog.type === 'rename') {
            await renameCollection(dialog.collection.id, value);
            toast.success(t('toast.renamed'));
          }
          closeDialog();
        }}
      />

      <PromptModal
        open={dialog.type === 'duplicate'}
        title={t('common.duplicate')}
        label={t('collections.duplicatePrompt')}
        checkboxLabel={t('collections.includeProgress')}
        initialValue={
          dialog.type === 'duplicate' ? `${dialog.collection.name} (copy)` : ''
        }
        onCancel={closeDialog}
        onConfirm={async (value, includeInventory) => {
          if (dialog.type === 'duplicate') {
            const id = await duplicateCollection(dialog.collection.id, {
              name: value,
              includeInventory,
            });
            setActive(id);
            toast.success(t('toast.duplicated'));
          }
          closeDialog();
        }}
      />

      <ConfirmDialog
        open={dialog.type === 'delete'}
        danger
        message={t('collections.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onCancel={closeDialog}
        onConfirm={async () => {
          if (dialog.type === 'delete') {
            await deleteCollection(dialog.collection.id);
            toast.success(t('toast.collectionDeleted'));
          }
          closeDialog();
        }}
      />

      <button
        type="button"
        className="btn-secondary mt-2 w-full"
        onClick={() => navigate('/settings')}
      >
        {t('common.back')}
      </button>
    </div>
  );
}

function CollectionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

interface CollectionRowProps {
  collection: StoredCollection;
  isActive: boolean;
  archived?: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleExtras: (include: boolean) => void;
}

function CollectionRow({
  collection,
  isActive,
  archived,
  onSelect,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleExtras,
}: CollectionRowProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`card flex flex-col gap-3 ${
        isActive ? 'ring-2 ring-primary' : ''
      }`}
      data-testid="collection-row"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-on-surface">
            {collection.name}
          </p>
          <p className="truncate text-label-md text-on-surface-variant">
            {t('collections.version', { version: collection.version })} ·{' '}
            {collection.language.toUpperCase()}
          </p>
        </div>
        {isActive ? (
          <span className="chip chip-active">{t('collections.selected')}</span>
        ) : (
          <button type="button" className="btn-primary" onClick={onSelect}>
            {t('collections.select')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={onRename}>
          {t('common.rename')}
        </button>
        <button type="button" className="btn-ghost" onClick={onDuplicate}>
          {t('common.duplicate')}
        </button>
        <button type="button" className="btn-ghost" onClick={onArchive}>
          {archived ? t('common.unarchive') : t('common.archive')}
        </button>
        <button
          type="button"
          className="btn-ghost text-error"
          onClick={onDelete}
        >
          {t('common.delete')}
        </button>
      </div>
      <label className="flex items-start gap-2 border-t border-outline-variant pt-3 text-body-md text-on-surface">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={collection.includeExtras ?? false}
          onChange={(e) => onToggleExtras(e.target.checked)}
        />
        <span>
          <span className="font-medium">{t('stickers.includeExtras')}</span>
          <span className="mt-0.5 block text-label-md text-on-surface-variant">
            {t('collections.includeExtrasHint')}
          </span>
        </span>
      </label>
    </div>
  );
}
