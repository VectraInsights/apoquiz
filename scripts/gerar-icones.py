"""Gera os icones do PWA (ApoQuiz) a partir do gradiente da marca."""
import os

from PIL import Image, ImageDraw

OUT = "public"
os.makedirs(OUT, exist_ok=True)

BG_TOP = (124, 108, 248)
BG_BOTTOM = (79, 63, 214)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # fundo com gradiente vertical
    for y in range(size):
        ratio = y / max(1, size - 1)
        color = tuple(
            int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * ratio) for i in range(3)
        )
        draw.line([(0, y), (size, y)], fill=color + (255,))

    # area de conteudo (um pouco menor no icone maskable)
    pad = int(size * (0.22 if maskable else 0.14))
    radius = int(size * 0.16)
    rounded(draw, (pad, pad, size - pad, size - pad), radius, (255, 255, 255, 255))

    # "check" + folha de papel
    cx, cy = size / 2, size / 2
    w = size * 0.05
    draw.line(
        [(cx - size * 0.20, cy), (cx - size * 0.05, cy + size * 0.15)],
        fill=BG_BOTTOM + (255,),
        width=int(w),
    )
    draw.line(
        [(cx - size * 0.05, cy + size * 0.15), (cx + size * 0.22, cy - size * 0.17)],
        fill=BG_BOTTOM + (255,),
        width=int(w),
    )
    return img


for size in (192, 512):
    make(size).save(f"{OUT}/icon-{size}.png")
    print(f"public/icon-{size}.png")

make(512, maskable=True).save(f"{OUT}/icon-maskable-512.png")
print("public/icon-maskable-512.png")

# icone apple (iOS nao aceita SVG na home screen)
make(180).save(f"{OUT}/apple-touch-icon.png")
print("public/apple-touch-icon.png")
