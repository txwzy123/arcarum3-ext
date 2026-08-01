#!/usr/bin/env python3
"""
Arcarum3 dungeon map viewer window.

Pre-renders the full map once (no live zoom — keeps it smooth), then
scroll/pan only. Connection lines go node-center to node-center like the game.

Usage:
  py tools/map_viewer.py
  py tools/map_viewer.py out/001_arcarum3_dungeon_content_index_0.json
"""

from __future__ import annotations

import argparse
import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk
from typing import Any

from PIL import Image, ImageDraw, ImageTk

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICON_DIR = ASSETS / "assets" / "node_icon"
if not ICON_DIR.exists():
    ICON_DIR = ASSETS / "node_icon"
MAP_BG = ASSETS / "assets" / "map_bg" / "1.jpg"
if not MAP_BG.exists():
    MAP_BG = ASSETS / "map_bg" / "1.jpg"
DUNGEON_DIR = ASSETS / "dungeon"

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
    10: "Special",
    11: "Terrifying Foe",
}

# special_incident_id -> icon stem
SPECIAL_ICON: dict[int, str] = {
    1: "10_incident",
    2: "10_incident",
    3: "10_incident",
    4: "10_incident",
    5: "10_teleport",
    6: "10_teleport",
    7: "10_teleport",
    8: "10_research",
    9: "10_incident",
    10: "10_incident",
    11: "10_incident",
    12: "10_incident",
    13: "10_incident",
    14: "10_incident",
    15: "10_incident",
    16: "10_incident",
    17: "10_incident",
    18: "10_incident",
}
for _k, _prefer in ((1, "10_guru"), (2, "10_fanatic"), (3, "10_fanatic"), (5, "10_teleport_glow")):
    if (ICON_DIR / f"{_prefer}.png").exists():
        SPECIAL_ICON[_k] = _prefer

# Game constants (client_constants.typed.js)
NODE_SIZE = 90  # MAP_NODE_IMAGE_SIZE
# Line attaches to node image center
LINE_OFFSET_X = 44  # NODE_CONNECT_LINE_OFFSET.X
LINE_OFFSET_Y = 44  # same for Y (node is square)

# Fixed render scale: bake once, never re-scale on interaction
# 2680x1830 @ 0.55 ≈ 1474x1006 — fits most screens while staying sharp enough
RENDER_SCALE = 0.55

# Line look (game uses beige path lines; thicker for readability)
LINE_COLOR = (201, 184, 150, 255)       # normal edges
LINE_COLOR_ADJ = (126, 200, 255, 255)   # edges from current node
LINE_WIDTH = 8                          # map-space px before scale
LINE_WIDTH_ADJ = 10


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_dungeon(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(raw, dict) and "nodes" in raw and "node_count" in raw:
        meta = raw.get("meta") or {}
        return {
            "name": meta.get("name", "map"),
            "map_id": meta.get("map_id"),
            "current_node_id": meta.get("current_node_id"),
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
        }

    if isinstance(raw, dict) and "data" in raw and "_meta" in raw:
        raw = raw["data"]
    if isinstance(raw, dict) and "option" in raw:
        return raw["option"]["dungeon"]
    if isinstance(raw, dict) and "data" in raw and isinstance(raw["data"], dict):
        return raw["data"]["option"]["dungeon"]
    if isinstance(raw, dict) and "node_list" in raw:
        return raw
    raise SystemExit(f"Cannot parse dungeon map from {path}")


def icon_stem(node_type: int, special_id: Any) -> str | None:
    if node_type == 0:
        return None
    if node_type == 10:
        if special_id is None:
            return "10_incident"
        try:
            return SPECIAL_ICON.get(int(special_id), "10_incident")
        except (TypeError, ValueError):
            return "10_incident"
    return str(node_type)


def open_rgba(path: Path) -> Image.Image | None:
    if not path.exists():
        return None
    return Image.open(path).convert("RGBA")


def node_center(n: dict[str, Any]) -> tuple[float, float]:
    """Game-space center where connection lines meet (matches web client)."""
    return (
        float(n["position_x"]) + LINE_OFFSET_X,
        float(n["position_y"]) + LINE_OFFSET_Y,
    )


# ---------------------------------------------------------------------------
# One-shot render
# ---------------------------------------------------------------------------

def render_map_image(
    dungeon: dict[str, Any],
    *,
    scale: float = RENDER_SCALE,
    show_empty: bool = True,
    show_ids: bool = False,
) -> tuple[Image.Image, dict[int, tuple[int, int, int, int]]]:
    """
    Bake full map to a single RGBA image.
    Returns (image, hitboxes) where hitboxes[id] = (x0,y0,x1,y1) in image pixels.
    """
    nodes = {int(n["node_id"]): n for n in dungeon.get("node_list") or []}
    current_id = dungeon.get("current_node_id")
    try:
        current_id = int(current_id) if current_id is not None else None
    except (TypeError, ValueError):
        current_id = None

    bg = open_rgba(MAP_BG)
    if bg is None:
        bg = Image.new("RGBA", (2680, 1830), (30, 28, 40, 255))
    else:
        bg = bg.convert("RGBA")

    w, h = bg.size
    # work at full map resolution, then downscale once at end
    layer = bg.copy()
    draw = ImageDraw.Draw(layer, "RGBA")

    # --- edges: undirected, center-to-center ---
    drawn: set[tuple[int, int]] = set()
    adj_of_current: set[int] = set()
    if current_id is not None and current_id in nodes:
        adj_of_current = {int(a) for a in (nodes[current_id].get("adjacent_node_ids") or [])}

    for nid, n in nodes.items():
        for adj in n.get("adjacent_node_ids") or []:
            a = int(adj)
            if a not in nodes:
                continue
            edge = (min(nid, a), max(nid, a))
            if edge in drawn:
                continue
            drawn.add(edge)

            x1, y1 = node_center(n)
            x2, y2 = node_center(nodes[a])

            is_adj = (
                current_id is not None
                and (
                    (nid == current_id and a in adj_of_current)
                    or (a == current_id and nid in adj_of_current)
                )
            )
            color = LINE_COLOR_ADJ if is_adj else LINE_COLOR
            width = LINE_WIDTH_ADJ if is_adj else LINE_WIDTH

            # rounded caps so ends sit cleanly under node bases
            draw.line([(x1, y1), (x2, y2)], fill=color, width=width)
            r = width / 2
            draw.ellipse((x1 - r, y1 - r, x1 + r, y1 + r), fill=color)
            draw.ellipse((x2 - r, y2 - r, x2 + r, y2 + r), fill=color)

    # --- load icon cache ---
    base_img = open_rgba(ICON_DIR / "base.png")
    base_cleared = open_rgba(ICON_DIR / "base_cleared.png") or base_img
    piece_img = open_rgba(ICON_DIR / "piece_1.png")
    pointer_img = open_rgba(DUNGEON_DIR / "pointer_current_node.png")
    icon_cache: dict[str, Image.Image | None] = {}

    def get_icon(stem: str) -> Image.Image | None:
        if stem not in icon_cache:
            p = ICON_DIR / f"{stem}.png"
            icon_cache[stem] = open_rgba(p)
        return icon_cache[stem]

    hitboxes: dict[int, tuple[int, int, int, int]] = {}

    # draw empty / non-current first, current last
    order = sorted(nodes.keys(), key=lambda i: 1 if i == current_id else 0)
    for nid in order:
        n = nodes[nid]
        ntype = int(n.get("node_type") or 0)
        if ntype == 0 and not show_empty:
            continue

        px = int(n["position_x"])
        py = int(n["position_y"])
        # node image top-left is position_x/y; size 90x90
        hitboxes[nid] = (px, py, px + NODE_SIZE, py + NODE_SIZE)

        plate = base_cleared if n.get("is_visited") else base_img
        if plate is not None:
            plate_r = plate.resize((NODE_SIZE, NODE_SIZE), Image.Resampling.LANCZOS)
            layer.alpha_composite(plate_r, (px, py))

        stem = icon_stem(ntype, n.get("special_incident_id"))
        if stem is not None:
            ic = get_icon(stem)
            if ic is not None:
                ic_r = ic.resize((NODE_SIZE, NODE_SIZE), Image.Resampling.LANCZOS)
                layer.alpha_composite(ic_r, (px, py))

        if nid == current_id:
            if piece_img is not None:
                pc = piece_img.resize((NODE_SIZE, NODE_SIZE), Image.Resampling.LANCZOS)
                layer.alpha_composite(pc, (px, py))
            # green ring
            cx, cy = node_center(n)
            pad = 6
            draw.ellipse(
                (px - pad, py - pad, px + NODE_SIZE + pad, py + NODE_SIZE + pad),
                outline=(92, 255, 154, 255),
                width=4,
            )
            if pointer_img is not None:
                pw, ph = 48, 60
                ptr = pointer_img.resize((pw, ph), Image.Resampling.LANCZOS)
                layer.alpha_composite(ptr, (int(cx - pw / 2), py - ph + 10))

        if show_ids:
            # simple id label below node
            label = str(nid)
            # outline text
            tx, ty = px + NODE_SIZE // 2, py + NODE_SIZE + 2
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                draw.text((tx + dx, ty + dy), label, fill=(0, 0, 0, 200), anchor="mt")
            draw.text((tx, ty), label, fill=(255, 245, 154, 255), anchor="mt")

    # downscale once
    if scale != 1.0:
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        layer = layer.resize((nw, nh), Image.Resampling.LANCZOS)
        hitboxes = {
            i: (
                int(a * scale),
                int(b * scale),
                int(c * scale),
                int(d * scale),
            )
            for i, (a, b, c, d) in hitboxes.items()
        }

    return layer.convert("RGB"), hitboxes


# ---------------------------------------------------------------------------
# Window
# ---------------------------------------------------------------------------

class MapViewer(tk.Tk):
    def __init__(self, dungeon: dict[str, Any], map_json: Path, scale: float = RENDER_SCALE):
        super().__init__()
        self.dungeon = dungeon
        self.map_json = map_json
        self.render_scale = scale
        self.nodes = {int(n["node_id"]): n for n in dungeon.get("node_list") or []}
        self.current_id = dungeon.get("current_node_id")
        try:
            self.current_id = int(self.current_id) if self.current_id is not None else None
        except (TypeError, ValueError):
            self.current_id = None

        name = dungeon.get("name") or "Arcarum3 Map"
        self.title(f"GBF Arcarum3 Map — {name}")
        self.geometry("1280x800")
        self.minsize(800, 560)
        self.configure(bg="#1a1a22")

        self.show_ids = tk.BooleanVar(value=False)
        self.show_empty = tk.BooleanVar(value=True)
        self._photo: ImageTk.PhotoImage | None = None
        self._hitboxes: dict[int, tuple[int, int, int, int]] = {}
        self._map_w = 0
        self._map_h = 0
        self._drag: tuple[int, int] | None = None
        self._legend_photos: list[Any] = []

        self._build_ui()
        self._rebuild_image()

    def _build_ui(self) -> None:
        top = ttk.Frame(self)
        top.pack(side=tk.TOP, fill=tk.X, padx=6, pady=4)

        ttk.Label(
            top,
            text=(
                f"{self.dungeon.get('name')}  |  nodes={len(self.nodes)}  |  "
                f"current=#{self.current_id}  |  固定比例渲染（无缩放，拖拽/滚轮平移）"
            ),
        ).pack(side=tk.LEFT)

        ttk.Button(top, text="重新渲染", command=self._rebuild_image).pack(side=tk.RIGHT, padx=2)
        ttk.Checkbutton(
            top, text="显示节点ID", variable=self.show_ids, command=self._rebuild_image
        ).pack(side=tk.RIGHT, padx=6)
        ttk.Checkbutton(
            top, text="空白点", variable=self.show_empty, command=self._rebuild_image
        ).pack(side=tk.RIGHT, padx=6)

        body = ttk.Frame(self)
        body.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        canvas_frame = ttk.Frame(body)
        canvas_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.canvas = tk.Canvas(canvas_frame, bg="#0e0e14", highlightthickness=0, cursor="fleur")
        self.hbar = ttk.Scrollbar(canvas_frame, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.vbar = ttk.Scrollbar(canvas_frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=self.hbar.set, yscrollcommand=self.vbar.set)
        self.vbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.hbar.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        side = ttk.Frame(body, width=280)
        side.pack(side=tk.RIGHT, fill=tk.Y, padx=(4, 6), pady=4)
        side.pack_propagate(False)

        ttk.Label(side, text="节点详情", font=("", 11, "bold")).pack(anchor="w", pady=(0, 4))
        self.detail = tk.Text(
            side, height=16, width=34, wrap=tk.WORD,
            bg="#22222c", fg="#e8e8f0", insertbackground="#e8e8f0",
            relief=tk.FLAT, font=("Consolas", 9),
        )
        self.detail.pack(fill=tk.X)
        self.detail.insert(
            "1.0",
            "点击节点查看信息。\n\n"
            "操作：\n"
            "• 拖拽平移\n"
            "• 滚轮上下滚动\n"
            "• Shift+滚轮左右滚动\n"
            "• 无缩放（整图一次渲染，流畅）",
        )
        self.detail.configure(state=tk.DISABLED)

        ttk.Label(side, text="图例 (node_type)", font=("", 11, "bold")).pack(
            anchor="w", pady=(12, 4)
        )
        self.legend_canvas = tk.Canvas(side, height=320, bg="#1a1a22", highlightthickness=0)
        self.legend_canvas.pack(fill=tk.BOTH, expand=True)
        self._draw_legend()

        self.status = ttk.Label(self, text="就绪", anchor="w")
        self.status.pack(side=tk.BOTTOM, fill=tk.X, padx=6, pady=2)

        self.canvas.bind("<ButtonPress-1>", self._on_press)
        self.canvas.bind("<B1-Motion>", self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)
        self.canvas.bind("<Motion>", self._on_motion)
        self.canvas.bind("<MouseWheel>", self._on_wheel)
        # Linux
        self.canvas.bind("<Button-4>", lambda e: self.canvas.yview_scroll(-1, "units"))
        self.canvas.bind("<Button-5>", lambda e: self.canvas.yview_scroll(1, "units"))

    def _draw_legend(self) -> None:
        c = self.legend_canvas
        c.delete("all")
        self._legend_photos.clear()
        y = 8
        items: list[tuple[str, Path | None]] = [
            ("0 Empty (base)", ICON_DIR / "base.png"),
        ]
        for t in range(1, 12):
            if t == 10:
                items.append(("10 Special / incident", ICON_DIR / "10_incident.png"))
                items.append(("   research", ICON_DIR / "10_research.png"))
                items.append(("   teleport", ICON_DIR / "10_teleport.png"))
            else:
                items.append((f"{t} {NODE_TYPE_NAMES.get(t, '')}", ICON_DIR / f"{t}.png"))

        for label, path in items:
            if path and path.exists():
                im = Image.open(path).convert("RGBA").resize((28, 28), Image.Resampling.LANCZOS)
                photo = ImageTk.PhotoImage(im)
                self._legend_photos.append(photo)
                c.create_image(18, y + 12, image=photo)
            c.create_text(40, y + 12, text=label, fill="#ddd", anchor="w", font=("", 9))
            y += 28

    def _rebuild_image(self) -> None:
        self.status.configure(text="正在渲染地图…")
        self.update_idletasks()

        img, hitboxes = render_map_image(
            self.dungeon,
            scale=self.render_scale,
            show_empty=self.show_empty.get(),
            show_ids=self.show_ids.get(),
        )
        self._hitboxes = hitboxes
        self._map_w, self._map_h = img.size
        self._photo = ImageTk.PhotoImage(img)

        self.canvas.delete("all")
        self.canvas.create_image(0, 0, image=self._photo, anchor="nw", tags=("map",))
        self.canvas.configure(scrollregion=(0, 0, self._map_w, self._map_h))

        # center on current node if possible
        if self.current_id in self._hitboxes:
            x0, y0, x1, y1 = self._hitboxes[self.current_id]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            self.update_idletasks()
            cw = max(1, self.canvas.winfo_width())
            ch = max(1, self.canvas.winfo_height())
            self.canvas.xview_moveto(max(0, (cx - cw / 2) / max(1, self._map_w)))
            self.canvas.yview_moveto(max(0, (cy - ch / 2) / max(1, self._map_h)))

        edges = sum(len(n.get("adjacent_node_ids") or []) for n in self.nodes.values()) // 2
        self.status.configure(
            text=(
                f"已渲染 {self._map_w}×{self._map_h}  "
                f"nodes={len(self.nodes)} edges≈{edges}  "
                f"scale={self.render_scale}  拖拽平移"
            )
        )

    def _canvas_to_image(self, event_x: int, event_y: int) -> tuple[int, int]:
        return (
            int(self.canvas.canvasx(event_x)),
            int(self.canvas.canvasy(event_y)),
        )

    def _hit_node(self, ix: int, iy: int) -> int | None:
        best = None
        best_area = 1e18
        for nid, (x0, y0, x1, y1) in self._hitboxes.items():
            if x0 <= ix <= x1 and y0 <= iy <= y1:
                area = (x1 - x0) * (y1 - y0)
                # prefer smaller / topmost; use current last drawn as preference
                score = area - (1000 if nid == self.current_id else 0)
                if score < best_area:
                    best_area = score
                    best = nid
        return best

    def _on_press(self, e: tk.Event) -> None:
        self._drag = (e.x, e.y)
        self._dragged = False
        self.canvas.scan_mark(e.x, e.y)
        ix, iy = self._canvas_to_image(e.x, e.y)
        nid = self._hit_node(ix, iy)
        if nid is not None:
            self._show_detail(nid)

    def _on_drag(self, e: tk.Event) -> None:
        if self._drag is None:
            return
        if abs(e.x - self._drag[0]) + abs(e.y - self._drag[1]) > 2:
            self._dragged = True
        # pan pre-rendered bitmap only (no re-scale)
        self.canvas.scan_dragto(e.x, e.y, gain=1)

    def _on_release(self, e: tk.Event) -> None:
        self._drag = None

    def _on_motion(self, e: tk.Event) -> None:
        ix, iy = self._canvas_to_image(e.x, e.y)
        nid = self._hit_node(ix, iy)
        if nid is not None:
            n = self.nodes[nid]
            t = int(n.get("node_type") or 0)
            self.status.configure(
                text=(
                    f"#{nid}  {NODE_TYPE_NAMES.get(t, t)}  "
                    f"pos=({n['position_x']},{n['position_y']})  "
                    f"adj={n.get('adjacent_node_ids')}"
                )
            )
            self.canvas.configure(cursor="hand2")
        else:
            self.canvas.configure(cursor="fleur")

    def _on_wheel(self, e: tk.Event) -> None:
        # scroll only (no zoom)
        steps = -1 if e.delta > 0 else 1
        if e.state & 0x0001:  # Shift
            self.canvas.xview_scroll(steps, "units")
        else:
            self.canvas.yview_scroll(steps, "units")

    def _show_detail(self, nid: int) -> None:
        n = self.nodes[nid]
        t = int(n.get("node_type") or 0)
        legend = ""
        for ic in self.dungeon.get("node_icon_info") or []:
            if int(ic.get("node_type", -1)) != t:
                continue
            if t == 10 and n.get("special_incident_id") is not None:
                sids = {str(x) for x in (ic.get("special_incident_ids") or [])}
                if str(n.get("special_incident_id")) in sids:
                    legend = f"{ic.get('name')}: {ic.get('text')}"
                    break
            elif t != 10:
                legend = f"{ic.get('name')}: {ic.get('text')}"
                break
        if not legend and t == 10:
            for ic in self.dungeon.get("node_icon_info") or []:
                if int(ic.get("node_type", -1)) == 10:
                    legend = f"{ic.get('name')}: {ic.get('text')}"
                    break

        cx, cy = node_center(n)
        lines = [
            f"node_id:        {nid}",
            f"type:           {t} ({NODE_TYPE_NAMES.get(t, '?')})",
            f"special_id:     {n.get('special_incident_id')}",
            f"position TL:    ({n['position_x']}, {n['position_y']})",
            f"center (line):  ({cx:.0f}, {cy:.0f})",
            f"visited:        {n.get('is_visited')}",
            f"shrinking:      {n.get('is_shrinking')}",
            f"quest_check:    {n.get('is_quest_check')}",
            f"adjacent:       {n.get('adjacent_node_ids')}",
            f"is_current:     {nid == self.current_id}",
            "",
            legend or "",
        ]
        self.detail.configure(state=tk.NORMAL)
        self.detail.delete("1.0", tk.END)
        self.detail.insert("1.0", "\n".join(lines))
        self.detail.configure(state=tk.DISABLED)


def default_map_path() -> Path:
    for p in (
        ROOT / "out" / "001_arcarum3_dungeon_content_index_0.json",
        ROOT / "out" / "map_graph.json",
    ):
        if p.exists():
            return p
    raise SystemExit("No map JSON found under out/.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Arcarum3 full map viewer (fixed-scale)")
    ap.add_argument("map_json", type=Path, nargs="?", default=None)
    ap.add_argument(
        "--scale",
        type=float,
        default=RENDER_SCALE,
        help=f"fixed render scale (default {RENDER_SCALE})",
    )
    args = ap.parse_args()
    path = args.map_json or default_map_path()
    if not path.exists():
        raise SystemExit(f"Not found: {path}")

    if not MAP_BG.exists():
        print(f"[warn] map background missing: {MAP_BG}", file=sys.stderr)

    dungeon = load_dungeon(path)
    app = MapViewer(dungeon, path, scale=float(args.scale))
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
