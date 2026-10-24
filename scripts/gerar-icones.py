"""Gera os icones do PWA (ApoQuiz) com a identidade nova.

Lampada (rocho -> azul royal) com uma interrogacao dentro, base amarela e
uma faisca verde de ideia.
"""
import os

from PIL import Image, ImageDraw

OUT = "public"
os.makedirs(OUT, exist_ok=True)

BG_TOP = (167, 139, 250)      # roxo claro
BG_MID = (124, 108, 248)      # roxo da marca
BG_BOTTOM = (59, 130, 246)    # azul royal
BASE_TOP = (253, 230, 138)    # amarelo claro
BASE_BOTTOM = (245, 158, 11)  # ambar
SPARK = (52, 211, 153)        # verde


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def fundo(y, size):
    """Cor do gradiente vertical na linha y."""
    t = y / max(1, size - 1)
    if t < 0.5:
        return lerp(BG_TOP, BG_MID, t / 0.5)
    return lerp(BG_MID, BG_BOTTOM, (t - 0.5) / 0.5)


def make(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # fundo com gradiente vertical
    for y in range(size):
        draw.line([(0, y), (size, y)], fill=fundo(y, size) + (255,))

    # a lampada e desenhada numa grade de 24x24
    escala = (size / 24) * (0.72 if maskable else 1.0)
    off_x = (size - 24 * escala) / 2
    off_y = (size - 24 * escala) / 2

    def px(x, y):
        return (off_x + x * escala, off_y + y * escala)

    def esc(v):
        return max(1, int(round(v * escala)))

    # vidro: circulo + pescoco
    vidro = [px(5.4, 2.4), px(18.6, 15.6)]
    draw.ellipse(vidro, fill=(255, 255, 255, 255))
    draw.polygon(
        [px(9.7, 12.4), px(14.3, 12.4), px(13.9, 17.4), px(10.1, 17.4)],
        fill=(255, 255, 255, 255),
    )

    # interrogacao recortada no vidro
    corte = fundo(int(px(0, 9)[1]), size) + (255,)
    largura = esc(1.7)
    draw.arc(
        [px(9.4, 5.6), px(14.6, 10.8)],
        start=180,
        end=350,
        fill=corte,
        width=largura,
    )
    draw.line([px(14.35, 7.95), px(12.45, 10.5)], fill=corte, width=largura)
    x, y = px(12.2, 12.5)
    r = esc(1.05)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=corte)

    # base amarela
    draw.rounded_rectangle(
        [px(9.0, 18.3), px(15.0, 20.3)], radius=esc(1.0), fill=BASE_TOP + (255,)
    )
    draw.rounded_rectangle(
        [px(9.8, 21.0), px(14.2, 22.6)], radius=esc(0.8), fill=BASE_BOTTOM + (255,)
    )

    # faisca verde de ideia
    cx, cy = px(19.6, 4.2)
    r = esc(1.8)
    pontos = []
    for ang, dist in ((-90, 1.0), (-45, 0.34), (0, 1.0), (45, 0.34),
                       (90, 1.0), (135, 0.34), (180, 1.0), (225, 0.34)):
        import math
        rad = math.radians(ang)
        pontos.append((cx + math.cos(rad) * r * dist,
                       cy + math.sin(rad) * r * dist))
    draw.polygon(pontos, fill=SPARK + (255,))

    return img


for size in (192, 512):
    make(size).save(f"{OUT}/icon-{size}.png")
    print(f"public/icon-{size}.png")

make(512, maskable=True).save(f"{OUT}/icon-maskable-512.png")
print("public/icon-maskable-512.png")

# icone apple (iOS nao aceita SVG na home screen)
make(180).save(f"{OUT}/apple-touch-icon.png")
print("public/apple-touch-icon.png")


# favicon do navegador. Sem ele, o Chrome usava o logo antigo (o "N" preto)
# no atalho da tela inicial, mesmo com o manifest ja apontando pra lampada.
# Renderiza em 8x e reduz com LANCZOS: em 16px o antialiasing e o que
# separa uma lampada reconhecivel de uma mancha.
FAV = os.path.join("app", "favicon.ico")
TAMANHOS_ICO = [(16, 16), (32, 32), (48, 48)]
quadros = [
    make(lado * 8).resize((lado, lado), Image.LANCZOS)
    for lado, _ in TAMANHOS_ICO
]
quadros[-1].save(
    FAV,
    format="ICO",
    sizes=TAMANHOS_ICO,
    append_images=quadros[:-1],
)
print("app/favicon.ico")
