"""Vérifie l'isolation des sessions et la préparation courte."""

import unittest
from datetime import datetime, timezone

import pandas as pd

from features import build_features, validate_data
from generate_sample_data import generate_session
from experiments.train_sessions import COLUMNS, load_sessions


class SessionTests(unittest.TestCase):
    def test_short_features_same_values_without_long_warmup(self):
        rows, _ = generate_session(123, datetime(2026, 10, 8, tzinfo=timezone.utc), "a", False, 80)
        clean, _ = validate_data(pd.DataFrame(rows))
        short = build_features(clean, windows=(60,))
        both = build_features(clean, windows=(60, 300))
        self.assertEqual(list(short.columns), list(build_features(clean).columns))
        self.assertEqual(len(short), 68)
        self.assertEqual(len(both), 20)
        pd.testing.assert_frame_equal(short.set_index("timestamp").loc[both.timestamp, COLUMNS],
                                      both.set_index("timestamp")[COLUMNS])
        prefix = build_features(clean.iloc[:70], windows=(60,))
        pd.testing.assert_series_equal(prefix.iloc[-1][COLUMNS], short.iloc[57][COLUMNS], check_names=False)

    def test_final_test_is_rejected_before_accessing_files(self):
        with self.assertRaises(ValueError):
            load_sessions(None, None, "test")


if __name__ == "__main__":
    unittest.main()
