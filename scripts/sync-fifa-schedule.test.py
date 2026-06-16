"""Tests for the FIFA schedule sync script.

These exercise the pure helpers (`local_to_utc`, `offset_to_iana`,
`to_24h`, `_split_venue_city`, `_team_id`, the match-block parser and
the manifest updater) so the script can be run safely in CI without
hitting Wikipedia.

Live `parse_schedule` is exercised only in integration: parsing the
real article is too brittle to capture here.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "sync-fifa-schedule.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("sync_fifa", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TimeHelpers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def test_offset_to_minutes_canonical(self):
        self.assertEqual(self.mod._offset_to_minutes("UTC-5"), -300)
        self.assertEqual(self.mod._offset_to_minutes("UTC+2"), 120)
        self.assertEqual(self.mod._offset_to_minutes("UTC-7"), -420)
        self.assertEqual(self.mod._offset_to_minutes("UTC+0"), 0)

    def test_offset_to_minutes_with_minutes(self):
        # India is UTC+5:30 — the script must surface the half-hour
        # offset so the local → UTC conversion lands on the right
        # instant.
        self.assertEqual(self.mod._offset_to_minutes("UTC+5:30"), 330)

    def test_offset_to_minutes_unicode_minus(self):
        # Wikipedia renders the offset with U+2212; the script
        # normalises it to the ASCII form before parsing.
        self.assertEqual(self.mod._offset_to_minutes("UTC−5"), -300)

    def test_offset_to_minutes_invalid(self):
        with self.assertRaises(ValueError):
            self.mod._offset_to_minutes("not-an-offset")

    def test_local_to_utc_buenos_aires_minus_three(self):
        # Argentina plays at 22:00 ART on 2026-06-16 = 01:00 UTC on
        # 2026-06-17. This is the headline case the script must not
        # mangle.
        self.assertEqual(
            self.mod.local_to_utc("2026-06-16", "22:00", "UTC-3"),
            "2026-06-17T01:00:00.000Z",
        )

    def test_local_to_utc_mexico_city_minus_six(self):
        # Mexico at 13:00 local = 19:00 UTC.
        self.assertEqual(
            self.mod.local_to_utc("2026-06-11", "13:00", "UTC-6"),
            "2026-06-11T19:00:00.000Z",
        )

    def test_local_to_utc_kansas_city_cdt_minus_five(self):
        # Kansas City in June is on CDT = UTC-5. 20:00 local = 01:00
        # UTC the next day.
        self.assertEqual(
            self.mod.local_to_utc("2026-06-16", "20:00", "UTC-5"),
            "2026-06-17T01:00:00.000Z",
        )

    def test_local_to_utc_india_half_hour(self):
        # UTC+5:30 (India) — 19:30 local = 14:00 UTC.
        self.assertEqual(
            self.mod.local_to_utc("2026-06-16", "19:30", "UTC+5:30"),
            "2026-06-16T14:00:00.000Z",
        )

    def test_to_24h_pm(self):
        self.assertEqual(self.mod.to_24h("8:00 p.m."), 20 * 60)
        self.assertEqual(self.mod.to_24h("12:00 p.m."), 12 * 60)
        self.assertEqual(self.mod.to_24h("1:00 a.m."), 1 * 60)
        self.assertEqual(self.mod.to_24h("12:00 a.m."), 0)
        self.assertEqual(self.mod.to_24h("11:59 p.m."), 23 * 60 + 59)

    def test_to_24h_already_24h(self):
        self.assertEqual(self.mod.to_24h("13:00"), 13 * 60)
        self.assertEqual(self.mod.to_24h("00:00"), 0)

    def test_to_24h_invalid_raises(self):
        with self.assertRaises(ValueError):
            self.mod.to_24h("not a time")


class IanaZoneFromCity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def test_mexico_cities(self):
        # Mexico abolished DST in 2022; all Mexican venues stay at
        # UTC-6 year-round.
        for city in ("Mexico City", "Guadalajara", "Zapopan"):
            self.assertEqual(
                self.mod.offset_to_iana(city, "UTC-6"),
                "America/Mexico_City",
            )
        self.assertEqual(
            self.mod.offset_to_iana("Monterrey", "UTC-6"),
            "America/Monterrey",
        )
        self.assertEqual(
            self.mod.offset_to_iana("Guadalupe", "UTC-6"),
            "America/Monterrey",
        )

    def test_us_central(self):
        # US Central venues follow DST (CDT in June = UTC-5).
        for city in ("Houston", "Dallas", "Arlington", "Kansas City", "Chicago"):
            self.assertEqual(
                self.mod.offset_to_iana(city, "UTC-5"),
                "America/Chicago",
            )

    def test_us_pacific(self):
        for city in ("Los Angeles", "Inglewood", "San Francisco",
                     "Santa Clara", "Seattle"):
            self.assertEqual(
                self.mod.offset_to_iana(city, "UTC-7"),
                "America/Los_Angeles",
            )
        self.assertEqual(
            self.mod.offset_to_iana("Vancouver", "UTC-7"),
            "America/Vancouver",
        )

    def test_us_eastern(self):
        for city in ("Atlanta", "Miami", "Miami Gardens", "Boston",
                     "Foxborough", "Philadelphia", "New York",
                     "East Rutherford", "New York/New Jersey"):
            self.assertEqual(
                self.mod.offset_to_iana(city, "UTC-4"),
                "America/New_York",
            )
        self.assertEqual(
            self.mod.offset_to_iana("Toronto", "UTC-4"),
            "America/Toronto",
        )

    def test_fallback_uses_offset(self):
        # Unknown city falls back to the offset's representative zone.
        self.assertEqual(
            self.mod.offset_to_iana("Atlantis", "UTC-4"),
            "America/New_York",
        )


class VenueCitySplit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def test_unplayed_with_referee(self):
        v, c = self.mod._split_venue_city(
            "Arrowhead Stadium , Kansas City Referee: Szymon Marciniak ( Poland )"
        )
        self.assertEqual(v, "Arrowhead Stadium")
        self.assertEqual(c, "Kansas City")

    def test_played_with_attendance_and_away_scorer(self):
        v, c = self.mod._split_venue_city(
            "Krejčí 59' \n Estadio Akron , Zapopan Attendance: 44,985 Referee: Amin Omar"
        )
        self.assertEqual(v, "Estadio Akron")
        self.assertEqual(c, "Zapopan")

    def test_played_with_attendance_no_scorer(self):
        v, c = self.mod._split_venue_city(
            "Estadio Azteca , Mexico City Attendance: 80,824 Referee: Wilton Sampaio"
        )
        self.assertEqual(v, "Estadio Azteca")
        self.assertEqual(c, "Mexico City")

    def test_played_with_pen_annotation_in_scorer(self):
        v, c = self.mod._split_venue_city(
            "Embolo 17' ( pen. \n BC Place , Vancouver Attendance: 52,497 Referee: J. Valenzuela"
        )
        self.assertEqual(v, "BC Place")
        self.assertEqual(c, "Vancouver")

    def test_no_comma_falls_back_to_last_token(self):
        v, c = self.mod._split_venue_city("MetLife Stadium East Rutherford Referee: x")
        # No comma in the source so the last whitespace-separated
        # token becomes the city. This is a defensive fallback for
        # any venue Wikipedia renders as one space-separated blob.
        self.assertEqual(v, "MetLife Stadium East")
        self.assertEqual(c, "Rutherford")


class TeamNameMapping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def test_known_teams(self):
        # Spot-check a handful of names that are easy to get wrong
        # (special chars, latin-only spelling drift).
        self.assertEqual(self.mod._team_id("Argentina"), "ARG")
        self.assertEqual(self.mod._team_id("Curaçao"), "CUW")
        self.assertEqual(self.mod._team_id("Curacao"), "CUW")
        self.assertEqual(self.mod._team_id("Türkiye"), "TUR")
        self.assertEqual(self.mod._team_id("Turkey"), "TUR")
        self.assertEqual(self.mod._team_id("Bosnia and Herzegovina"), "BIH")
        self.assertEqual(self.mod._team_id("Czech Republic"), "CZE")
        self.assertEqual(self.mod._team_id("DR Congo"), "COD")
        self.assertEqual(self.mod._team_id("Ivory Coast"), "CIV")

    def test_unknown_raises(self):
        with self.assertRaises(ValueError):
            self.mod._team_id("Atlantis United")


class MatchBlockParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def test_unplayed_block(self):
        # The full unplayed block (anchor + time + offset + teams +
        # Report + venue/city + Referee).
        block = (
            "June 16, 2026 ( 2026-06-16 ) 8:00 p.m. UTC−5 "
            "Argentina Match 19 Algeria "
            "[ Report 55 ] "
            "Arrowhead Stadium , Kansas City Referee: Szymon Marciniak"
        )
        m = self.mod.parse_one_match(block)
        self.assertEqual(m["matchNumber"], 55)
        self.assertEqual(m["date"], "2026-06-16")
        self.assertEqual(m["localTime"], "20:00")
        self.assertEqual(m["offset"], "UTC-5")
        self.assertEqual(m["homeTeamId"], "ARG")
        self.assertEqual(m["awayTeamId"], "ALG")
        self.assertEqual(m["venueName"], "Arrowhead Stadium")
        self.assertEqual(m["city"], "Kansas City")

    def test_played_block_with_score_and_scorers(self):
        # The played block has the score in the team line and a
        # number of scorer lines on either side of the [Report N].
        block = (
            "( 2026-06-11 ) 1:00 p.m. UTC−6 "
            "Mexico 2–0 South Africa\n"
            "Quiñones 9' \n Jiménez 67' \n"
            "[ Report 1 ] \n\n"
            "Estadio Azteca , Mexico City Attendance: 80,824 Referee: Wilton Sampaio"
        )
        m = self.mod.parse_one_match(block)
        self.assertEqual(m["matchNumber"], 1)
        self.assertEqual(m["homeTeamId"], "MEX")
        self.assertEqual(m["awayTeamId"], "RSA")
        self.assertEqual(m["localTime"], "13:00")
        self.assertEqual(m["venueName"], "Estadio Azteca")
        self.assertEqual(m["city"], "Mexico City")

    def test_played_block_with_away_scorer_after_report(self):
        # Czech goals show up between [Report N] and the venue.
        block = (
            "( 2026-06-11 ) 8:00 p.m. UTC−6 "
            "South Korea 2–1 Czech Republic\n"
            "Hwang In-beom 67' \n Oh Hyeon-gyu 80' \n"
            "[ Report 2 ] \n Krejčí 59' \n"
            "Estadio Akron , Zapopan Attendance: 44,985 Referee: Amin Omar"
        )
        m = self.mod.parse_one_match(block)
        self.assertEqual(m["matchNumber"], 2)
        self.assertEqual(m["homeTeamId"], "KOR")
        self.assertEqual(m["awayTeamId"], "CZE")
        self.assertEqual(m["venueName"], "Estadio Akron")
        self.assertEqual(m["city"], "Zapopan")

    def test_garbage_block_raises(self):
        with self.assertRaises(ValueError):
            self.mod.parse_one_match("this is not a match block")


class ManifestUpdater(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = _load_script()

    def _make_manifest(self):
        return {
            "id": "worldcup-2026",
            "version": "2.0.1",
            "name": "FIFA World Cup 2026",
            "tournament": {
                "matches": [
                    # A group match that needs updating.
                    {
                        "id": "m55",
                        "matchNumber": 55,
                        "stage": "group",
                        "group": "J",
                        "date": "2026-06-16",
                        "kickoff": "2026-06-16T19:00:00.000Z",
                        "kickoffTz": "America/Los_Angeles",
                        "homeTeamId": "ARG",
                        "awayTeamId": "ALG",
                        "venue": "Levi's Stadium",
                        "city": "San Francisco",
                    },
                    # A knockout match — should be left alone.
                    {
                        "id": "m73",
                        "matchNumber": 73,
                        "stage": "r32",
                        "homeTeamId": "TBD",
                        "awayTeamId": "TBD",
                    },
                ]
            },
        }

    def test_update_manifest_rewrites_group_match_in_place(self):
        manifest = self._make_manifest()
        schedule = [
            {
                "matchNumber": 55,
                "date": "2026-06-16",
                "localTime": "20:00",
                "offset": "UTC-5",
                "homeTeamId": "ARG",
                "awayTeamId": "ALG",
                "venueName": "Arrowhead Stadium",
                "city": "Kansas City",
            }
        ]
        result = self.mod.update_manifest(
            manifest, schedule, "2.0.2", dry_run=False
        )
        self.assertEqual(len(result["diffs"]), 1)
        m55 = manifest["tournament"]["matches"][0]
        self.assertEqual(m55["kickoff"], "2026-06-17T01:00:00.000Z")
        self.assertEqual(m55["kickoffTz"], "America/Chicago")
        self.assertEqual(m55["venue"], "Arrowhead Stadium")
        self.assertEqual(m55["city"], "Kansas City")
        self.assertEqual(manifest["version"], "2.0.2")

    def test_update_manifest_skips_knockout(self):
        manifest = self._make_manifest()
        schedule = [
            {
                "matchNumber": 55,
                "date": "2026-06-16",
                "localTime": "20:00",
                "offset": "UTC-5",
                "homeTeamId": "ARG",
                "awayTeamId": "ALG",
                "venueName": "Arrowhead Stadium",
                "city": "Kansas City",
            }
        ]
        result = self.mod.update_manifest(
            manifest, schedule, "2.0.2", dry_run=False
        )
        # Only the group match was updated, not m73.
        knockout = manifest["tournament"]["matches"][1]
        self.assertEqual(knockout["id"], "m73")
        self.assertEqual(knockout["homeTeamId"], "TBD")
        # The diff list contains only the group change.
        self.assertEqual(len(result["diffs"]), 1)

    def test_update_manifest_dry_run_does_not_write(self):
        manifest = self._make_manifest()
        schedule = [
            {
                "matchNumber": 55,
                "date": "2026-06-16",
                "localTime": "20:00",
                "offset": "UTC-5",
                "homeTeamId": "ARG",
                "awayTeamId": "ALG",
                "venueName": "Arrowhead Stadium",
                "city": "Kansas City",
            }
        ]
        self.mod.update_manifest(manifest, schedule, "2.0.2", dry_run=True)
        # Manifest was not mutated under dry-run.
        self.assertEqual(
            manifest["tournament"]["matches"][0]["kickoff"],
            "2026-06-16T19:00:00.000Z",
        )
        self.assertEqual(manifest["version"], "2.0.1")

    def test_update_index_bumps_matching_entry(self):
        index = {
            "collections": [
                {"id": "worldcup-2026", "version": "2.0.1", "name": "X"},
                {"id": "pokemon-151", "version": "1.0.0", "name": "Y"},
            ]
        }
        changed = self.mod.update_index(index, "worldcup-2026", "2.0.2")
        self.assertEqual(changed, 1)
        self.assertEqual(index["collections"][0]["version"], "2.0.2")
        # The other collection is untouched.
        self.assertEqual(index["collections"][1]["version"], "1.0.0")

    def test_update_index_no_change_when_same_version(self):
        index = {
            "collections": [
                {"id": "worldcup-2026", "version": "2.0.2", "name": "X"},
            ]
        }
        changed = self.mod.update_index(index, "worldcup-2026", "2.0.2")
        self.assertEqual(changed, 0)


if __name__ == "__main__":
    unittest.main()
