"""Builds the OCR benchmark fixtures (scripts/modelBenchmark.ts, test "ocr").

Synthetic on purpose: the ground truth is known exactly. Run with Pillow and
the DejaVu fonts available, e.g.
  docker run --rm -v "$PWD":/app -v /usr/share/fonts:/usr/share/fonts:ro -w /app \
    python:3.12-slim sh -c "pip -q install pillow && python scripts/fixtures/ocr/generate.py"
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TEXT = """CSC 301 - Lecture 7: Queues
Date: October 6, 2026

1. A queue is FIFO: the oldest item leaves first.
2. enqueue(x) and dequeue() both run in O(1).
3. Aster buffer capacity is 17 slots.
4. On overflow the device reports ZEPHYR-47.
5. BFS visits each vertex once: O(V + E).

Homework: problems 4.2, 4.5 and 4.9 due Friday.
Office hours: Tuesday 2:30 PM, room B-114."""


def render() -> Image.Image:
    lines = TEXT.split("\n")
    image = Image.new("RGB", (1400, 120 + 58 * len(lines)), "white")
    draw = ImageDraw.Draw(image)
    y = 60
    for i, line in enumerate(lines):
        draw.text((70, y), line, fill=(20, 20, 30), font=ImageFont.truetype(BOLD if i == 0 else FONT, 40 if i == 0 else 34))
        y += 58
    return image


def phone_photo(clean: Image.Image) -> Image.Image:
    random.seed(7)
    paper = clean.convert("L").point(lambda v: 60 + v * 0.62).convert("RGB")
    rotated = paper.rotate(3.5, expand=True, fillcolor=(90, 85, 80), resample=Image.BICUBIC)
    # Uneven lighting: darker toward the bottom-right corner.
    w, h = rotated.size
    shade = Image.linear_gradient("L").resize((w, h)).rotate(-35).point(lambda v: 255 - v // 3)
    lit = Image.composite(rotated, Image.new("RGB", (w, h), (40, 38, 35)), shade)
    noisy = lit.copy()
    px = noisy.load()
    for _ in range(w * h // 25):
        x, y = random.randrange(w), random.randrange(h)
        d = random.randint(-35, 35)
        r, g, b = px[x, y]
        px[x, y] = (max(0, min(255, r + d)),) * 3
    return noisy.filter(ImageFilter.GaussianBlur(1.3)).resize((w * 3 // 4, h * 3 // 4))


clean = render()
clean.save(OUT / "lecture-clean.png")
phone_photo(clean).save(OUT / "lecture-phone.jpg", quality=55)
(OUT / "lecture.txt").write_text(TEXT + "\n")
print("wrote", sorted(p.name for p in OUT.iterdir()))
