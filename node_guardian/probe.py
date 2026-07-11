#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import pathlib
import re
import subprocess
from typing import Any, Dict, Tuple

SCHEMA_VERSION = 1
ALLOWED_NETWORKS = {"bitcoin", "testnet", "regtest", "signet"}
DEFAULT_CLI = "/opt/homebrew/bin/lightning-cli"
DEFAULT_LIGHTNING_DIR = "/Users/radclaw/Library/Application Support/RadclawNode/core-lightning-data"
DEFAULT_RPC_FILE = "/Users/radclaw/Library/Application Support/RadclawNode/lightning-rpc"


def _msat(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, dict) and isinstance(value.get("msat"), int):
        return value["msat"]
    return 0


def _safe_version(value: Any) -> str:
    text = str(value or "unknown")[:64]
    return text if re.fullmatch(r"[A-Za-z0-9._+\-]+", text) else "unknown"


def build_reports(
    getinfo: Dict[str, Any],
    peerchannels: Dict[str, Any],
    generated_at: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    channels = peerchannels.get("channels")
    if not isinstance(channels, list):
        channels = []

    normal = [channel for channel in channels if channel.get("state") == "CHANNELD_NORMAL"]
    findings = []
    if getinfo.get("warning_bitcoind_sync"):
        findings.append("bitcoin_backend_syncing")
    if getinfo.get("warning_lightningd_sync"):
        findings.append("lightning_graph_syncing")
    if not normal:
        findings.append("no_normal_channels")

    receive_ready = any(
        channel.get("connected") is not False and _msat(channel.get("receivable_msat")) > 0
        for channel in normal
    )
    if normal and not receive_ready:
        findings.append("no_direct_receive_capacity")

    network_value = getinfo.get("network")
    network = network_value if network_value in ALLOWED_NETWORKS else "unknown"
    block_height_value = getinfo.get("blockheight")
    block_height = block_height_value if isinstance(block_height_value, int) and block_height_value >= 0 else None

    public = {
        "schema_version": SCHEMA_VERSION,
        "service": "Radclaw Node Guardian",
        "generated_at": generated_at,
        "status": "ok" if not findings else "degraded",
        "network": network,
        "version": _safe_version(getinfo.get("version")),
        "block_height": block_height,
        "normal_channels": len(normal),
        "receive_ready": receive_ready,
    }
    private = {
        "generated_at": generated_at,
        "status": public["status"],
        "node_id": getinfo.get("id"),
        "network": network,
        "version": public["version"],
        "block_height": block_height,
        "channel_count": len(channels),
        "normal_channel_count": len(normal),
        "total_receivable_msat": sum(_msat(channel.get("receivable_msat")) for channel in normal),
        "total_spendable_msat": sum(_msat(channel.get("spendable_msat")) for channel in normal),
        "active_htlc_count": sum(len(channel.get("htlcs") or []) for channel in channels),
        "findings": findings,
    }
    return public, private


def write_public_status(path: pathlib.Path, report: Dict[str, Any]) -> None:
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(report, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _rpc(cli: str, lightning_dir: str, rpc_file: str, command: str) -> Dict[str, Any]:
    completed = subprocess.run(
        [cli, f"--lightning-dir={lightning_dir}", f"--rpc-file={rpc_file}", command],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise ValueError(f"{command} did not return a JSON object")
    return value


def collect_live(cli: str, lightning_dir: str, rpc_file: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    return _rpc(cli, lightning_dir, rpc_file, "getinfo"), _rpc(cli, lightning_dir, rpc_file, "listpeerchannels")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a redacted public Core Lightning status report")
    parser.add_argument("--output", required=True)
    parser.add_argument("--private-output")
    parser.add_argument("--lightning-cli", default=DEFAULT_CLI)
    parser.add_argument("--lightning-dir", default=DEFAULT_LIGHTNING_DIR)
    parser.add_argument("--rpc-file", default=DEFAULT_RPC_FILE)
    args = parser.parse_args()

    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    getinfo, channels = collect_live(args.lightning_cli, args.lightning_dir, args.rpc_file)
    public, private = build_reports(getinfo, channels, generated_at)
    write_public_status(pathlib.Path(args.output), public)
    if args.private_output:
        write_public_status(pathlib.Path(args.private_output), private)
    print(json.dumps(public, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
