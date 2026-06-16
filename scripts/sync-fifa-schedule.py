#!/usr/bin/env python3
"""
Regenerate the worldcup-2026.json group-stage schedule from the FIFA
official schedule (sourced via the English Wikipedia article, which
mirrors the FIFA fixture page).

Why this script exists
----------------------
The local manifest (`public/collections/worldcup-2026.json`) was originally
populated from a draft schedule that did not match the final FIFA
publication. As a result ~70 / 72 group-stage matches had wrong kickoff
times, venues and (in some groups) home/away assignments. This script
overwrites those 72 group-stage rows in-place, preserving the team
catalog, the sticker list and every knockout-stage id (knockout
matches are NOT touched — FIFA has not yet published their full set).

Run it any time FIFA revises the schedule. Idempotent.

Side effects
------------
- Bumps the package version (default: 2.0.2) in both the manifest and
  the index. Existing installs at 2.0.0/2.0.1 pick this up on next
  launch via the `syncDefaultCollection` flow, so users get the
  corrected schedule without re-installing.

Usage
-----
    python3 scripts/sync-fifa-schedule.py
    python3 scripts/sync-fifa-schedule.py --version 2.1.0
    python3 scripts/sync-fifa-schedule.py --source ./article.html   # offline
    python3 scripts/sync-fifa-schedule.py --dry-run                # print diff, no writes
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# --- Paths ------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "public" / "collections" / "worldcup-2026.json"
INDEX_PATH = ROOT / "public" / "collections" / "index.json"

# --- Source -----------------------------------------------------------------

WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup"
USER_AGENT = "panini-collection-tracker/1.x (https://github.com/diegominetti/AlbumPanini)"

# --- City → IANA timezone ----------------------------------------------------
# June 2026 is DST in the US/Canada, but NOT in Mexico (DST abolished in
# 2022). So Mexican venues are always UTC-6 in summer; US Central venues
# are UTC-5 in summer (DST in effect). The schedule source expresses this as
# "UTC-5" / "UTC-6" / "UTC-7" etc. and this map pins each city to a single
# IANA zone that matches that offset for the tournament window.

CITY_TZ: dict[str, str] = {
    # Mexico (UTC-6, no DST)
    "Mexico City": "America/Mexico_City",
    "Guadalajara": "America/Mexico_City",
    "Zapopan": "America/Mexico_City",
    "Monterrey": "America/Monterrey",
    "Guadalupe": "America/Monterrey",
    # US/Canada Pacific (UTC-7, DST in effect)
    "Los Angeles": "America/Los_Angeles",
    "Inglewood": "America/Los_Angeles",
    "San Francisco": "America/Los_Angeles",
    "Santa Clara": "America/Los_Angeles",
    "Seattle": "America/Los_Angeles",
    "Vancouver": "America/Vancouver",
    # US Central (UTC-5, DST in effect)
    "Houston": "America/Chicago",
    "Dallas": "America/Chicago",
    "Arlington": "America/Chicago",
    "Kansas City": "America/Chicago",
    "Chicago": "America/Chicago",
    # US Eastern (UTC-4, DST in effect)
    "Atlanta": "America/New_York",
    "Miami": "America/New_York",
    "Miami Gardens": "America/New_York",
    "Boston": "America/New_York",
    "Foxborough": "America/New_York",
    "Philadelphia": "America/New_York",
    "New York": "America/New_York",
    "East Rutherford": "America/New_York",
    "New York/New Jersey": "America/New_York",
    # Canada Eastern
    "Toronto": "America/Toronto",
}

OFFSET_TZ_FALLBACK: dict[str, str] = {
    "UTC-4": "America/New_York",
    "UTC-5": "America/Chicago",
    "UTC-6": "America/Mexico_City",
    "UTC-7": "America/Los_Angeles",
}


# --- Fetch ------------------------------------------------------------------


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


# --- Time helpers -----------------------------------------------------------


def _offset_to_minutes(offset: str) -> int:
    """`UTC-5` / `UTC-7` / `UTC+0` → signed minutes from UTC. Normalises
    the Unicode minus (U+2212) the Wikipedia source uses."""
    m = re.match(r"^UTC([+−-])(\d{1,2})(?::(\d{2}))?$", offset)
    if not m:
        raise ValueError(f"unrecognised offset: {offset!r}")
    sign = -1 if m.group(1) in ("-", "−") else 1
    h = int(m.group(2))
    mm = int(m.group(3) or 0)
    return sign * (h * 60 + mm)


def local_to_utc(date_str: str, time_str: str, offset: str) -> str:
    """`2026-06-16` + `20:00` + `UTC-5` → `2026-06-17T01:00:00.000Z`.

    Returns an ISO-8601 string with millisecond precision and the `Z`
    suffix the manifest uses elsewhere."""
    minutes = _offset_to_minutes(offset)
    naive = datetime.fromisoformat(f"{date_str}T{time_str}:00")
    tz = timezone(timedelta(minutes=minutes))
    local = naive.replace(tzinfo=tz)
    utc = local.astimezone(timezone.utc)
    # Match the existing manifest style: `2026-06-17T01:00:00.000Z`
    return utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def offset_to_iana(city: str, offset: str) -> str:
    return CITY_TZ.get(city, OFFSET_TZ_FALLBACK.get(offset, "UTC"))


# --- HTML strip + parse -----------------------------------------------------


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t\u00A0]+")
_ENTITIES = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&#160;": " ",
    "&#8722;": "-",
    "&minus;": "-",
    "&ndash;": "-",
    "&mdash;": "-",
}


def strip_html(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    for ent, ch in _ENTITIES.items():
        text = text.replace(ent, ch)
    # Decode any remaining numeric entities
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), text)
    text = _WS_RE.sub(" ", text)
    return text


# Two patterns to catch: "8:00 p.m." and "12:00" (already 24h).
# Times are anchored by the explicit (YYYY-MM-DD) anchor the Wikipedia
# source uses, so we don't have to guess.
_12H_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$", re.IGNORECASE)
_24H_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def to_24h(token: str) -> int:
    """`8:00 p.m.` → 20, `12:00 a.m.` → 0, `13:00` → 13."""
    m = _12H_RE.match(token)
    if m:
        h, mm, ap = int(m.group(1)), int(m.group(2)), m.group(3).lower()
        if ap == "p" and h != 12:
            h += 12
        elif ap == "a" and h == 12:
            h = 0
        return h * 60 + mm
    m = _24H_RE.match(token)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    raise ValueError(f"unrecognised time token: {token!r}")


# Two block shapes show up in the source:
#
# (a) Unplayed — the future matchdays use a flat template with no score:
#     ( 2026-06-16 ) 8:00 p.m. UTC-5
#     Argentina Match 19 Algeria
#     [ Report 55 ]
#     Arrowhead Stadium , Kansas City Referee: Szymon …
#
# (b) Played — the played matchdays (currently 2026-06-11 / 12) keep
#     the same skeleton but the team line embeds the final score and
#     the scorers land between that line and the [Report N] line:
#     ( 2026-06-11 ) 1:00 p.m. UTC-6
#     Mexico 2–0 South Africa
#     Quiñones 9'
#     Jiménez 67'
#     [ Report 1 ]
#     Estadio Azteca , Mexico City Attendance: 80,824 Referee: Wilton …
#
# Both blocks share the same date-anchor + time + offset + [Report N] +
# venue skeleton, so we factor those out and only special-case the
# team-line shape.
_BLOCK_RE = re.compile(
    r"""
    \(\s*(?P<date_anchor>\d{4}-\d{2}-\d{2})\s*\)
    \s*
    (?P<time>\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?)
    \s*
    (?P<offset>UTC[+−-]\d{1,2}(?::\d{2})?)
    \s+
    (?P<teams>.+?)
    \s*\[\s*Report\s+(?P<report_num>\d+)\s*\]
    \s+
    (?P<venue_city>.+?)
    (?=Referee:|June|\Z)
    """,
    re.VERBOSE | re.DOTALL,
)


# Sub-patterns for the two team-line shapes.
# Both use [^\d]+? (non-digit) for the team name so the regex works for
# "Türkiye", "Curaçao", "São" etc. (Wikipedia uses the diacritic-free
# "Turkey" — see _TEAM_IDS — and the curly apostrophe in some names).
_TEAM_LINE_UNPLAYED = re.compile(
    r"^(?P<home>[^\d]+?)\s+Match\s+(?P<match_num>\d+)\s+(?P<away>[^\d]+?)\s*$"
)
_TEAM_LINE_PLAYED = re.compile(
    r"^(?P<home>[^\d]+?)\s+\d+[–-]\d+(?:\s*\([\d]+[–-]\d+\s*pen\))?\s+(?P<away>[^\d]+?)\s*$"
)


# Allow the parser to find group sections by their Wikipedia sub-article
# heading text, which appears verbatim in the source HTML.
_GROUP_HEADINGS = {
    "Group A": range(1, 7),
    "Group B": range(7, 13),
    "Group C": range(13, 19),
    "Group D": range(19, 25),
    "Group E": range(25, 31),
    "Group F": range(31, 37),
    "Group G": range(37, 43),
    "Group H": range(43, 49),
    "Group I": range(49, 55),
    "Group J": range(55, 61),
    "Group K": range(61, 67),
    "Group L": range(67, 73),
}


# Wiki section anchors use just `Group_X` as the id (the long
# `2026_FIFA_World_Cup_Group_X` form only appears in hrefs, not ids).
_WIKI_GROUP_HDR = re.compile(r"id=\"Group_([A-L])\"")


def slice_groups(html: str) -> dict[str, str]:
    """Return a map of group letter → the slice of *raw HTML* between
    that group's section heading and the next one. Working in raw
    HTML preserves the `id="Group_X"` anchors we use to split; the
    slice gets passed through strip_html before the per-match regex
    runs."""
    headers = list(_WIKI_GROUP_HDR.finditer(html))
    if len(headers) < 12:
        raise RuntimeError(
            f"expected 12 group sections in source, found {len(headers)}"
        )
    out: dict[str, str] = {}
    for i, m in enumerate(headers):
        letter = m.group(1)
        start = m.start()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(html)
        out[letter] = html[start:end]
    return out


def parse_one_match(block: str) -> dict:
    m = _BLOCK_RE.search(block)
    if not m:
        raise ValueError(f"could not parse match block: {block[:200]!r}")
    time_minutes = to_24h(m.group("time"))
    h, mm = divmod(time_minutes, 60)
    local_time = f"{h:02d}:{mm:02d}"
    offset = m.group("offset").replace("−", "-")

    # Extract the team line. The source has two shapes:
    # - Unplayed: "Argentina Match 19 Algeria"
    # - Played:   "Mexico 2–0 South Africa" (possibly with pen score)
    # In the played shape, the captured `teams` block also contains the
    # scorer lines ("Quiñones 9' …"), so we keep only the first
    # non-empty line before trying the team-line regexes.
    teams_block = m.group("teams").strip()
    first_line = next(
        (ln.strip() for ln in teams_block.splitlines() if ln.strip()),
        "",
    )
    unplayed = _TEAM_LINE_UNPLAYED.match(first_line)
    if unplayed:
        home = unplayed.group("home")
        away = unplayed.group("away")
    else:
        played = _TEAM_LINE_PLAYED.match(first_line)
        if not played:
            raise ValueError(
                f"could not parse team line: {first_line[:120]!r}"
            )
        home = played.group("home")
        away = played.group("away")

    venue_city_raw = m.group("venue_city").strip()
    venue, city = _split_venue_city(venue_city_raw)

    return {
        "matchNumber": int(m.group("report_num")),
        "date": m.group("date_anchor"),
        "localTime": local_time,
        "offset": offset,
        "homeTeamId": _team_id(home),
        "awayTeamId": _team_id(away),
        "venueName": venue,
        "city": city,
    }


def _split_venue_city(raw: str) -> tuple[str, str]:
    """`Arrowhead Stadium , Kansas City Attendance: 80,824 Referee: …` →
    `("Arrowhead Stadium", "Kansas City")`.

    Played-match blocks (m1, m2, m7, m8 …) tack an `Attendance: NN,NNN`
    on to the venue line; the unplayed ones just have a trailing
    `Referee: …`. Both also can have away-scorer lines
    (`Krejčí 59'` or `Embolo 17' ( pen.`) wedged between the
    `[ Report N ]` and the venue line. We:
      1. Strip everything from `Attendance:` / `Referee:` onward.
      2. Drop any line that looks like a scorer (ends with a minute
         marker `\\d+'` followed by optional penalty annotation).
      3. The first remaining line is `Stadium , City`.
    """
    s = re.split(r"\s*(?:Attendance:|Referee:)\s*", raw, maxsplit=1)[0]
    # Scorer line: a name + minute like "9'" or "45+5'" or "88'",
    # optionally followed by ", 90+3'" (a second minute for the same
    # scorer) and an optional "( pen." / "(o.g.)" annotation. The
    # Wikipedia source always terminates a scorer line with the
    # prime character, so we anchor on that.
    scorer_re = re.compile(r"'\s*(?:[,()a-z.0-9+\s]*)$")
    lines = [
        ln.strip()
        for ln in s.splitlines()
        if ln.strip() and not scorer_re.search(ln)
    ]
    if not lines:
        return "", ""
    venue_line = lines[0]
    if "," in venue_line:
        venue, city = venue_line.split(",", 1)
        return venue.strip(), city.strip()
    # No comma: assume the last whitespace-separated token is the city.
    parts = venue_line.rsplit(" ", 1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return venue_line, ""


# Map a country name (as printed on Wikipedia) to the 3-letter team id used
# in the local manifest. The list mirrors FIFA's own naming — these names
# are stable across the source article. Both the accented (e.g. "Türkiye")
# and the Latin-only ("Turkey") spellings are accepted so the parser
# survives any Wikipedia drift.
_TEAM_IDS: dict[str, str] = {
    "Mexico": "MEX",
    "South Africa": "RSA",
    "South Korea": "KOR",
    "Czech Republic": "CZE",
    "Canada": "CAN",
    "Bosnia and Herzegovina": "BIH",
    "Qatar": "QAT",
    "Switzerland": "SUI",
    "Brazil": "BRA",
    "Haiti": "HAI",
    "Morocco": "MAR",
    "Scotland": "SCO",
    "United States": "USA",
    "Australia": "AUS",
    "Türkiye": "TUR",
    "Turkey": "TUR",
    "Paraguay": "PAR",
    "Germany": "GER",
    "Ivory Coast": "CIV",
    "Ecuador": "ECU",
    "Curaçao": "CUW",
    "Curacao": "CUW",
    "Sweden": "SWE",
    "Japan": "JPN",
    "Netherlands": "NED",
    "Tunisia": "TUN",
    "Belgium": "BEL",
    "Egypt": "EGY",
    "Iran": "IRN",
    "New Zealand": "NZL",
    "Spain": "ESP",
    "Cape Verde": "CPV",
    "Uruguay": "URU",
    "Saudi Arabia": "KSA",
    "France": "FRA",
    "Senegal": "SEN",
    "Iraq": "IRQ",
    "Norway": "NOR",
    "Argentina": "ARG",
    "Algeria": "ALG",
    "Austria": "AUT",
    "Jordan": "JOR",
    "Portugal": "POR",
    "DR Congo": "COD",
    "Uzbekistan": "UZB",
    "Colombia": "COL",
    "England": "ENG",
    "Croatia": "CRO",
    "Ghana": "GHA",
    "Panama": "PAN",
}


def _team_id(name: str) -> str:
    name = name.strip()
    if name in _TEAM_IDS:
        return _TEAM_IDS[name]
    raise ValueError(f"unknown team name: {name!r}")


def parse_schedule(html: str) -> list[dict]:
    group_slices = slice_groups(html)
    schedule: list[dict] = []
    for letter in "ABCDEFGHIJKL":
        slice_ = group_slices[letter]
        text = strip_html(slice_)
        # Split on the date-anchor pattern (allowing optional spaces
        # inside the parens, which the Wikipedia source uses).
        for block in re.split(r"(?=\(\s*\d{4}-\d{2}-\d{2}\s*\))", text):
            block = block.strip()
            if not block:
                continue
            try:
                schedule.append(parse_one_match(block))
            except ValueError:
                # Skip blocks that don't look like a match (e.g. scorer
                # lines, summary tables, etc.).
                continue
    return schedule


# --- Manifest update --------------------------------------------------------


def update_manifest(
    manifest: dict, schedule: list[dict], new_version: str, dry_run: bool
) -> dict:
    matches = manifest["tournament"]["matches"]
    by_num = {m["matchNumber"]: m for m in schedule}

    # Phase 1: compute the diff for every group match that has a
    # counterpart in the schedule. We keep the after-state next to
    # the match so phase 2 can apply it without recomputing.
    diffs: list[str] = []
    planned: list[tuple[dict, dict]] = []
    for m in matches:
        mn = m.get("matchNumber")
        if m.get("stage") != "group" or mn is None:
            continue
        sched = by_num.get(mn)
        if not sched:
            continue
        utc = local_to_utc(sched["date"], sched["localTime"], sched["offset"])
        iana = offset_to_iana(sched["city"], sched["offset"])
        before = {
            "date": m.get("date"),
            "kickoff": m.get("kickoff"),
            "kickoffTz": m.get("kickoffTz"),
            "homeTeamId": m.get("homeTeamId"),
            "awayTeamId": m.get("awayTeamId"),
            "venue": m.get("venue"),
            "city": m.get("city"),
        }
        after = {
            "date": sched["date"],
            "kickoff": utc,
            "kickoffTz": iana,
            "homeTeamId": sched["homeTeamId"],
            "awayTeamId": sched["awayTeamId"],
            "venue": sched["venueName"],
            "city": sched["city"],
        }
        if before != after:
            diffs.append(f"  m{mn}: {before} → {after}")
            planned.append((m, after))

    # Phase 2: apply the changes (skipped under --dry-run).
    if not dry_run:
        for m, after in planned:
            m["date"] = after["date"]
            m["kickoff"] = after["kickoff"]
            m["kickoffTz"] = after["kickoffTz"]
            m["homeTeamId"] = after["homeTeamId"]
            m["awayTeamId"] = after["awayTeamId"]
            m["venue"] = after["venue"]
            m["city"] = after["city"]
        manifest["version"] = new_version
    return {"diffs": diffs, "manifest": manifest}


def update_index(index: dict, collection_id: str, new_version: str) -> int:
    changed = 0
    for entry in index.get("collections", []):
        if entry.get("id") == collection_id:
            if entry.get("version") != new_version:
                entry["version"] = new_version
                changed += 1
    return changed


# --- Main -------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Regenerate the worldcup-2026 group-stage schedule "
        "from the FIFA official publication (via Wikipedia)."
    )
    ap.add_argument(
        "--source",
        help="Path to a saved Wikipedia article HTML (offline mode). "
        "Default: fetch live from wikipedia.org.",
    )
    ap.add_argument(
        "--version",
        default="2.0.2",
        help="New manifest version (default 2.0.2). The schedule.json "
        "and index.json are both bumped to this value.",
    )
    ap.add_argument(
        "--collection-id",
        default="worldcup-2026",
        help="Collection id to update (default worldcup-2026).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the diff but do not write to disk.",
    )
    args = ap.parse_args()

    if args.source:
        html = Path(args.source).read_text(encoding="utf-8")
        print(f"reading article from {args.source}")
    else:
        print(f"fetching {WIKIPEDIA_URL} …")
        html = fetch_html(WIKIPEDIA_URL)
        print(f"  {len(html):,} bytes")

    print("parsing group-stage schedule …")
    schedule = parse_schedule(html)
    print(f"  parsed {len(schedule)} matches")
    if len(schedule) != 72:
        print(
            f"  WARNING: expected 72 matches (got {len(schedule)}); "
            "the Wikipedia source may have moved or the article format "
            "may have changed. Aborting before any writes.",
            file=sys.stderr,
        )
        return 2

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))

    result = update_manifest(
        manifest, schedule, args.version, dry_run=args.dry_run
    )
    index_changes = update_index(index, args.collection_id, args.version)

    if args.dry_run:
        print(f"\n--- dry run, no files written ---")
        print(f"would update {len(result['diffs'])} group-stage matches")
        if result["diffs"]:
            print("first 5 changes:")
            for d in result["diffs"][:5]:
                print(d)
        return 0

    # Write atomically: write to .tmp first, then rename.
    tmp_manifest = MANIFEST_PATH.with_suffix(".json.tmp")
    tmp_manifest.write_text(
        json.dumps(result["manifest"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_manifest.replace(MANIFEST_PATH)

    tmp_index = INDEX_PATH.with_suffix(".json.tmp")
    tmp_index.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_index.replace(INDEX_PATH)

    print(
        f"updated {len(result['diffs'])} group-stage matches; "
        f"manifest + index bumped to {args.version}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
