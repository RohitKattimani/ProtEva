import tempfile
import unittest
from pathlib import Path

from bioemu_worker.worker import (
    JobValidationError,
    MAX_SAMPLE_COUNT,
    retained_sample_count,
    validate_sample_count,
    validate_sequence,
)


class WorkerValidationTests(unittest.TestCase):
    def test_accepts_canonical_sequence(self):
        self.assertEqual(validate_sequence(" gydpetgtwg "), "GYDPETGTWG")

    def test_rejects_noncanonical_sequence(self):
        with self.assertRaises(JobValidationError):
            validate_sequence("GYDPETGTWX")

    def test_bounds_sample_count(self):
        self.assertEqual(validate_sample_count(10), 10)
        with self.assertRaises(JobValidationError):
            validate_sample_count(0)
        with self.assertRaises(JobValidationError):
            validate_sample_count(MAX_SAMPLE_COUNT + 1)

    def test_reports_missing_structural_artifacts(self):
        with tempfile.TemporaryDirectory() as temporary:
            count, error = retained_sample_count(Path(temporary))
        self.assertIsNone(count)
        self.assertIn("no .xtc/.pdb structural artifact pair", error)


if __name__ == "__main__":
    unittest.main()
