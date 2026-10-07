"""Tests des métriques : python -m unittest discover -s ai/anomalies -p test_train.py."""

import unittest

import pandas as pd

from train import evaluate


class EvaluationTests(unittest.TestCase):
    def test_false_positives_delays_and_missed_episode(self):
        data = pd.DataFrame({
            "device_id": ["a"] * 7,
            "timestamp": pd.date_range("2026-10-05", periods=7, freq="5s", tz="UTC"),
            "expected_scenario": ["normal", "normal", "drift", "drift", "normal", "spike", "spike"],
            "anomaly": [False, True, False, True, False, False, False],
        })
        metrics = evaluate(data)
        self.assertEqual(metrics["confusion_matrix"], [[2, 1], [3, 1]])
        self.assertAlmostEqual(metrics["false_positive_rate"], 1 / 3)
        self.assertEqual(metrics["episodes"][0]["delay_seconds"], 5)
        self.assertFalse(metrics["episodes"][1]["detected"])
        self.assertIsNone(metrics["episodes"][1]["delay_seconds"])

    def test_devices_and_interruptions_are_separate_episodes(self):
        data = pd.DataFrame({
            "device_id": ["a", "a", "b"],
            "timestamp": pd.to_datetime(["2026-10-05T10:00:00Z", "2026-10-05T10:01:00Z",
                                         "2026-10-05T10:00:00Z"]),
            "expected_scenario": ["drift"] * 3,
            "anomaly": [True, False, True],
        })
        metrics = evaluate(data)
        self.assertEqual(len(metrics["episodes"]), 3)
        self.assertIsNone(metrics["false_positive_rate"])


if __name__ == "__main__":
    unittest.main()
