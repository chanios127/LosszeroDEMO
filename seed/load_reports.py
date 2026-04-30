"""Load seed (gold) reports into the runtime archive directory.

Used to prepare a clean demo state for sales/PT sessions. Seed reports live
under ``seed/reports/<id>.json`` (committed) and are copied into
``storage/reports/`` (runtime, gitignored) so the ReportArchivePage shows
curated examples regardless of the LM Studio / Claude / network state.

Usage (run from repo root)::

    python seed/load_reports.py            # copy all seed reports into storage/
    python seed/load_reports.py --reset    # wipe storage/reports/ first
    python seed/load_reports.py --list     # just list seed report titles + ids

Honors ``REPORTS_DATA_DIR`` env var if set (same override the backend uses).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = REPO_ROOT / "seed" / "reports"


def _storage_dir() -> Path:
    raw = os.environ.get("REPORTS_DATA_DIR", "").strip()
    target = Path(raw) if raw else (REPO_ROOT / "storage" / "reports")
    target.mkdir(parents=True, exist_ok=True)
    return target


def _list_seed_files() -> list[Path]:
    if not SEED_DIR.exists():
        return []
    return sorted(p for p in SEED_DIR.glob("*.json") if p.is_file())


def cmd_list() -> int:
    files = _list_seed_files()
    if not files:
        print(f"(no seed reports found under {SEED_DIR})")
        return 0
    print(f"Seed reports under {SEED_DIR}:")
    for p in files:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            print(
                f"  {p.name}  id={data.get('id', '?')}  "
                f"domain={data.get('domain', '?')}  title={data.get('title', '?')}"
            )
        except (OSError, json.JSONDecodeError) as e:
            print(f"  {p.name}  [ERROR: {e}]", file=sys.stderr)
    return 0


def cmd_load(reset: bool) -> int:
    files = _list_seed_files()
    if not files:
        print(f"(no seed reports under {SEED_DIR}; nothing to load)")
        return 0
    storage = _storage_dir()
    if reset:
        for p in storage.glob("*.json"):
            p.unlink()
        print(f"reset: cleared {storage}")
    copied = 0
    for src in files:
        dst = storage / src.name
        shutil.copy2(src, dst)
        copied += 1
    print(f"loaded {copied} seed report(s) into {storage}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Wipe storage/reports/*.json before copying.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List seed reports without copying.",
    )
    args = parser.parse_args(argv)
    if args.list:
        return cmd_list()
    return cmd_load(reset=args.reset)


if __name__ == "__main__":
    sys.exit(main())
