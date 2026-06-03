import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/EmptyState';

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
