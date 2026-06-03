import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/EmptyState';

export function NoActiveCollection() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="🗃️"
      title={t('onboarding.title')}
      description={t('dashboard.noCollection')}
      action={
        <Link to="/collections" className="btn-primary mt-2">
          {t('nav.collections')}
        </Link>
      }
    />
  );
}
