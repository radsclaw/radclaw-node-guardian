import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

from node_guardian.probe import build_reports, write_public_status


class ProbeReportTests(unittest.TestCase):
    def healthy_fixture(self):
        return (
            {
                "id": "02secret-node-id",
                "alias": "Private Alias",
                "network": "bitcoin",
                "version": "v26.06.1",
                "blockheight": 910000,
                "address": [{"address": "hidden.example"}],
                "msatoshi_fees_collected": 123456,
                "warning_bitcoind_sync": None,
                "arbitrary_secret": "DO-NOT-LEAK",
            },
            {
                "channels": [
                    {
                        "peer_id": "03secret-peer-id",
                        "state": "CHANNELD_NORMAL",
                        "connected": True,
                        "receivable_msat": {"msat": 125000000},
                        "spendable_msat": {"msat": 250000000},
                        "total_msat": {"msat": 400000000},
                        "htlcs": [],
                        "private": True,
                    }
                ]
            },
        )

    def test_public_report_is_a_strict_allowlist(self):
        getinfo, channels = self.healthy_fixture()
        public, private = build_reports(getinfo, channels, generated_at="2026-07-11T12:00:00Z")

        self.assertEqual(
            set(public),
            {"schema_version", "service", "generated_at", "status", "network", "version", "block_height", "normal_channels", "receive_ready"},
        )
        self.assertEqual(public["status"], "ok")
        self.assertEqual(public["normal_channels"], 1)
        self.assertTrue(public["receive_ready"])
        self.assertEqual(private["node_id"], "02secret-node-id")

    def test_public_json_cannot_leak_sensitive_fixture_values(self):
        getinfo, channels = self.healthy_fixture()
        public, _ = build_reports(getinfo, channels, generated_at="2026-07-11T12:00:00Z")
        encoded = json.dumps(public)
        for forbidden in [
            "02secret-node-id",
            "03secret-peer-id",
            "Private Alias",
            "hidden.example",
            "DO-NOT-LEAK",
            "123456",
            "250000000",
            "400000000",
        ]:
            self.assertNotIn(forbidden, encoded)

    def test_no_normal_channel_is_degraded_and_not_receive_ready(self):
        getinfo, channels = self.healthy_fixture()
        channels["channels"][0]["state"] = "CHANNELD_AWAITING_LOCKIN"
        public, private = build_reports(getinfo, channels, generated_at="2026-07-11T12:00:00Z")
        self.assertEqual(public["status"], "degraded")
        self.assertFalse(public["receive_ready"])
        self.assertIn("no_normal_channels", private["findings"])

    def test_sync_warning_is_degraded(self):
        getinfo, channels = self.healthy_fixture()
        getinfo["warning_bitcoind_sync"] = "Bitcoin backend is still syncing"
        public, private = build_reports(getinfo, channels, generated_at="2026-07-11T12:00:00Z")
        self.assertEqual(public["status"], "degraded")
        self.assertIn("bitcoin_backend_syncing", private["findings"])

    def test_write_public_status_is_atomic_and_private(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = pathlib.Path(tmp) / "runtime" / "status.json"
            write_public_status(target, {"status": "ok"})
            self.assertEqual(json.loads(target.read_text()), {"status": "ok"})
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(target.parent.glob("*.tmp")))


if __name__ == "__main__":
    unittest.main()
