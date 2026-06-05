import { normalizeName, nameTokens } from './normalize.js';
import type { WikidataCandidate } from './sources/wikidata.js';

// Matching robusto entre el nombre Panini y los candidatos de Wikidata.
// Maneja acentos, nombres compuestos, apellidos múltiples y homónimos.
// Usa la selección como criterio de validación. Nunca acepta ambiguos en auto.

// Aliases de nacionalidad/selección por país (cuando difiere del nombre Panini).
// Las claves son el nombre de selección del catálogo; valores ya normalizados.
const TEAM_ALIASES: Record<string, string[]> = {
  'Congo DR': ['democratic republic of the congo', 'dr congo', 'congo dr', 'zaire'],
  USA: ['united states', 'usa', 'united states of america'],
  'South Korea': ['south korea', 'korea republic', 'republic of korea'],
  Czechia: ['czechia', 'czech republic'],
  Türkiye: ['turkiye', 'turkey'],
  'Ivory Coast': ['ivory coast', 'cote d ivoire'],
  'Cape Verde': ['cape verde', 'cabo verde'],
  Curaçao: ['curacao'],
  England: ['england', 'united kingdom'],
  Scotland: ['scotland', 'united kingdom'],
  Netherlands: ['netherlands', 'holland'],
};

function teamAliases(team: string): string[] {
  return TEAM_ALIASES[team] ?? [normalizeName(team)];
}

/** ¿Algún token del candidato (citizenship o selección) valida el país? */
function nationalityMatches(c: WikidataCandidate, team: string): boolean {
  const aliases = teamAliases(team);
  const cits = c.citizenshipLabels.map(normalizeName);
  if (cits.some((cit) => aliases.some((a) => cit.includes(a) || a.includes(cit)))) {
    return true;
  }
  // Pertenencia a la selección nacional ("Argentina national football team").
  const teamToken = normalizeName(team).split(' ')[0] ?? '';
  const teams = c.teamLabels.map(normalizeName);
  return teams.some(
    (t) =>
      t.includes('national') &&
      aliases.some((a) => t.includes(a.split(' ')[0] ?? a)) &&
      (teamToken === '' || true),
  );
}

export interface ScoredCandidate {
  candidate: WikidataCandidate;
  score: number;
  reason: string;
}

/** Puntúa un candidato contra el nombre+selección Panini. */
export function scoreCandidate(
  paniniName: string,
  team: string,
  c: WikidataCandidate,
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  if (!c.isFootballer) {
    return { candidate: c, score: -10, reason: 'no es futbolista' };
  }
  score += 3;
  reasons.push('futbolista');

  const pTokens = nameTokens(paniniName);
  const cTokens = nameTokens(c.label);
  const pNorm = pTokens.join(' ');
  const cNorm = cTokens.join(' ');

  if (pNorm === cNorm) {
    score += 4;
    reasons.push('nombre exacto');
  } else if (pTokens.every((t) => cTokens.includes(t))) {
    score += 3;
    reasons.push('tokens contenidos');
  } else {
    // Solapamiento parcial: apellido(s) en común.
    const overlap = pTokens.filter((t) => cTokens.includes(t)).length;
    if (overlap >= 1) {
      score += overlap;
      reasons.push(`solapamiento ${overlap}`);
    }
  }

  if (nationalityMatches(c, team)) {
    score += 3;
    reasons.push('nacionalidad/selección OK');
  }

  return { candidate: c, score, reason: reasons.join(', ') };
}

export interface MatchResult {
  match: WikidataCandidate | null;
  ambiguous: boolean;
  scored: ScoredCandidate[];
}

/**
 * Selecciona el mejor match. Devuelve ambiguous=true si los dos mejores
 * candidatos válidos están demasiado cerca (no se acepta en automático).
 */
export function selectMatch(
  paniniName: string,
  team: string,
  candidates: WikidataCandidate[],
): MatchResult {
  const scored = candidates
    .map((c) => scoreCandidate(paniniName, team, c))
    .sort((a, b) => b.score - a.score);

  const viable = scored.filter((s) => s.score >= 6);
  if (viable.length === 0) {
    return { match: null, ambiguous: false, scored };
  }

  const best = viable[0]!;
  const second = viable[1];

  // Ambiguo: dos candidatos fuertes separados por menos de 2 puntos.
  if (second && best.score - second.score < 2) {
    return { match: null, ambiguous: true, scored };
  }

  return { match: best.candidate, ambiguous: false, scored };
}
