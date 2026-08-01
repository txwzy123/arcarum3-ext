#!/usr/bin/env python3
"""
Pathfinding for Arcarum3 (转世) dungeon maps.

Map model: undirected graph of nodes with explicit adjacency lists
from `option.dungeon.node_list` (not a grid).

Usage:
  # From HAR dump (analyze_har output) or map_graph.json
  python tools/pathfind.py out/001_arcarum3_dungeon_content_index_0.json
  python tools/pathfind.py out/map_graph.json --goal-type treasure
  python tools/pathfind.py out/map_graph.json --start 2 --goal 48
  python tools/pathfind.py out/map_graph.json --goal-type shop,healing --nearest
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path
from typing import Any

# node_type from option.dungeon.node_icon_info (+ type 0 = empty path node)
NODE_TYPE_NAMES: dict[int, str] = {
    0: "Empty",
    1: "Boss",
    2: "Battle",
    3: "Strong Foe",
    4: "Ruler",
    5: "Event",
    6: "Treasure Chest",
    7: "Healing",
    8: "Shop",
    9: "Teleporter",
    10: "Special",  # cultist / founder / portal / etc (see special_incident_id)
    11: "Terrifying Foe",
}

# friendly aliases for CLI --goal-type
TYPE_ALIASES: dict[str, int] = {
    "empty": 0,
    "boss": 1,
    "battle": 2,
    "strong": 3,
    "strong_foe": 3,
    "ruler": 4,
    "event": 5,
    "treasure": 6,
    "chest": 6,
    "healing": 7,
    "heal": 7,
    "shop": 8,
    "teleporter": 9,
    "portal": 9,
    "special": 10,
    "terrifying": 11,
    "terrifying_foe": 11,
}


def load_raw(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def extract_dungeon(raw: Any) -> dict[str, Any]:
    """Accept analyze_har dump, content/index response, or map_graph.json."""
    if isinstance(raw, dict) and "nodes" in raw and "node_count" in raw:
        # already map_graph.json
        return {
            "_from_graph": True,
            "current_node_id": None,
            "name": raw.get("meta", {}).get("name"),
            "map_id": raw.get("meta", {}).get("map_id"),
            "node_list": [
                {
                    "node_id": n["id"],
                    "position_x": n["x"],
                    "position_y": n["y"],
                    "node_type": n["type"],
                    "adjacent_node_ids": n["adj"],
                    "is_visited": n.get("visited", False),
                    "is_shrinking": n.get("shrinking", False),
                    "is_quest_check": n.get("quest_check", False),
                    "special_incident_id": n.get("special_incident_id"),
                }
                for n in raw["nodes"]
            ],
            "node_icon_info": raw.get("icons") or [],
            **(raw.get("meta") or {}),
        }

    # unwrap analyze_har meta wrapper
    if isinstance(raw, dict) and "data" in raw and "_meta" in raw:
        raw = raw["data"]

    if isinstance(raw, dict) and "option" in raw:
        dungeon = raw["option"].get("dungeon")
        if isinstance(dungeon, dict) and "node_list" in dungeon:
            return dungeon

    if isinstance(raw, dict) and "data" in raw and isinstance(raw["data"], dict):
        opt = raw["data"].get("option") or {}
        dungeon = opt.get("dungeon")
        if isinstance(dungeon, dict) and "node_list" in dungeon:
            return dungeon

    if isinstance(raw, dict) and "node_list" in raw:
        return raw

    raise SystemExit(
        "Cannot find option.dungeon.node_list in this JSON.\n"
        "Pass the content/index dump or out/map_graph.json."
    )


def build_graph(dungeon: dict[str, Any]) -> dict[int, dict[str, Any]]:
    nodes: dict[int, dict[str, Any]] = {}
    for n in dungeon["node_list"]:
        nid = int(n["node_id"])
        nodes[nid] = {
            "id": nid,
            "x": int(n["position_x"]),
            "y": int(n["position_y"]),
            "type": int(n["node_type"]),
            "adj": [int(a) for a in (n.get("adjacent_node_ids") or [])],
            "visited": bool(n.get("is_visited")),
            "shrinking": bool(n.get("is_shrinking")),
            "quest_check": bool(n.get("is_quest_check")),
            "special": n.get("special_incident_id"),
        }
    return nodes


def node_label(n: dict[str, Any]) -> str:
    tname = NODE_TYPE_NAMES.get(n["type"], f"type{n['type']}")
    extra = f" special={n['special']}" if n.get("special") is not None else ""
    flags = []
    if n.get("visited"):
        flags.append("visited")
    if n.get("shrinking"):
        flags.append("shrinking")
    flag_s = f" [{','.join(flags)}]" if flags else ""
    return f"#{n['id']} {tname}{extra}{flag_s} @({n['x']},{n['y']})"


def bfs_path(
    nodes: dict[int, dict[str, Any]],
    start: int,
    goal: int,
    *,
    avoid_types: set[int] | None = None,
    allow_goal_avoided: bool = True,
) -> list[int] | None:
    """Shortest path by hop count on adjacency graph."""
    if start not in nodes or goal not in nodes:
        return None
    avoid_types = avoid_types or set()
    q = deque([start])
    prev: dict[int, int | None] = {start: None}
    while q:
        cur = q.popleft()
        if cur == goal:
            break
        for nxt in nodes[cur]["adj"]:
            if nxt not in nodes or nxt in prev:
                continue
            if nodes[nxt]["type"] in avoid_types and not (
                allow_goal_avoided and nxt == goal
            ):
                continue
            prev[nxt] = cur
            q.append(nxt)
    if goal not in prev:
        return None
    path: list[int] = []
    c: int | None = goal
    while c is not None:
        path.append(c)
        c = prev[c]
    path.reverse()
    return path


def nearest_of_types(
    nodes: dict[int, dict[str, Any]],
    start: int,
    types: set[int],
    *,
    avoid_types: set[int] | None = None,
) -> tuple[list[int] | None, int | None]:
    """BFS until first node matching any of types."""
    if start not in nodes:
        return None, None
    avoid_types = avoid_types or set()
    q = deque([start])
    prev: dict[int, int | None] = {start: None}
    found: int | None = None
    while q:
        cur = q.popleft()
        if cur != start and nodes[cur]["type"] in types:
            found = cur
            break
        for nxt in nodes[cur]["adj"]:
            if nxt not in nodes or nxt in prev:
                continue
            if nodes[nxt]["type"] in avoid_types and nodes[nxt]["type"] not in types:
                continue
            prev[nxt] = cur
            q.append(nxt)
    if found is None:
        return None, None
    path: list[int] = []
    c: int | None = found
    while c is not None:
        path.append(c)
        c = prev[c]
    path.reverse()
    return path, found


def parse_types(s: str) -> set[int]:
    out: set[int] = set()
    for part in s.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if part.isdigit():
            out.add(int(part))
        elif part in TYPE_ALIASES:
            out.add(TYPE_ALIASES[part])
        else:
            raise SystemExit(
                f"Unknown type {part!r}. Use id or one of: {', '.join(TYPE_ALIASES)}"
            )
    return out


def summarize(nodes: dict[int, dict[str, Any]], dungeon: dict[str, Any]) -> None:
    from collections import Counter

    c = Counter(n["type"] for n in nodes.values())
    print(f"map: {dungeon.get('name')!r}  map_id={dungeon.get('map_id')}")
    print(f"current_node_id={dungeon.get('current_node_id')}  nodes={len(nodes)}")
    print("type counts:")
    for t, n in sorted(c.items()):
        print(f"  {t:2d} {NODE_TYPE_NAMES.get(t, '?'):18s}  x{n}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Arcarum3 dungeon pathfinding")
    ap.add_argument("map_json", type=Path, help="content/index dump or map_graph.json")
    ap.add_argument("--start", type=int, default=None, help="start node_id (default: current)")
    ap.add_argument("--goal", type=int, default=None, help="goal node_id")
    ap.add_argument(
        "--goal-type",
        default=None,
        help="target type name/id, comma-separated (treasure,shop,healing,boss,...)",
    )
    ap.add_argument(
        "--nearest",
        action="store_true",
        help="with --goal-type, go to nearest matching node",
    )
    ap.add_argument(
        "--avoid-type",
        default=None,
        help="types to avoid as intermediate nodes (e.g. battle,strong)",
    )
    ap.add_argument("--list-types", action="store_true", help="print type legend & exit")
    ap.add_argument("--summary", action="store_true", help="print map summary")
    args = ap.parse_args()

    if args.list_types:
        for i, name in NODE_TYPE_NAMES.items():
            print(f"{i:2d}  {name}")
        return 0

    raw = load_raw(args.map_json)
    dungeon = extract_dungeon(raw)
    nodes = build_graph(dungeon)

    if args.summary or (args.goal is None and args.goal_type is None):
        summarize(nodes, dungeon)
        if args.goal is None and args.goal_type is None:
            print("\nTip: --goal <id>  or  --goal-type treasure --nearest")
            return 0

    start = args.start
    if start is None:
        start = dungeon.get("current_node_id")
    if start is None:
        raise SystemExit("No --start and no current_node_id in map")
    start = int(start)
    if start not in nodes:
        raise SystemExit(f"start node {start} not in map")

    avoid = parse_types(args.avoid_type) if args.avoid_type else set()

    if args.goal_type:
        types = parse_types(args.goal_type)
        if args.nearest or args.goal is None:
            path, found = nearest_of_types(nodes, start, types, avoid_types=avoid)
            if not path or found is None:
                print(f"No reachable node of types {sorted(types)} from #{start}")
                return 2
            print(f"start: {node_label(nodes[start])}")
            print(f"goal:  {node_label(nodes[found])}  (nearest of {sorted(types)})")
            print(f"hops:  {len(path) - 1}")
            print("path:  " + " -> ".join(str(i) for i in path))
            print("detail:")
            for i in path:
                print(f"  {node_label(nodes[i])}")
            return 0

    if args.goal is None:
        raise SystemExit("Need --goal or --goal-type")

    goal = int(args.goal)
    path = bfs_path(nodes, start, goal, avoid_types=avoid)
    print(f"start: {node_label(nodes[start])}")
    print(f"goal:  {node_label(nodes[goal])}")
    if not path:
        print("No path")
        return 2
    print(f"hops:  {len(path) - 1}")
    print("path:  " + " -> ".join(str(i) for i in path))
    print("detail:")
    for i in path:
        print(f"  {node_label(nodes[i])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
