import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';

const MP_URL = 'https://www.mercadopago.com.ar/';
const DONATION_ALIAS = 'diegominettimp';
const DONATION_CVU = '0000003100042227394195';
const DONATION_NAME = 'Diego Matias Minetti';

export function DonationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const markDonationLinkOpened = useSettingsStore(
    (s) => s.markDonationLinkOpened
  );

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('toast.copied'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const openMercadoPago = () => {
    markDonationLinkOpened();
    window.open(MP_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t('donations.title')}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('donations.subtitle')}
        </p>

        <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-900 dark:bg-brand-950/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            {t('donations.accountData')}
          </p>

          <div className="mt-3 flex flex-col gap-3 text-sm">
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={openMercadoPago}
          >
            {t('donations.openMp')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/settings')}
          >
            {t('common.back')}
          </button>
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 dark:bg-slate-900/60">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
          {value}
        </p>
      </div>
      {onCopy && copyLabel ? (
        <button type="button" className="btn-ghost" onClick={onCopy}>
          {copyLabel}
        </button>
      ) : null}
    </div>
  );
}
