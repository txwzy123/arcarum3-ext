#!/usr/bin/env python3
"""
Compare two HAR captures to separate static map APIs from mutable state APIs.

Usage:
  # APIs present in both (stable map candidates)
  python tools/diff_har.py captures/01_enter.har captures/02_refresh.har

  # APIs whose JSON body changed a lot (state candidates)
  python tools/diff_har.py captures/01_enter.har captures/03_move.har --mode state
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

# Reuse helpers from analyze_har
sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze_har import get_text, load_har, try_json  # noqa: E402


def entry_key(entry: dict[str, Any]) -> str:
    req = entry.get("request", {})
    method = (req.get("method") or "GET").upper()
    path = urlparse(req.get("url") or "").path
    return f"{method} {path}"


def body_fingerprint(entry: dict[str, Any]) -> str:
    content = (entry.get("response") or {}).get("content") or {}
    text = get_text(content)
    obj = try_json(text)
    if obj is not None:
        # stable dump
        raw = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    else:
        raw = text
    return hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest()[:16]


def index_har(path: Path) -> dict[str, list[dict[str, Any]]]:
    idx: dict[str, list[dict[str, Any]]] = {}
    for e in load_har(path):
        k = entry_key(e)
        idx.setdefault(k, []).append(e)
    return idx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("har_a", type=Path)
    ap.add_argument("har_b", type=Path)
    ap.add_argument(
        "--mode",
        choices=("stable", "state", "only-a", "only-b"),
        default="stable",
        help="stable=same path both sides; state=same path but body hash differs",
    )
    args = ap.parse_args()

    a = index_har(args.har_a)
    b = index_har(args.har_b)
    keys_a, keys_b = set(a), set(b)

    if args.mode == "only-a":
        keys = sorted(keys_a - keys_b)
        print(f"Only in {args.har_a.name}: {len(keys)}")
        for k in keys:
            print(" ", k)
        return 0
    if args.mode == "only-b":
        keys = sorted(keys_b - keys_a)
        print(f"Only in {args.har_b.name}: {len(keys)}")
        for k in keys:
            print(" ", k)
        return 0

    both = sorted(keys_a & keys_b)
    if args.mode == "stable":
        print(f"In BOTH captures ({args.har_a.name} ∩ {args.har_b.name}): {len(both)}")
        print("(Prefer JSON APIs that also score high in analyze_har.py)\n")
        for k in both:
            fa = body_fingerprint(a[k][0])
            fb = body_fingerprint(b[k][0])
            same = "SAME_BODY" if fa == fb else "BODY_DIFF"
            print(f"  [{same}] {k}")
        return 0

    # state mode
    print(f"Same path, different body ({args.har_a.name} vs {args.har_b.name}):\n")
    n = 0
    for k in both:
        fa = body_fingerprint(a[k][0])
        fb = body_fingerprint(b[k][0])
        if fa != fb:
            n += 1
            print(f"  {k}  {fa} -> {fb}")
    print(f"\nTotal state-like: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
