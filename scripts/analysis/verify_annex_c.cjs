// Quick verification script: run after changes to verify Annex C resolves correctly.
const fs = require('fs');

const d = JSON.parse(fs.readFileSync('public/collections/worldcup-2026.json', 'utf8'));
const o = JSON.parse(fs.readFileSync('public/official/worldcup-2026-results.json', 'utf8'));
const t = d.tournament;

const results = new Map();
for (const m of o.matches) {
  if (m.status === 'FT' || m.status === 'AET' || m.status === 'PEN') {
    results.set(m.id, { homeGoals: m.homeGoals, awayGoals: m.awayGoals, played: true });
  }
}

function computeGroup(groupId) {
  const group = t.groups.find(g => g.id === groupId);
  const matches = t.matches.filter(m => m.stage === 'group' && m.group === groupId);
  const rows = {};
  for (const teamId of group.teamIds) {
    rows[teamId] = { teamId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  }
  for (const m of matches) {
    const r = results.get(m.id);
    if (!r || !r.played || !m.homeTeamId || !m.awayTeamId) continue;
    const h = rows[m.homeTeamId], a = rows[m.awayTeamId];
    h.played++; a.played++;
    h.gf += r.homeGoals; h.ga += r.awayGoals; a.gf += r.awayGoals; a.ga += r.homeGoals;
    h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
    if (r.homeGoals > r.awayGoals) { h.won++; h.pts += 3; a.lost++; }
    else if (r.homeGoals < r.awayGoals) { a.won++; a.pts += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  }
  return Object.values(rows).sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.teamId.localeCompare(y.teamId);
  }).map((r, i) => ({ ...r, rank: i + 1 }));
}

const byGroup = new Map();
for (const g of t.groups) byGroup.set(g.id, computeGroup(g.id));
const thirdByGroup = new Map();
for (const [gid, rows] of byGroup) thirdByGroup.set(gid, rows[2]);

const ranked = [...thirdByGroup.entries()]
  .map(([groupId, row]) => ({ groupId, row }))
  .sort((a, b) => {
    if (b.row.pts !== a.row.pts) return b.row.pts - a.row.pts;
    if (b.row.gd !== a.row.gd) return b.row.gd - a.row.gd;
    if (b.row.gf !== a.row.gf) return b.row.gf - a.row.gf;
    return a.row.teamId.localeCompare(b.row.teamId);
  });
const qualifyingGroups = new Set(ranked.slice(0, 8).map(r => r.groupId));

console.log('Top 8 qualifying groups:', [...qualifyingGroups].sort().join(''));

// Load the generated annexC module — strip TS-only syntax and eval the data.
const tsContent = fs.readFileSync('src/utils/annexC.ts', 'utf-8');
const stripped = tsContent
  .replace(/^import[^;]+;\s*$/gm, '')   // strip import lines
  .replace(/^export\s+/gm, '')          // strip export keyword
  .replace(/:\s*Readonly<[^>]+>/g, '')  // strip Readonly<...> type annotations
  .replace(/:\s*GroupId(?:\[\])?/g, '')  // strip GroupId type annotations
  .replace(/as\s+GroupId(?:\[\])?/g, '') // strip GroupId casts
  .replace(/:\s*GroupId\[\]/g, '');
// Now extract the data object literal between ANNEX_C: ... = { ... };
const dataMatch = /ANNEX_C[^{]*=\s*({[\s\S]*?});\s*\n/.exec(stripped);
if (!dataMatch) {
  console.error('Could not find ANNEX_C data in source');
  process.exit(1);
}
const dataStr = dataMatch[1];
const ANNEX_C = (new Function('return (' + dataStr + ')'))();

const qualSet = [...qualifyingGroups].sort().join('');
const row = ANNEX_C[qualSet];
if (!row) {
  console.log('NO ROW FOUND for qualifying set', qualSet);
  process.exit(0);
}

console.log('Anexo C row found:');
const slotToMatch = new Map();
for (const m of t.matches) {
  if (m.homeSlot) slotToMatch.set(m.homeSlot, m.matchNumber);
  if (m.awaySlot) slotToMatch.set(m.awaySlot, m.matchNumber);
}

console.log('\n=== R32 with FIFA bracket + Annex C resolution ===');
for (const matchNum of [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88]) {
  const m = t.matches.find(x => x.matchNumber === matchNum);
  const resolveSlot = (slot) => {
    const winLoss = /^([WL])(\d+)$/.exec(slot);
    const rankSlot = /^([12])([A-L])$/.exec(slot);
    const thirdSlot = /^T(\d+)$/.exec(slot);
    const best3rdSet = /^3([A-L]+)$/.exec(slot);
    if (rankSlot) {
      const [, p, g] = rankSlot;
      return byGroup.get(g)?.find(r => r.rank === Number(p))?.teamId;
    }
    if (thirdSlot) return ranked[Number(thirdSlot[1]) - 1]?.row.teamId;
    if (best3rdSet) {
      const letters = best3rdSet[1];
      const candidates = [];
      for (const letter of letters) {
        if (qualifyingGroups.has(letter)) candidates.push(thirdByGroup.get(letter));
      }
      if (candidates.length === 1) return candidates[0].teamId;
      // Annex C lookup
      const groupLetter = row[matchNum];
      return thirdByGroup.get(groupLetter)?.teamId;
    }
    return undefined;
  };
  const home = resolveSlot(m.homeSlot);
  const away = resolveSlot(m.awaySlot);
  console.log('  M' + matchNum + '  ' + (home || '<' + m.homeSlot + '>') + '  vs  ' + (away || '<' + m.awaySlot + '>'));
}
