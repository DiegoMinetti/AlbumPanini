import { useQuery } from '@tanstack/react-query';
import { fetchManifest } from '@/services/collectionLoader';
import type { CollectionManifestEntry } from '@/types/collection';

/**
 * Fetch the available collection packages manifest. Cached by React Query and
 * served from the PWA cache when offline.
 */
export function useManifest() {
  return useQuery<CollectionManifestEntry[]>({
    queryKey: ['collection-manifest'],
    queryFn: ({ signal }) => fetchManifest(signal),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
}
