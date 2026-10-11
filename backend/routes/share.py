"""Public share landing pages + auto-generated branded share cards.

Serves crawler-friendly HTML (Open Graph + Twitter Card meta) for reels,
profiles and pets so shared links show a rich preview on IG/TikTok/X/WhatsApp
and are indexable by Google. The og:image is a branded PostMePlex card rendered
on the fly with Pillow (no AI, free). Humans are redirected into the app with
the sharer's ?ref= so the referral loop kicks in.

Avoids `from __future__ import annotations` (closure-local Depends elsewhere).
"""
import html
import io
import os

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response
from PIL import Image, ImageDraw, ImageFont

BRAND_BG = (18, 20, 28)
BRAND_CARD = (26, 29, 40)
ACCENT = (255, 107, 61)
WHITE = (255, 255, 255)
MUTED = (160, 166, 180)
LOGO_URL = os.environ.get("DEFAULT_AVATAR_URL", "")

_FONT_DIR = "/usr/share/fonts/truetype/liberation"


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    try:
        return ImageFont.truetype(f"{_FONT_DIR}/{name}", size)
    except Exception:
        return ImageFont.load_default()


async def _fetch_image(url):
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(url)
        if r.status_code >= 400:
            return None
        return Image.open(io.BytesIO(r.content)).convert("RGBA")
    except Exception:
        return None


def _circle(img, size):
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size, size), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def _rounded(img, w, h, radius=32):
    img = img.resize((w, h), Image.LANCZOS)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def _wrap(draw, text, font, max_width):
    words = (text or "").split()
    lines, cur = [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if draw.textlength(test, font=font) <= max_width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


async def _render_card(kind_label, title, subtitle, stats, media_url, is_avatar, logo_img):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BRAND_BG)
    d = ImageDraw.Draw(img)

    # Accent side bar
    d.rectangle((0, 0, 12, H), fill=ACCENT)

    # Logo + wordmark
    x = 60
    if logo_img is not None:
        img.paste(_circle(logo_img, 64), (x, 54), _circle(logo_img, 64))
        x += 80
    d.text((x, 62), "PostMePlex", font=_font(40), fill=WHITE)
    d.text((x + 262, 72), "CREATOR PLATFORM", font=_font(18), fill=ACCENT)

    # Kind pill
    pill_font = _font(22)
    pw = d.textlength(kind_label, font=pill_font)
    d.rounded_rectangle((60, 150, 60 + pw + 40, 196), radius=23, fill=ACCENT)
    d.text((80, 158), kind_label, font=pill_font, fill=(18, 20, 28))

    # Media on the right
    media_img = await _fetch_image(media_url)
    text_right = W - 80
    if media_img is not None:
        if is_avatar:
            size = 300
            mx, my = W - size - 80, (H - size) // 2 + 20
            img.paste(_circle(media_img, size), (mx, my), _circle(media_img, size))
            text_right = mx - 40
        else:
            mw, mh = 380, 420
            mx, my = W - mw - 70, (H - mh) // 2 + 20
            rc = _rounded(media_img, mw, mh, radius=28)
            img.paste(rc, (mx, my), rc)
            text_right = mx - 40

    # Title (wrapped, up to 3 lines)
    ty = 240
    tfont = _font(64)
    for line in _wrap(d, title, tfont, text_right - 60)[:3]:
        d.text((60, ty), line, font=tfont, fill=WHITE)
        ty += 74

    # Subtitle
    if subtitle:
        d.text((60, ty + 6), subtitle, font=_font(30, bold=False), fill=MUTED)
        ty += 50

    # Stats row
    if stats:
        sy = H - 130
        sx = 60
        for label, value in stats:
            d.text((sx, sy), str(value), font=_font(38), fill=WHITE)
            d.text((sx, sy + 46), label, font=_font(22, bold=False), fill=MUTED)
            sx += max(140, int(d.textlength(str(value), font=_font(38)) + 90))

    # CTA footer
    d.text((60, H - 46), "Join the community →  postmeplex", font=_font(24), fill=ACCENT)

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _png(data):
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


def _cover(img, w, h):
    sw, sh = img.size
    if not sw or not sh:
        return img.resize((w, h), Image.LANCZOS)
    scale = max(w / sw, h / sh)
    nw, nh = max(w, int(sw * scale)), max(h, int(sh * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


async def _render_photo_card(image_url, kind_label, title, handle):
    """Clean, photo-forward 1200x630 card: the content image fills the frame with
    a bottom scrim, kind pill and wordmark. Returns None if the image can't load."""
    media = await _fetch_image(image_url)
    if media is None:
        return None
    W, H = 1200, 630
    base = _cover(media.convert("RGB"), W, H).convert("RGBA")
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for y in range(H):
        t = max(0.0, (y - H * 0.38) / (H * 0.62))
        sd.line([(0, y), (W, y)], fill=(8, 9, 14, int(230 * t)))
    base = Image.alpha_composite(base, scrim).convert("RGB")
    d = ImageDraw.Draw(base)
    pf = _font(24)
    pw = d.textlength(kind_label, font=pf)
    d.rounded_rectangle((44, 44, 44 + pw + 44, 94), radius=25, fill=ACCENT)
    d.text((66, 53), kind_label, font=pf, fill=(18, 20, 28))
    wm = "PostMePlex" + (f"   @{handle}" if handle else "")
    d.text((50, H - 54), wm, font=_font(28), fill=ACCENT)
    tf = _font(60)
    lines = _wrap(d, title, tf, W - 110)[:2]
    ty = H - 78 - len(lines) * 68
    for ln in lines:
        d.text((50, ty), ln, font=tf, fill=WHITE)
        ty += 68
    buf = io.BytesIO()
    base.save(buf, "PNG")
    return buf.getvalue()


def _origin(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        return f"{proto}://{host}"
    return str(request.base_url).rstrip("/")


def _landing(title, desc, image_abs, page_url, app_url):
    t, dsc = html.escape(title), html.escape(desc)
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t} · PostMePlex</title>
<meta name="description" content="{dsc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PostMePlex">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{dsc}">
<meta property="og:image" content="{image_abs}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{page_url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{dsc}">
<meta name="twitter:image" content="{image_abs}">
<style>
:root{{color-scheme:dark}}
*{{box-sizing:border-box;margin:0}}
body{{background:#12141c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}}
.card{{max-width:640px;width:100%;text-align:center}}
.brand{{color:#FF6B3D;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:13px;margin-bottom:16px}}
img.prev{{width:100%;border-radius:20px;border:1px solid #262a34;display:block}}
h1{{font-size:26px;margin:22px 0 8px}}
p{{color:#a0a6b4;font-size:15px;margin-bottom:24px}}
a.cta{{display:inline-block;background:#FF6B3D;color:#12141c;font-weight:800;text-decoration:none;
padding:14px 30px;border-radius:999px;font-size:16px}}
</style></head><body>
<div class="card">
<div class="brand">⚡ PostMePlex</div>
<img class="prev" src="{image_abs}" alt="{t}">
<h1>{t}</h1><p>{dsc}</p>
<a class="cta" href="{app_url}">Open on PostMePlex</a>
</div>
<script>setTimeout(function(){{location.href="{app_url}"}},1400);</script>
</body></html>"""


def build_router(ctx) -> APIRouter:
    db = ctx.db
    avatar_or_default = ctx.avatar_or_default
    router = APIRouter(tags=["share"])

    async def _logo():
        return await _fetch_image(LOGO_URL)

    async def _get_reel(reel_id):
        p = await db.posts.find_one({"id": reel_id}, {"_id": 0})
        if not p:
            return None, None
        author = await db.users.find_one({"id": p.get("author_id")}, {"_id": 0})
        return p, author

    async def _get_user(handle):
        h = (handle or "").lstrip("@").lower()
        return await db.users.find_one({"username": h}, {"_id": 0})

    def _fmt(n):
        n = n or 0
        if n >= 1_000_000:
            return f"{n/1_000_000:.1f}M".replace(".0", "")
        if n >= 1_000:
            return f"{n/1_000:.1f}K".replace(".0", "")
        return str(n)

    # ---- Reel ----
    @router.get("/api/share/reel/{reel_id}/card.png")
    async def reel_card(reel_id: str):
        p, author = await _get_reel(reel_id)
        if not p:
            return _png(await _render_card("REEL", "Reel not found", "", [], None, False, await _logo()))
        title = (p.get("caption") or "Watch this reel").strip()[:90]
        sub = f"@{author['username']}" if author else ""
        handle = author["username"] if author else ""
        photo = await _render_photo_card(p.get("thumbnail_url"), "REEL", title, handle)
        if photo:
            return _png(photo)
        stats = [("Likes", _fmt(p.get("likes"))), ("Comments", _fmt(p.get("comments_count"))), ("Views", _fmt(p.get("views")))]
        media = p.get("thumbnail_url") or (avatar_or_default(author.get("avatar_url")) if author else None)
        return _png(await _render_card("REEL", title, sub, stats, media, not p.get("thumbnail_url"), await _logo()))

    @router.get("/api/share/reel/{reel_id}")
    async def reel_page(reel_id: str, request: Request):
        origin = _origin(request)
        p, author = await _get_reel(reel_id)
        title = (p.get("caption").strip()[:90] if p and p.get("caption") else "Watch this reel on PostMePlex")
        handle = author["username"] if author else ""
        desc = f"A reel by @{handle} on PostMePlex — join the creator community." if handle else "Watch reels on PostMePlex."
        app_url = f"{origin}/reels/{reel_id}" + (f"?ref={handle}" if handle else "")
        return HTMLResponse(_landing(title, desc, f"{origin}/api/share/reel/{reel_id}/card.png", f"{origin}/api/share/reel/{reel_id}", app_url))

    # ---- Profile ----
    @router.get("/api/share/u/{handle}/card.png")
    async def user_card(handle: str):
        u = await _get_user(handle)
        if not u:
            return _png(await _render_card("PROFILE", "User not found", "", [], None, False, await _logo()))
        stats = [("Followers", _fmt(u.get("followers"))), ("Following", _fmt(u.get("following"))), ("Posts", _fmt(u.get("posts_count")))]
        return _png(await _render_card("PROFILE", u.get("display_name") or u["username"], f"@{u['username']}", stats, avatar_or_default(u.get("avatar_url")), True, await _logo()))

    @router.get("/api/share/u/{handle}")
    async def user_page(handle: str, request: Request):
        origin = _origin(request)
        u = await _get_user(handle)
        name = (u.get("display_name") or u["username"]) if u else handle
        desc = (u.get("bio") or f"Follow @{u['username']} on PostMePlex.") if u else "Join PostMePlex."
        h = u["username"] if u else handle.lstrip("@").lower()
        app_url = f"{origin}/@{h}?ref={h}"
        return HTMLResponse(_landing(name, desc, f"{origin}/api/share/u/{h}/card.png", f"{origin}/api/share/u/{h}", app_url))

    # ---- Pet ----
    async def _get_pet(handle):
        u = await _get_user(handle)
        if not u:
            return None, None
        pet = await db.pets.find_one({"owner_id": u["id"]}, {"_id": 0})
        return u, pet

    @router.get("/api/share/pet/{handle}/card.png")
    async def pet_card(handle: str):
        u, pet = await _get_pet(handle)
        if not pet:
            return _png(await _render_card("SAGE AI PET", "No pet yet", "", [], None, False, await _logo()))
        stage = "Baby" if pet.get("level", 1) <= 2 else ("Teen" if pet.get("level", 1) <= 6 else "Adult")
        stats = [("Level", pet.get("level", 1)), ("Stage", stage)]
        return _png(await _render_card("SAGE AI PET", pet.get("name") or "My pet", f"{u.get('display_name')}'s pet", stats, pet.get("image_url"), False, await _logo()))

    @router.get("/api/share/pet/{handle}")
    async def pet_page(handle: str, request: Request):
        origin = _origin(request)
        u, pet = await _get_pet(handle)
        name = (pet.get("name") if pet else "My Sage AI pet")
        h = u["username"] if u else handle.lstrip("@").lower()
        desc = f"Meet {name}, {u.get('display_name')}'s AI-generated pet on PostMePlex. Adopt your own!" if u else "Adopt an AI pet on PostMePlex."
        app_url = f"{origin}/pet?ref={h}"
        return HTMLResponse(_landing(f"Meet {name} 🐾", desc, f"{origin}/api/share/pet/{h}/card.png", f"{origin}/api/share/pet/{h}", app_url))

    # ---- Post ----
    async def _get_post(pid):
        p = await db.posts.find_one({"id": pid}, {"_id": 0})
        if not p:
            return None, None
        a = await db.users.find_one({"id": p.get("author_id")}, {"_id": 0})
        return p, a

    @router.get("/api/share/post/{post_id}/card.png")
    async def post_card(post_id: str):
        p, author = await _get_post(post_id)
        if not p:
            return _png(await _render_card("POST", "Post not found", "", [], None, False, await _logo()))
        handle = author["username"] if author else ""
        title = (p.get("caption") or "Check out this post").strip()[:110]
        img = p.get("image_url") or p.get("thumbnail_url")
        photo = await _render_photo_card(img, "POST", title, handle)
        if photo:
            return _png(photo)
        stats = [("Likes", _fmt(p.get("likes"))), ("Comments", _fmt(p.get("comments_count")))]
        avatar = avatar_or_default(author.get("avatar_url")) if author else None
        return _png(await _render_card("POST", title, f"@{handle}" if handle else "", stats, avatar, True, await _logo()))

    @router.get("/api/share/post/{post_id}")
    async def post_page(post_id: str, request: Request):
        origin = _origin(request)
        p, author = await _get_post(post_id)
        handle = author["username"] if author else ""
        title = (p.get("caption").strip()[:110] if p and p.get("caption") else "Check out this post on PostMePlex")
        desc = f"A post by @{handle} on PostMePlex — join the community." if handle else "See posts on PostMePlex."
        app_url = f"{origin}/posts/{post_id}" + (f"?ref={handle}" if handle else "")
        return HTMLResponse(_landing(title, desc, f"{origin}/api/share/post/{post_id}/card.png", f"{origin}/api/share/post/{post_id}", app_url))

    # ---- Blog ----
    async def _get_blog(bid):
        b = await db.blogs.find_one({"id": bid}, {"_id": 0})
        if not b:
            return None, None
        a = await db.users.find_one({"id": b.get("author_id")}, {"_id": 0})
        return b, a

    @router.get("/api/share/blog/{blog_id}/card.png")
    async def blog_card(blog_id: str):
        b, author = await _get_blog(blog_id)
        if not b:
            return _png(await _render_card("BLOG", "Blog not found", "", [], None, False, await _logo()))
        handle = author["username"] if author else ""
        title = (b.get("title") or "Read this blog").strip()[:110]
        photo = await _render_photo_card(b.get("cover_url"), "BLOG", title, handle)
        if photo:
            return _png(photo)
        sub = (b.get("subtitle") or (f"@{handle}" if handle else "")).strip()[:80]
        stats = [("Likes", _fmt(b.get("likes"))), ("Views", _fmt(b.get("views")))]
        avatar = avatar_or_default(author.get("avatar_url")) if author else None
        return _png(await _render_card("BLOG", title, sub, stats, avatar, True, await _logo()))

    @router.get("/api/share/blog/{blog_id}")
    async def blog_page(blog_id: str, request: Request):
        origin = _origin(request)
        b, author = await _get_blog(blog_id)
        handle = author["username"] if author else ""
        title = (b.get("title").strip()[:110] if b and b.get("title") else "Read this blog on PostMePlex")
        desc = (b.get("subtitle") if b and b.get("subtitle") else (f"A blog by @{handle} on PostMePlex." if handle else "Read blogs on PostMePlex."))
        app_url = f"{origin}/blogs/{blog_id}" + (f"?ref={handle}" if handle else "")
        return HTMLResponse(_landing(title, desc, f"{origin}/api/share/blog/{blog_id}/card.png", f"{origin}/api/share/blog/{blog_id}", app_url))

    # ---- Video ----
    async def _get_video(vid):
        v = await db.videos.find_one({"id": vid}, {"_id": 0})
        if not v:
            return None, None
        a = await db.users.find_one({"id": v.get("author_id")}, {"_id": 0})
        return v, a

    @router.get("/api/share/video/{video_id}/card.png")
    async def video_card(video_id: str):
        v, author = await _get_video(video_id)
        if not v:
            return _png(await _render_card("VIDEO", "Video not found", "", [], None, False, await _logo()))
        handle = author["username"] if author else ""
        title = (v.get("title") or "Watch this video").strip()[:110]
        photo = await _render_photo_card(v.get("thumbnail_url"), "VIDEO", title, handle)
        if photo:
            return _png(photo)
        stats = [("Views", _fmt(v.get("views"))), ("Likes", _fmt(v.get("likes")))]
        avatar = avatar_or_default(author.get("avatar_url")) if author else None
        return _png(await _render_card("VIDEO", title, f"@{handle}" if handle else "", stats, avatar, True, await _logo()))

    @router.get("/api/share/video/{video_id}")
    async def video_page(video_id: str, request: Request):
        origin = _origin(request)
        v, author = await _get_video(video_id)
        handle = author["username"] if author else ""
        title = (v.get("title").strip()[:110] if v and v.get("title") else "Watch this video on PostMePlex")
        desc = (v.get("description").strip()[:160] if v and v.get("description") else (f"A video by @{handle} on PostMePlex." if handle else "Watch videos on PostMePlex."))
        app_url = f"{origin}/videos/{video_id}" + (f"?ref={handle}" if handle else "")
        return HTMLResponse(_landing(title, desc, f"{origin}/api/share/video/{video_id}/card.png", f"{origin}/api/share/video/{video_id}", app_url))

    return router
