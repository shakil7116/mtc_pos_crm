# -*- coding: utf-8 -*-
"""AGGREGATE · Plate I — a visual expression of the philosophy of accumulation.
Rendered at A4 / 300dpi in Pillow. Ground: paper. Mark: ink. Verdict: brass."""

import os, random, math
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter

random.seed(72986)  # the count is deterministic — a ledger, not chance

FONTS = r"C:/Users/Hp/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/c9fc6db3-a6eb-4930-a0cb-9268fb21e11e/a1a72412-ebdc-435c-a5a9-074c394cda7b/skills/canvas-design/canvas-fonts"
OUT  = r"C:/Users/Hp/OneDrive/Desktop/mtc pos crm/canvas-art/AGGREGATE-plate-I.png"

def F(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)

# ── palette ──────────────────────────────────────────────────────────────
PAPER = (238, 232, 219)
INK   = (20, 28, 40)
BRASS = (178, 124, 38)
GRAY  = (139, 132, 116)
FAINT = (20, 28, 40, 26)   # ghost ink

W, H = 2480, 3508
M    = 236                 # margin
X0, X1 = M, W - M
CW   = X1 - X0

img  = Image.new("RGB", (W, H), PAPER)

# paper grain — gaussian noise blended at a whisper
noise = Image.effect_noise((W, H), 16).convert("RGB")
img   = Image.blend(img, noise, 0.045)
# faint warm vignette
vig = Image.new("L", (W, H), 0)
vd  = ImageDraw.Draw(vig)
vd.ellipse([-W*0.30, -H*0.20, W*1.30, H*1.20], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(420))
dark = Image.new("RGB", (W, H), (208, 200, 183))
img  = Image.composite(img, dark, vig)

d = ImageDraw.Draw(img, "RGBA")

# ── helpers ──────────────────────────────────────────────────────────────
def tracked(draw, xy, text, font, fill, track, anchor_left=True):
    x, y = xy
    widths = [draw.textlength(c, font=font) for c in text]
    total  = sum(widths) + track * (len(text) - 1)
    if not anchor_left:
        x -= total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=font, fill=fill)
        x += w + track
    return total

def reg_cross(draw, cx, cy, r=20, wdt=2, col=INK):
    draw.line([(cx - r, cy), (cx + r, cy)], fill=col, width=wdt)
    draw.line([(cx, cy - r), (cx, cy + r)], fill=col, width=wdt)

# ── registration crosses (corners of the plate field) ────────────────────
for cx in (X0, X1):
    for cy in (M, H - M):
        reg_cross(d, cx, cy, 22, 2, INK)

# ── top apparatus ────────────────────────────────────────────────────────
lab = F("IBMPlexMono-Regular.ttf", 27)
tracked(d, (X0, M - 6), "AGGREGATE", lab, INK, 7)
rt = "PLATE I  /  Nº 17336"
rw = d.textlength(rt, font=lab) + 6*(len(rt)-1)
tracked(d, (X1 - rw, M - 6), rt, lab, GRAY, 6)
d.line([(X0, M + 44), (X1, M + 44)], fill=INK, width=2)

# ── monument: the title word, architectural, tracked to span the measure ─
title = "AGGREGATE"
tf = F("BigShoulders-Bold.ttf", 470)
# fit to content width by choosing tracking
base = sum(d.textlength(c, font=tf) for c in title)
track = (CW - base) / (len(title) - 1)
ty = M + 150
tracked(d, (X0, ty), title, tf, INK, track)   # one clean strike — nothing muddies the measure

sub = F("IBMPlexMono-Regular.ttf", 30)
tracked(d, (X0, ty + 500), "THE  SUM  AND  THE  SUBSTANCE", sub, GRAY, 12)
d.line([(X0, ty + 562), (X1, ty + 562)], fill=INK, width=1)

# ── the field: a hand-counted accumulation of identical strokes ──────────
FY0, FY1 = ty + 700, 2660
FX0, FX1 = X0 + 112, X1 - 18                 # marks inset; the FRAME holds the true measure
sx, sy   = 30, 30
cols = int((FX1 - FX0) // sx)
rows = int((FY1 - FY0) // sy)
N    = 0

# faint ledger ruling every tenth course — the register beneath the count
for i in range(0, rows + 1, 10):
    yy = FY0 + i * sy
    d.line([(X0, yy), (X1, yy)], fill=(20, 28, 40, 26), width=1)

# the brass verdict: a quiet diagonal SEAM through the mass — the vein of
# value that ran through everything the count was ever counting toward
seam = set()
sr, sc = 9, 6
for i in range(12):
    rr_, cc_ = sr + i, sc + int(i * 1.6)
    if 0 <= rr_ < rows and 0 <= cc_ < cols:
        seam.add(rr_ * cols + cc_)
seam |= set(random.sample(range(cols * rows), 4))   # a few stray grains of brass

k = 0
for r in range(rows):
    settle = 1.0 + (r / rows) * 0.16             # strata compact under their own weight
    for c in range(cols):
        bx = FX0 + c * sx + sx/2
        by = FY0 + r * sy + sy/2
        jx = random.uniform(-2.2, 2.2)
        jy = random.uniform(-2.2, 2.2)
        hh = random.uniform(9, 12) * settle      # half-height of the stroke
        lean = random.uniform(-1.3, 1.3)         # the hand is never perfectly plumb
        x = bx + jx; yc = by + jy
        if k in seam:
            d.line([(x - lean, yc - hh - 2), (x + lean, yc + hh + 2)], fill=BRASS, width=5)
        else:
            a = random.randint(150, 220)         # ink sits unevenly — some strokes lighter
            d.line([(x - lean, yc - hh), (x + lean, yc + hh)], fill=(24, 33, 45, a), width=3)
        N += 1; k += 1

# the register frame — locked to the true measure X0..X1
d.rectangle([X0, FY0 - 30, X1, FY1 + 22], outline=(20, 28, 40, 72), width=1)

# left measurement scale, set just inside the frame
ms = F("GeistMono-Regular.ttf", 25)
for i in range(0, rows + 1, 10):
    yy = FY0 + i * sy
    d.line([(X0 + 54, yy), (X0 + 84, yy)], fill=GRAY, width=2)
    d.text((X0 + 10, yy - 14), f"{i:02d}", font=ms, fill=GRAY)
# count, struck below the field on the same measure
cnt = F("IBMPlexMono-Bold.ttf", 30)
ctext = f"N = {N}"
tracked(d, (X0, FY1 + 44), ctext, cnt, INK, 4)
rl = "UNITS OBSERVED  ·  EACH SET BY HAND"
rw2 = d.textlength(rl, font=lab) + 5*(len(rl)-1)
tracked(d, (X1 - rw2, FY1 + 48), rl, F("IBMPlexMono-Regular.ttf", 25), GRAY, 5)

# ── the verdict: one struck seal in the lower quiet (a coin / a pipe-mouth) ─
scx, scy, R = X1 - 150, 2965, 96
for rr, wdt in [(R, 4), (R - 22, 2)]:
    d.ellipse([scx-rr, scy-rr, scx+rr, scy+rr], outline=BRASS, width=wdt)
# engraved ticks at the quarters
for ang in range(0, 360, 90):
    a = math.radians(ang)
    d.line([(scx + (R-22)*math.cos(a), scy + (R-22)*math.sin(a)),
            (scx + R*math.cos(a),      scy + R*math.sin(a))], fill=BRASS, width=2)
d.ellipse([scx-11, scy-11, scx+11, scy+11], fill=BRASS)   # the struck bead — the total
tracked(d, (scx - 64, scy + R + 26), "THE WHOLE", F("GeistMono-Regular.ttf", 24), BRASS, 3)

# ── elegant closing phrase ───────────────────────────────────────────────
ph = F("CrimsonPro-Italic.ttf", 70)
phrase = "the whole remembers every grain"
pw = d.textlength(phrase, font=ph)
d.text((X0, 3120), phrase, font=ph, fill=INK)

# ── clinical caption (the reference that means everything to one reader) ──
cap = F("IBMPlexMono-Regular.ttf", 26)
tracked(d, (X0, 3236), "FIG. I   ·   STUDY OF ACCUMULATION   ·   REF. 72986/1   ·   QAR   ·   MMXXVI",
        cap, GRAY, 3)
d.line([(X0, H - M - 30), (X1, H - M - 30)], fill=INK, width=2)
fo = F("IBMPlexMono-Regular.ttf", 24)
tracked(d, (X0, H - M - 12), "AGGREGATE", fo, INK, 6)
et = "A FIELD STUDY IN ACCUMULATION"
ew = d.textlength(et, font=fo) + 5*(len(et)-1)
tracked(d, (X1 - ew, H - M - 12), et, fo, GRAY, 5)

img.save(OUT, "PNG")
img.save(OUT.replace(".png", ".pdf"), "PDF", resolution=300.0)   # print-ready A4
print("saved", OUT, img.size, "marks:", N)
