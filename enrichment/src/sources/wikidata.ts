import { CONFIG } from '../config.js';
import { fetchJson } from './http.js';
import type { WikidataPerson } from '../types.js';

// Cliente Wikidata: búsqueda de candidatos (API) + detalle (SPARQL).
// Wikidata es la fuente principal de enriquecimiento.

const OCCUPATION_FOOTBALLER = 'Q937857'; // jugador de fútbol asociación

interface WbSearchResponse {
  search: { id: string; label?: string; description?: string }[];
}

/** Candidato devuelto por la búsqueda + señales para desambiguar. */
export interface WikidataCandidate {
  wikidataId: string;
  label: string;
  description: string;
  isFootballer: boolean;
  citizenshipLabels: string[];
  teamLabels: string[];
}

/** Busca QIDs candidatos por nombre (label/alias) vía wbsearchentities. */
export async function searchEntityIds(name: string): Promise<
  { id: string; label: string; description: string }[]
> {
  const data = await fetchJson<WbSearchResponse>(CONFIG.wikidataApiEndpoint, {
    searchParams: {
      action: 'wbsearchentities',
      search: name,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: '12',
      format: 'json',
      origin: '*',
    },
  });
  return (data.search ?? []).map((s) => ({
    id: s.id,
    label: s.label ?? '',
    description: s.description ?? '',
  }));
}

interface SparqlBindings {
  results: { bindings: Record<string, { value: string }>[] };
}

async function runSparql(query: string): Promise<SparqlBindings> {
  return fetchJson<SparqlBindings>(CONFIG.wikidataSparqlEndpoint, {
    accept: 'application/sparql-results+json',
    searchParams: { query, format: 'json' },
  });
}

/**
 * Trae señales de desambiguación (ocupación, nacionalidad, equipos) para un
 * conjunto de QIDs candidatos en una sola consulta SPARQL.
 */
export async function fetchCandidatesDetails(
  qids: string[],
): Promise<WikidataCandidate[]> {
  if (qids.length === 0) return [];
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `
    SELECT ?item ?itemLabel ?itemDescription ?isFootballer
           (GROUP_CONCAT(DISTINCT ?citLabel; SEPARATOR="|") AS ?citizenships)
           (GROUP_CONCAT(DISTINCT ?teamLabel; SEPARATOR="|") AS ?teams)
    WHERE {
      VALUES ?item { ${values} }
      OPTIONAL { ?item wdt:P27 ?cit. ?cit rdfs:label ?citLabel.
                 FILTER(LANG(?citLabel)="en") }
      OPTIONAL { ?item wdt:P54 ?team. ?team rdfs:label ?teamLabel.
                 FILTER(LANG(?teamLabel)="en") }
      BIND(EXISTS { ?item wdt:P106 wd:${OCCUPATION_FOOTBALLER} } AS ?isFootballer)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    GROUP BY ?item ?itemLabel ?itemDescription ?isFootballer
  `;
  const data = await runSparql(query);
  return data.results.bindings.map((b) => {
    const uri = b.item?.value ?? '';
    return {
      wikidataId: uri.split('/').pop() ?? '',
      label: b.itemLabel?.value ?? '',
      description: b.itemDescription?.value ?? '',
      isFootballer: b.isFootballer?.value === 'true',
      citizenshipLabels: splitList(b.citizenships?.value),
      teamLabels: splitList(b.teams?.value),
    };
  });
}

/** Trae todos los datos de una persona por QID. */
export async function fetchPersonDetails(
  qid: string,
): Promise<WikidataPerson> {
  const query = `
    SELECT ?item ?article ?birthDate ?birthPlaceLabel ?lat ?lon
           ?height ?weight ?positionLabel ?clubLabel ?nationalityLabel
           ?shirt ?image ?twitter ?instagram
    WHERE {
      BIND(wd:${qid} AS ?item)
      OPTIONAL { ?item wdt:P569 ?birthDate. }
      OPTIONAL { ?item wdt:P19 ?birthPlace.
                 OPTIONAL { ?birthPlace wdt:P625 ?coord. } }
      OPTIONAL { ?item wdt:P2048 ?height. }
      OPTIONAL { ?item wdt:P2067 ?weight. }
      OPTIONAL { ?item wdt:P413 ?position. }
      OPTIONAL { ?item p:P54 ?clubStmt.
                 ?clubStmt ps:P54 ?club.
                 ?club wdt:P31 wd:Q476028.
                 FILTER NOT EXISTS { ?clubStmt pq:P582 ?clubEnd. } }
      OPTIONAL { ?item wdt:P27 ?nationality. }
      OPTIONAL { ?item wdt:P1618 ?shirt. }
      OPTIONAL { ?item wdt:P18 ?image. }
      OPTIONAL { ?item wdt:P2002 ?twitter. }
      OPTIONAL { ?item wdt:P2003 ?instagram. }
      OPTIONAL {
        ?article schema:about ?item;
                 schema:isPartOf <https://en.wikipedia.org/>.
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 1
  `;
  const data = await runSparql(query);
  const b = data.results.bindings[0] ?? {};

  const person: WikidataPerson = { wikidataId: qid };
  const birth = b.birthDate?.value;
  if (birth) person.birthDate = birth.slice(0, 10);
  if (b.birthPlaceLabel?.value) person.birthPlace = b.birthPlaceLabel.value;
  if (b.lat?.value && b.lon?.value) {
    person.birthCoordinates = {
      lat: Number(b.lat.value),
      lon: Number(b.lon.value),
    };
  }
  if (b.height?.value) {
    const m = Number(b.height.value);
    // P2048 suele venir en metros; convertir a cm si corresponde.
    person.heightCm = Math.round(m < 3 ? m * 100 : m);
  }
  if (b.weight?.value) person.weightKg = Math.round(Number(b.weight.value));
  if (b.positionLabel?.value) person.position = b.positionLabel.value;
  if (b.clubLabel?.value) person.club = b.clubLabel.value;
  if (b.nationalityLabel?.value) person.nationality = b.nationalityLabel.value;
  if (b.shirt?.value) person.shirtNumber = Number(b.shirt.value);
  if (b.image?.value) person.commonsImage = b.image.value;
  if (b.article?.value) person.wikipediaUrl = b.article.value;

  const socials: Record<string, string> = {};
  if (b.twitter?.value) socials.twitter = `https://twitter.com/${b.twitter.value}`;
  if (b.instagram?.value)
    socials.instagram = `https://instagram.com/${b.instagram.value}`;
  if (Object.keys(socials).length) person.socials = socials;

  return person;
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v.split('|').map((s) => s.trim()).filter(Boolean);
}
