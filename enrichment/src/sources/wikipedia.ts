import { fetchJson } from './http.js';

// Wikipedia: SOLO como fallback cuando Wikidata no alcanza.
// Se usa la API REST (summary), nunca se parsea HTML completo.

export interface WikipediaSummary {
  title: string;
  description?: string;
  extract?: string;
  pageUrl?: string;
  thumbnailUrl?: string;
}

/** Trae el resumen REST de una página de Wikipedia en inglés. */
export async function fetchWikipediaSummary(
  title: string,
): Promise<WikipediaSummary | null> {
  const slug = encodeURIComponent(title.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
  try {
    const data = await fetchJson<{
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      thumbnail?: { source?: string };
      type?: string;
    }>(url);
    if (data.type === 'disambiguation') return null;
    return {
      title: data.title ?? title,
      description: data.description,
      extract: data.extract,
      pageUrl: data.content_urls?.desktop?.page,
      thumbnailUrl: data.thumbnail?.source,
    };
  } catch {
    return null;
  }
}

/** ¿El resumen describe a un futbolista? Heurística para validar fallback. */
export function looksLikeFootballer(summary: WikipediaSummary): boolean {
  const text = `${summary.description ?? ''} ${summary.extract ?? ''}`.toLowerCase();
  return /football|footballer|soccer|goalkeeper|midfielder|defender|forward|striker/.test(
    text,
  );
}
