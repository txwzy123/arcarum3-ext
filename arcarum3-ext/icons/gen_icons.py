"""Generate simple extension icons."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).parent
for size in (16, 48, 128):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = max(1, size // 16)
    d.rounded_rectangle(
        (pad, pad, size - pad - 1, size - pad - 1),
        radius=max(2, size // 6),
        fill=(47, 91, 184, 255),
    )
    # simple node + path
    cx, cy = size // 2, size // 2
    r = max(2, size // 6)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 220, 100, 255))
    d.line((pad * 3, cy, size - pad * 3, cy), fill=(200, 184, 150, 255), width=max(1, size // 16))
    path = out / f"icon{size}.png"
    im.save(path)
    print("wrote", path)
