import { useTranslation } from 'react-i18next';
import { toast } from '@/stores/uiStore';

const DONATION_ALIAS = 'diegominettimp';
const DONATION_CVU = '0000003100042227394195';
const DONATION_NAME = 'Diego Matias Minetti';

/**
 * Donations — usa M3 tokens (primary-container, on-primary-container, etc.)
 * en lugar de brand-50/700 hard-coded.
 */
export function DonationsPage() {
  const { t } = useTranslation();

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('toast.copied'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4">
        <h1 className="text-title-lg font-semibold text-on-surface">
          {t('donations.title')}
        </h1>
        <p className="text-body-md text-on-surface-variant">
          {t('donations.subtitle')}
        </p>

        <div className="rounded-xl border border-primary-container bg-primary-container p-4">
          <p className="text-label-md font-semibold uppercase tracking-wide text-on-primary-container">
            {t('donations.accountData')}
          </p>

          <div className="mt-3 flex flex-col gap-3 text-body-md">
            <DataRow
              label={t('donations.alias')}
              value={DONATION_ALIAS}
              onCopy={() => void copyText(DONATION_ALIAS)}
              copyLabel={t('donations.copyAlias')}
            />
            <DataRow
              label={t('donations.cvu')}
              value={DONATION_CVU}
              onCopy={() => void copyText(DONATION_CVU)}
              copyLabel={t('donations.copyCvu')}
            />
            <DataRow label={t('donations.name')} value={DONATION_NAME} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DataRow({
  label,
  value,
  onCopy,
  copyLabel,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-label-md text-on-surface-variant">{label}</p>
        <p className="truncate font-medium text-on-surface">{value}</p>
      </div>
      {onCopy && copyLabel ? (
        <button type="button" className="btn-ghost" onClick={onCopy}>
          {copyLabel}
        </button>
      ) : null}
    </div>
  );
}
