"""Contrôles des sessions synthétiques, sans évaluer le modèle sur le test."""

import csv
import hashlib
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from generate_sample_data import OUTPUT, generate_session, generate_sessions


class GeneratorTests(unittest.TestCase):
    def test_reproducibility_and_normal_training(self):
        args = (123, datetime(2026, 10, 8, tzinfo=timezone.utc), "train-01", False)
        rows, events = generate_session(*args)
        self.assertEqual((rows, events), generate_session(*args))
        self.assertEqual(len(rows), 1800)
        self.assertEqual({r["expected_scenario"] for r in rows}, {"normal"})
        self.assertNotEqual(rows, generate_session(124, *args[1:])[0])

    def test_splits_quality_manifest_and_original_preserved(self):
        original_hash = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "sessions"
            manifest = generate_sessions(output)
            self.assertEqual(len(manifest["sessions"]), 12)
            self.assertEqual(len({s["seed"] for s in manifest["sessions"]}), 12)
            previous_end = None
            for session in manifest["sessions"]:
                path = output / session["path"]
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), session["sha256"])
                with path.open(encoding="utf-8", newline="") as handle:
                    rows = list(csv.DictReader(handle))
                stamps = [datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) for r in rows]
                self.assertTrue(all((b-a).total_seconds() == 5 for a,b in zip(stamps, stamps[1:])))
                if previous_end is not None:
                    self.assertGreater(stamps[0], previous_end)
                previous_end = stamps[-1]
                for row in rows:
                    self.assertTrue(-40 <= float(row["temperature"]) <= 80)
                    self.assertTrue(0 <= float(row["humidity"]) <= 100)
                    self.assertTrue(0 <= float(row["gas"]) <= 1023)
                    self.assertEqual(row["session_id"], session["session_id"])
                    self.assertEqual(row["data_origin"], "synthetic")
                if session["split"] == "train":
                    self.assertEqual(set(session["scenario_counts"]), {"normal"})
                else:
                    self.assertEqual(set(session["scenario_counts"]),
                                     {"normal", "overheat", "gas_leak", "combined", "gas_spike"})
                    for event in session["events"]:
                        self.assertTrue(all(r["expected_scenario"] == event["scenario"]
                                            for r in rows[event["begin_index"]:event["end_index"]+1]))
            with self.assertRaises(FileExistsError):
                generate_sessions(output)
        self.assertEqual(original_hash, hashlib.sha256(OUTPUT.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
