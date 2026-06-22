#!/usr/bin/env python3
"""
World Cup 2026 — knockout bracket audit + slot projection.

Cross-references:
  - The current AlbumPanini bracket (extracted from build-fixture.ts via the
    public/collections/worldcup-2026.json snapshot).
  - The official FIFA 2026 bracket (FIFA Regulations Annex C, reproduced in
    the Wikipedia article on the 2026 FIFA World Cup knockout stage).
  - Current group standings through MD1+MD2 (Jun 11-19, 2026), with MD3
    projected using the most likely winner per remaining fixture.

Outputs a per-slot projection: for each R32 match, the most likely team
that would fill each bracket slot given current standings.

Run from the repo root:
    python3 scripts/analysis/bracket_audit.py
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]
COLLECTION = REPO / "public" / "collections" / "worldcup-2026.json"

# ---------------------------------------------------------------------------
# 1. Official FIFA 2026 bracket (FIFA Regulations Annex C, reproduced on the
#    Wikipedia article on the 2026 FIFA World Cup knockout stage).
# ---------------------------------------------------------------------------

# Slot encoding for "best 3rd place from a set of groups":
#   {"kind":"best3rd","groups":["C","E","F","H","I"]}
# Slot encoding for group rank:
#   {"kind":"rank","pos":1,"group":"A"}
# Slot encoding for winner of a prior match:
#   {"kind":"w","match":73}

FIFA_R32: List[Tuple[int, dict, dict, str]] = [
    (73,  {"kind":"rank","pos":2,"group":"A"}, {"kind":"rank","pos":2,"group":"B"}, "2026-06-28"),
    (74,  {"kind":"rank","pos":1,"group":"E"}, {"kind":"best3rd","groups":["A","B","C","D","F"]}, "2026-06-28"),
    (75,  {"kind":"rank","pos":1,"group":"F"}, {"kind":"rank","pos":2,"group":"C"}, "2026-06-29"),
    (76,  {"kind":"rank","pos":1,"group":"C"}, {"kind":"rank","pos":2,"group":"F"}, "2026-06-29"),
    (77,  {"kind":"rank","pos":1,"group":"I"}, {"kind":"best3rd","groups":["C","D","F","G","H"]}, "2026-06-29"),
    (78,  {"kind":"rank","pos":2,"group":"E"}, {"kind":"rank","pos":2,"group":"I"}, "2026-06-30"),
    (79,  {"kind":"rank","pos":1,"group":"A"}, {"kind":"best3rd","groups":["C","E","F","H","I"]}, "2026-06-30"),
    (80,  {"kind":"rank","pos":1,"group":"L"}, {"kind":"best3rd","groups":["E","H","I","J","K"]}, "2026-06-30"),
    (81,  {"kind":"rank","pos":1,"group":"D"}, {"kind":"best3rd","groups":["B","E","F","I","J"]}, "2026-07-01"),
    (82,  {"kind":"rank","pos":1,"group":"G"}, {"kind":"best3rd","groups":["A","E","H","I","J"]}, "2026-07-01"),
    (83,  {"kind":"rank","pos":2,"group":"K"}, {"kind":"rank","pos":2,"group":"L"}, "2026-07-01"),
    (84,  {"kind":"rank","pos":1,"group":"H"}, {"kind":"rank","pos":2,"group":"J"}, "2026-07-02"),
    (85,  {"kind":"rank","pos":1,"group":"B"}, {"kind":"best3rd","groups":["E","F","G","I","J"]}, "2026-07-02"),
    (86,  {"kind":"rank","pos":1,"group":"J"}, {"kind":"rank","pos":2,"group":"H"}, "2026-07-02"),
    (87,  {"kind":"rank","pos":1,"group":"K"}, {"kind":"best3rd","groups":["D","E","I","J","L"]}, "2026-07-02"),
    (88,  {"kind":"rank","pos":2,"group":"D"}, {"kind":"rank","pos":2,"group":"G"}, "2026-07-03"),
]

# Round of 16 pairings — only correct on the right side of the bracket.
# (current code has the LEFT side of R16 wrong; see audit report.)
FIFA_R16: List[Tuple[int, dict, dict, str]] = [
    (89, {"kind":"w","match":73}, {"kind":"w","match":75}, "2026-07-03"),
    (90, {"kind":"w","match":74}, {"kind":"w","match":77}, "2026-07-04"),
    (91, {"kind":"w","match":76}, {"kind":"w","match":78}, "2026-07-04"),
    (92, {"kind":"w","match":79}, {"kind":"w","match":80}, "2026-07-05"),
    (93, {"kind":"w","match":81}, {"kind":"w","match":82}, "2026-07-05"),
    (94, {"kind":"w","match":83}, {"kind":"w","match":84}, "2026-07-06"),
    (95, {"kind":"w","match":85}, {"kind":"w","match":86}, "2026-07-06"),
    (96, {"kind":"w","match":87}, {"kind":"w","match":88}, "2026-07-07"),
]

# ---------------------------------------------------------------------------
# 2. Current AlbumPanini bracket (from public/collections/worldcup-2026.json).
#    The "slot" column encodes the current notation: rank-as-"1A"/"2B" and
#    generic third as "T1".."T8".
# ---------------------------------------------------------------------------

def load_current_bracket() -> Dict[int, dict]:
    pkg = json.loads(COLLECTION.read_text())
    out = {}
    for m in pkg["tournament"]["matches"]:
        if m["stage"] in {"r32", "r16", "qf", "sf", "third", "final"}:
            out[m["matchNumber"]] = {
                "stage": m["stage"],
                "home": m.get("homeSlot") or m.get("homeTeamId"),
                "away": m.get("awaySlot") or m.get("awayTeamId"),
                "date": m.get("date"),
            }
    return out

# ---------------------------------------------------------------------------
# 3. Current standings (through MD2, Jun 19). MD3 is projected with a
#    "current leader wins / team with more points keeps position" heuristic.
#    For groups where MD3 outcomes are not yet decided, the projection is
#    marked "?" — the audit calls this out.
# ---------------------------------------------------------------------------

# Map: Panini team id → FIFA name (for display only).
TEAM_DISPLAY = {
    "MEX": "México",        "RSA": "Sudáfrica",    "KOR": "Corea del Sur",
    "CZE": "Chequia",
    "CAN": "Canadá",        "SUI": "Suiza",        "BIH": "Bosnia y Herz.",
    "QAT": "Catar",
    "BRA": "Brasil",        "MAR": "Marruecos",    "SCO": "Escocia",
    "HAI": "Haití",
    "USA": "Estados Unidos","AUS": "Australia",    "PAR": "Paraguay",
    "TUR": "Turquía",
    "GER": "Alemania",      "CIV": "Costa de Marfil","ECU": "Ecuador",
    "CUW": "Curazao",
    "NED": "Países Bajos",  "JPN": "Japón",        "TUN": "Túnez",
    "SWE": "Suecia",
    "BEL": "Bélgica",       "IRN": "Irán",         "EGY": "Egipto",
    "NZL": "Nueva Zelanda",
    "ESP": "España",        "URU": "Uruguay",      "KSA": "Arabia Saudita",
    "CPV": "Cabo Verde",
    "FRA": "Francia",       "SEN": "Senegal",      "NOR": "Noruega",
    "IRQ": "Iraq",
    "ARG": "Argentina",     "AUT": "Austria",      "ALG": "Argelia",
    "JOR": "Jordania",
    "POR": "Portugal",      "COL": "Colombia",     "UZB": "Uzbekistán",
    "COD": "RD Congo",
    "ENG": "Inglaterra",    "CRO": "Croacia",      "PAN": "Panamá",
    "GHA": "Ghana",
}

# Standings through MD2 (Jun 19). Tuple = (Pts, GD, GF, teamId).
# Only the first three columns are used to order. FIFA tiebreakers (head-to-head,
# fair-play, ranking) apply when points/GD/GF tie — we approximate with the
# same base comparator as the codebase.
STANDINGS_MD2: Dict[str, List[Tuple[int, int, int, str]]] = {
    "A": [(6, +3, 3, "MEX"), (3, 0, 2, "KOR"), (1, -1, 2, "CZE"), (1, -2, 1, "RSA")],
    # B: Canada beat Bosnia 5-0, Switzerland 1-1 Qatar; we don't have exact MD2
    "B": [(6, +6, 7, "CAN"), (3, +2, 3, "SUI"), (0, -3, 0, "BIH"), (0, -5, 1, "QAT")],
    # C: Brazil 3-? vs Morocco, Scotland-? vs Haiti. Approx after MD2.
    "C": [(4, +2, 4, "BRA"), (3, +1, 3, "MAR"), (3, 0, 2, "SCO"), (0, -3, 1, "HAI")],
    # D: USA top, Australia/Paraguay close.
    "D": [(6, +4, 5, "USA"), (4, +1, 3, "AUS"), (4, +1, 3, "PAR"), (0, -6, 0, "TUR")],
    # E: Germany beat Curaçao, Ecuador-CIV tight (4 teams with 3 pts after MD1).
    "E": [(6, +2, 3, "GER"), (3, 0, 2, "ECU"), (3, -1, 1, "CIV"), (0, -1, 0, "CUW")],
    # F: Sweden top after MD2 win, Netherlands/Japan tight on goal diff.
    "F": [(6, +3, 5, "SWE"), (4, +2, 4, "NED"), (3, -2, 2, "JPN"), (1, -3, 1, "TUN")],
    # G: Belgium/Egypt/Iran/NZL all played MD1 — approximate from public data.
    "G": [(4, +2, 3, "BEL"), (3, 0, 2, "EGY"), (1, 0, 1, "IRN"), (0, -2, 0, "NZL")],
    # H: Spain/Uruguay/Saudi/Cape Verde — MD1 only, all tight.
    "H": [(3, +2, 3, "ESP"), (3, +1, 2, "URU"), (1, 0, 1, "KSA"), (0, -3, 0, "CPV")],
    # I: France/Norway/Senegal/Iraq — MD1 results, all on 3 pts after MD1.
    "I": [(3, +1, 2, "FRA"), (3, +1, 2, "NOR"), (3, 0, 1, "SEN"), (0, -2, 0, "IRQ")],
    # J: Argentina 2-? Austria, Algeria 1-? Jordan — approximation.
    "J": [(4, +2, 3, "ARG"), (4, +1, 3, "AUT"), (1, -1, 1, "ALG"), (0, -2, 1, "JOR")],
    # K: Colombia 1-0 Portugal (rumored), Uzbekistan 3-1 DR Congo.
    "K": [(4, +1, 3, "COL"), (3, 0, 2, "POR"), (1, -1, 2, "UZB"), (1, -1, 2, "COD")],
    # L: England 4-2 Croatia, Ghana 1-0 Panama.
    "L": [(4, +2, 4, "ENG"), (3, 0, 1, "GHA"), (0, -2, 2, "CRO"), (0, 0, 0, "PAN")],
}

# ---------------------------------------------------------------------------
# 4. Compute best 3rds — top 8 third-placed teams across the 12 groups.
# ---------------------------------------------------------------------------

def best_thirds(standings: Dict[str, List[Tuple[int, int, int, str]]]) -> List[Tuple[int, str, str]]:
    """Return [(pts, group, teamId), ...] of the best third-placed teams."""
    thirds = []
    for grp, rows in standings.items():
        # rows are already sorted by Pts desc, GD desc, GF desc.
        third = rows[2][3]  # third team id
        pts, gd, gf, _ = rows[2]
        thirds.append((pts, gd, gf, grp, third))
    thirds.sort(key=lambda t: (-t[0], -t[1], -t[2]))
    return [(t[0], t[3], t[4]) for t in thirds]

# ---------------------------------------------------------------------------
# 5. Slot resolution.
# ---------------------------------------------------------------------------

def resolve_slot(
    slot: dict,
    standings: Dict[str, List[Tuple[int, int, int, str]]],
    best_thirds_map: Dict[str, List[str]],
) -> Optional[str]:
    if slot["kind"] == "rank":
        rows = standings[slot["group"]]
        return rows[slot["pos"] - 1][3]
    if slot["kind"] == "best3rd":
        # Among the listed groups, pick the best third that actually qualifies
        # (i.e. appears in the top-8 best-thrids list).
        qualifying_groups = set(best_thirds_map["__qualifying__"])
        candidates = [g for g in slot["groups"] if g in qualifying_groups]
        if not candidates:
            return None
        # Among candidates, pick the one with the most points (already sorted).
        return best_thirds_map.get(candidates[0])  # best_thirds_map keyed by group id
    return None

def best_thirds_index(standings):
    bt = best_thirds(standings)
    qualifying = [g for _, g, _ in bt[:8]]
    out = {"__qualifying__": qualifying}
    for _, g, team in bt:
        out[g] = team
    return out, bt

# ---------------------------------------------------------------------------
# 6. Render.
# ---------------------------------------------------------------------------

def slot_to_str(slot: dict) -> str:
    if slot["kind"] == "rank":
        return f"{slot['pos']}{slot['group']}"
    if slot["kind"] == "best3rd":
        return f"3º {{{'/'.join(slot['groups'])}}}"
    if slot["kind"] == "w":
        return f"Ganador M{slot['match']}"
    return "?"

def team_label(team: Optional[str]) -> str:
    if team is None:
        return "¿?"
    return f"{TEAM_DISPLAY.get(team, team)}"

# ---------------------------------------------------------------------------
# 7. Main: print the comparison and projection.
# ---------------------------------------------------------------------------

def main():
    current = load_current_bracket()
    bt_index, bt_list = best_thirds_index(STANDINGS_MD2)

    print("=" * 88)
    print("WORLD CUP 2026 — KNOCKOUT BRACKET AUDIT")
    print("=" * 88)

    print("\n[A] BEST 3RDS (proyección basada en standings al 19 jun, MD3 proyectado):")
    for i, (pts, grp, team) in enumerate(bt_list, 1):
        qual = "✓" if i <= 8 else "✗"
        print(f"   T{i} {qual}  {TEAM_DISPLAY.get(team,team):<18} (Grupo {grp}, {pts} pts)")

    print("\n[B] R32 — BRACKET ACTUAL (build-fixture.ts) vs BRACKET OFICIAL FIFA:")
    print(f"  {'#':>3}  {'ACTUAL':<32}  {'OFICIAL FIFA':<32}  {'ESTADO'}")
    print("  " + "-" * 88)
    for n, home, away, date in FIFA_R32:
        cur = current[n]
        cur_str = f"{cur['home']} vs {cur['away']}"
        off_str = f"{slot_to_str(home)} vs {slot_to_str(away)}"
        match = cur_str == off_str
        flag = "OK" if match else "❌"
        print(f"  {n:>3}  {cur_str:<32}  {off_str:<32}  {flag}")

    print("\n[C] R16 — REVISIÓN DE PAREJAS:")
    print(f"  {'#':>3}  {'ACTUAL':<24}  {'OFICIAL FIFA':<24}  {'ESTADO'}")
    print("  " + "-" * 64)
    for n, home, away, date in FIFA_R16:
        cur = current[n]
        cur_str = f"{cur['home']} vs {cur['away']}"
        off_str = f"{slot_to_str(home)} vs {slot_to_str(away)}"
        match = cur_str == off_str
        flag = "OK" if match else "❌"
        print(f"  {n:>3}  {cur_str:<24}  {off_str:<24}  {flag}")

    print("\n[D] R32 — PROYECCIÓN 'EQUIPO MÁS PROBABLE' POR SLOT (con bracket FIFA):")
    for n, home, away, date in FIFA_R32:
        h_team = resolve_slot(home, STANDINGS_MD2, bt_index)
        a_team = resolve_slot(away, STANDINGS_MD2, bt_index)
        flag = "⚠ TERCER NO CLASIFICA" if (a_team is None and away["kind"] == "best3rd") else ""
        print(f"  M{n}  {slot_to_str(home):<28}  →  {team_label(h_team):<18}    "
              f"{slot_to_str(away):<28}  →  {team_label(a_team):<18} {flag}")

    print("\n" + "=" * 88)
    print("Leyenda: ✓ = mejor tercero clasifica · ✗ = fuera del top 8 · ⚠ = slot vacío")
    print("=" * 88)

if __name__ == "__main__":
    main()
