"""Social Studio contract: example workspace must be schema-valid and referentially consistent.

The example doubles as seed data for the web UI and the iOS app, so drift between
contract and seed would break both clients.
"""
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "contracts/social_studio/v1.schema.json"
EXAMPLE = REPO_ROOT / "examples/social_studio/workspace.json"


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class SocialStudioContractTests(unittest.TestCase):
    def setUp(self):
        self.schema = _load(SCHEMA)
        self.ws = _load(EXAMPLE)

    def test_schema_is_valid_draft_2020_12(self):
        Draft202012Validator.check_schema(self.schema)

    def test_example_is_schema_valid(self):
        errors = list(Draft202012Validator(self.schema).iter_errors(self.ws))
        self.assertEqual([], [f"{list(e.path)}: {e.message}" for e in errors])

    def test_ids_are_unique_per_collection(self):
        for key in ("team", "clients", "contents", "scripts", "shots", "shoots", "media", "activity"):
            ids = [item["id"] for item in self.ws[key]]
            self.assertEqual(len(ids), len(set(ids)), f"duplicate ids in {key}")

    def test_references_resolve(self):
        team = {m["id"] for m in self.ws["team"]}
        clients = {c["id"] for c in self.ws["clients"]}
        contents = {c["id"]: c for c in self.ws["contents"]}
        shoots = {s["id"]: s for s in self.ws["shoots"]}
        scripts = {s["id"] for s in self.ws["scripts"]}
        media = {m["id"] for m in self.ws["media"]}

        self.assertIn(self.ws["workspace"]["currentUserId"], team)
        for m in self.ws["team"]:
            if m["role"] == "client":
                self.assertIn(m.get("clientId"), clients, m["id"])
        for c in contents.values():
            self.assertIn(c["clientId"], clients, c["id"])
            for uid in c["assigneeIds"]:
                self.assertIn(uid, team, c["id"])
            if "shootId" in c:
                self.assertIn(c["shootId"], shoots, c["id"])
                self.assertIn(c["id"], shoots[c["shootId"]]["contentIds"], c["id"])
        for s in self.ws["scripts"]:
            self.assertIn(s["contentId"], contents, s["id"])
        script_scenes = {}
        for s in self.ws["scripts"]:
            script_scenes.setdefault(s["contentId"], set()).update(sc["id"] for sc in s["scenes"])
        for shot in self.ws["shots"]:
            self.assertIn(shot["contentId"], contents, shot["id"])
            if "sceneId" in shot:
                self.assertIn(shot["sceneId"], script_scenes.get(shot["contentId"], set()), shot["id"])
        for sh in shoots.values():
            self.assertIn(sh["clientId"], clients, sh["id"])
            self.assertLessEqual(sh["startTime"], sh["endTime"], sh["id"])
            for uid in sh["teamIds"]:
                self.assertIn(uid, team, sh["id"])
            for cid in sh["contentIds"]:
                self.assertIn(cid, contents, sh["id"])
                self.assertEqual(contents[cid]["clientId"], sh["clientId"], f"{sh['id']} -> {cid}")
                self.assertEqual(contents[cid].get("shootId"), sh["id"], f"{sh['id']} -> {cid}")
        for m in self.ws["media"]:
            self.assertIn(m["contentId"], contents, m["id"])
            self.assertIn(m["uploadedById"], team, m["id"])
            for rc in m["comments"]:
                self.assertIn(rc["authorId"], team, rc["id"])
                if "timestampSec" in rc and "durationSec" in m:
                    self.assertLessEqual(rc["timestampSec"], m["durationSec"], rc["id"])
        targets = {"content": set(contents), "script": scripts, "shoot": set(shoots), "media": media, "client": clients}
        for a in self.ws["activity"]:
            self.assertIn(a["actorId"], team, a["id"])
            self.assertIn(a["targetId"], targets[a["targetType"]], a["id"])


if __name__ == "__main__":
    unittest.main()
