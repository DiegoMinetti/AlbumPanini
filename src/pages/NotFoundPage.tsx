import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/EmptyState';

/**
 * 404 — usa EmptyState M3 (outlined dashed container) y el botón primary
 * M3 (`btn-primary`).
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="🤷"
      title="404"
      description={t('common.empty')}
      action={
        <Link to="/" className="btn-primary mt-2">
          {t('nav.dashboard')}
        </Link>
      }
    />
  );
}
