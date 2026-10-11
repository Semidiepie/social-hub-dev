"""Generate the PostMePlex app icon: brand-orange rounded square with the black
lightning bolt (matches the splash). Writes all favicon/app-icon PNGs."""
from PIL import Image, ImageDraw

PUB = "/app/frontend/public"
TOP = (255, 122, 76)    # #FF7A4C
BOT = (240, 97, 49)     # #F06131
BOLT = (18, 20, 28)     # #12141c

# Lightning bolt path points in a 24x24 space (same shape as the splash SVG).
BOLT_PTS = [(13.5, 1.5), (4, 13.4), (10.1, 13.4), (9, 22.5), (20, 9.8), (13.6, 9.8)]


def make(size: int) -> Image.Image:
    # Vertical gradient
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        grad.putpixel((0, y), tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3)))
    grad = grad.resize((size, size))

    # Rounded-square mask
    radius = int(size * 0.225)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=radius, fill=255)

    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(grad, (0, 0), mask)

    # Bolt: scale the 24x24 shape so it is ~0.5 of the canvas height, centered.
    scale = (size * 0.50) / 21.0
    cx = cy = size / 2
    pts = [(cx + (x - 12) * scale, cy + (y - 12) * scale) for (x, y) in BOLT_PTS]
    d = ImageDraw.Draw(icon)
    d.polygon(pts, fill=BOLT)
    return icon


master = make(1024)
master.save(f"{PUB}/logo.png")
master.save(f"{PUB}/logo-512.png")
master.save(f"{PUB}/apple-touch-icon.png")
master.save(f"{PUB}/favicon.png")
make(64).save(f"{PUB}/favicon.ico", sizes=[(64, 64), (32, 32), (16, 16)])
print("icons written")
