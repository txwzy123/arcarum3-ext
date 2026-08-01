#!/usr/bin/env python3
"""
Scan one or more HAR files and rank entries that look like map/sandbox JSON APIs.

Usage:
  python tools/analyze_har.py captures/01_enter_map.har
  python tools/analyze_har.py captures/
  python tools/analyze_har.py captures/ --top 20 --min-score 8
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


# Keywords that often appear in map / explore / stage payloads or URLs
KW = re.compile(
    r"map|stage|field|area|tile|cell|node|grid|maze|sandbox|explore|"
    r"position|coord|width|height|floor|layer|room|path|route|dungeon|"
    r"quest|event|panel|block|obstacle|fog|visit|move|walk|hex|board|"
    r"reincarn|samsara|tensei|sandbox|islands?|matrix|matrix_data|"
    r"x_pos|y_pos|pos_x|pos_y|map_id|stage_id|area_id",
    re.I,
)

STATIC_EXT = re.compile(
    r"\.(js|css|png|jpe?g|gif|webp|svg|woff2?|ttf|mp3|mp4|m4a|ogg|wasm|map)(\?|$)",
    re.I,
)

SKIP_HOST_PARTS = ("google", "facebook", "twitter", "analytics", "sentry", "hotjar")


def load_har(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    return data.get("log", {}).get("entries", [])


def get_text(content: dict[str, Any]) -> str:
    text = content.get("text")
    if text is None:
        return ""
    if content.get("encoding") == "base64":
        import base64

        try:
            return base64.b64decode(text).decode("utf-8", errors="replace")
        except Exception:
            return ""
    return text if isinstance(text, str) else ""


def try_json(text: str) -> Any | None:
    text = text.strip()
    if not text or text[0] not in "{[":
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def walk(obj: Any, depth: int = 0, max_depth: int = 8):
    if depth > max_depth:
        return
    yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from walk(v, depth + 1, max_depth)
    elif isinstance(obj, list):
        for v in obj[:200]:
            yield from walk(v, depth + 1, max_depth)


def looks_like_xy(d: dict) -> bool:
    keys = {str(k).lower() for k in d.keys()}
    pairs = [
        {"x", "y"},
        {"pos_x", "pos_y"},
        {"posx", "posy"},
        {"col", "row"},
        {"i", "j"},
        {"cx", "cy"},
    ]
    return any(p.issubset(keys) for p in pairs)


def score_json(obj: Any) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    if obj is None:
        return 0, reasons

    # Flatten sample for keyword hits
    try:
        blob = json.dumps(obj, ensure_ascii=False)[:200_000]
    except Exception:
        blob = str(obj)[:200_000]

    kw_hits = KW.findall(blob)
    if kw_hits:
        c = Counter(k.lower() for k in kw_hits)
        top = sum(1 for _, n in c.most_common(12))
        add = min(18, 2 + top + min(8, len(kw_hits) // 20))
        score += add
        reasons.append(f"keywords(+{add}): {', '.join(f'{k}×{n}' for k, n in c.most_common(6))}")

    # Structural signals
    grid_hits = 0
    xy_hits = 0
    list_of_dicts = 0
    wh = 0

    for node in walk(obj):
        if isinstance(node, list) and node:
            # 2D array of numbers / short lists
            if all(isinstance(row, list) for row in node[:30]):
                rows = node[:30]
                if rows and all(
                    all(isinstance(c, (int, float, str, type(None))) for c in row[:80])
                    for row in rows
                ):
                    h = len(node)
                    w = max((len(r) for r in rows), default=0)
                    if h >= 3 and w >= 3:
                        grid_hits += 1
                        score += 12
                        reasons.append(f"2d-grid(~{h}x{w})(+12)")
            # list of dicts with x,y
            dicts = [x for x in node[:100] if isinstance(x, dict)]
            if len(dicts) >= 8:
                list_of_dicts += 1
                xy_n = sum(1 for d in dicts if looks_like_xy(d))
                if xy_n >= max(4, len(dicts) // 3):
                    xy_hits += 1
                    add = 14
                    score += add
                    reasons.append(f"list-of-xy({xy_n}/{len(dicts)})(+{add})")
                else:
                    # uniform keys → table-like
                    keysets = [tuple(sorted(map(str, d.keys()))) for d in dicts[:40]]
                    if keysets and keysets.count(keysets[0]) >= max(6, len(keysets) * 0.7):
                        score += 6
                        reasons.append(f"uniform-rows({len(dicts)})(+6)")

        if isinstance(node, dict):
            keys = {str(k).lower() for k in node.keys()}
            if {"width", "height"}.issubset(keys) or {"w", "h"}.issubset(keys):
                wh += 1
            if looks_like_xy(node):
                xy_hits += 1

    if wh:
        score += min(8, wh * 3)
        reasons.append(f"width/height(+{min(8, wh * 3)})")
    if xy_hits >= 5 and "list-of-xy" not in " ".join(reasons):
        score += 6
        reasons.append(f"many-xy-objects({xy_hits})(+6)")

    # Prefer medium-large structured JSON
    size = len(blob)
    if 800 <= size <= 2_000_000:
        score += 3
        reasons.append(f"size({size})(+3)")
    elif size > 2_000_000:
        score -= 5
        reasons.append("huge-payload(-5)")

    return score, reasons


def score_entry(entry: dict[str, Any], source: str) -> dict[str, Any] | None:
    req = entry.get("request", {})
    res = entry.get("response", {})
    url = req.get("url") or ""
    method = (req.get("method") or "GET").upper()
    status = res.get("status") or 0
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path or ""

    if any(s in host for s in SKIP_HOST_PARTS):
        return None
    if STATIC_EXT.search(path):
        return None
    if status and status >= 400:
        return None

    content = res.get("content") or {}
    mime = (content.get("mimeType") or "").lower()
    text = get_text(content)
    if not text:
        return None

    # Skip obvious non-API
    if "javascript" in mime and not text.strip()[:1] in "{[":
        return None
    if mime.startswith("image/") or "css" in mime or "font" in mime:
        return None

    obj = try_json(text)
    url_score = 0
    url_reasons: list[str] = []
    if KW.search(url):
        url_score += 8
        url_reasons.append("url-keyword(+8)")
    if "/rest/" in path or path.endswith(".json") or "ajax" in path:
        url_score += 4
        url_reasons.append("api-ish-path(+4)")
    if "granbluefantasy" in host or "mobage" in host or "cygames" in host:
        url_score += 6
        url_reasons.append("gbf-host(+6)")

    body_score, body_reasons = score_json(obj) if obj is not None else (0, ["not-json"])
    if obj is None:
        # HTML or other — only keep if URL screams map
        if url_score < 10:
            return None
        body_score = 0

    total = url_score + body_score
    if total < 1:
        return None

    return {
        "score": total,
        "source": source,
        "method": method,
        "status": status,
        "url": url,
        "host": host,
        "path": path,
        "mime": mime,
        "size": content.get("size") or len(text),
        "reasons": url_reasons + body_reasons,
        "json": obj,
        "text_preview": text[:400].replace("\n", " "),
    }


def iter_har_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    return sorted(target.rglob("*.har"))


def safe_name(url: str, idx: int) -> str:
    p = urlparse(url).path.strip("/").replace("/", "_")
    p = re.sub(r"[^a-zA-Z0-9_.-]+", "_", p)[:80] or "entry"
    return f"{idx:03d}_{p}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Rank map-like API entries in HAR files")
    ap.add_argument("target", type=Path, help="HAR file or directory")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--min-score", type=int, default=6)
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Directory to dump candidate JSON (default: ./out)",
    )
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    out_dir = args.out or (root / "out")
    out_dir.mkdir(parents=True, exist_ok=True)

    files = iter_har_files(args.target)
    if not files:
        print(f"No HAR files under {args.target}", file=sys.stderr)
        return 1

    results: list[dict[str, Any]] = []
    for fp in files:
        try:
            entries = load_har(fp)
        except Exception as e:
            print(f"[skip] {fp}: {e}", file=sys.stderr)
            continue
        for e in entries:
            hit = score_entry(e, source=str(fp.name))
            if hit and hit["score"] >= args.min_score:
                results.append(hit)

    results.sort(key=lambda x: (-x["score"], -x["size"]))

    # Dedup by method+path (keep best)
    seen: dict[str, dict[str, Any]] = {}
    for r in results:
        key = f"{r['method']} {r['path']}"
        if key not in seen or r["score"] > seen[key]["score"]:
            seen[key] = r
    ranked = sorted(seen.values(), key=lambda x: (-x["score"], -x["size"]))[: args.top]

    print(f"Scanned {len(files)} HAR(s), {len(results)} raw hits, showing top {len(ranked)}\n")
    for i, r in enumerate(ranked, 1):
        print(f"#{i}  score={r['score']}  {r['method']} {r['status']}  [{r['source']}]")
        print(f"    {r['url'][:160]}")
        print(f"    size={r['size']}  mime={r['mime']}")
        print(f"    reasons: {'; '.join(r['reasons'][:8])}")
        dump_name = safe_name(r["url"], i)
        dump_path = out_dir / f"{dump_name}.json"
        payload = r["json"] if r["json"] is not None else {"_raw_preview": r["text_preview"]}
        meta = {
            "_meta": {
                "score": r["score"],
                "url": r["url"],
                "method": r["method"],
                "source_har": r["source"],
                "reasons": r["reasons"],
            },
            "data": payload,
        }
        with dump_path.open("w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f"    dumped: {dump_path}")
        print()

    summary = out_dir / "ranking.json"
    with summary.open("w", encoding="utf-8") as f:
        json.dump(
            [
                {
                    "score": r["score"],
                    "method": r["method"],
                    "url": r["url"],
                    "path": r["path"],
                    "source": r["source"],
                    "reasons": r["reasons"],
                    "size": r["size"],
                }
                for r in ranked
            ],
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"Summary: {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
