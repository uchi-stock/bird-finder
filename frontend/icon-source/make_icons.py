"""アプリアイコン・ファビコンを、元画像（app-icon-source.png）から生成する（#203）。

使い方: python3 icon-source/make_icons.py   （frontendディレクトリで実行。Pillowとnumpyが要る）
元画像は、丸い四角の外が黒で塗られた、不透明な画像。外側の黒を透明にして、次を作る:
- icon-512.png / icon-192.png: 通常のアイコン（角は透明）
- icon-maskable-512.png: マスク可能。背景を全面に敷き、絵を安全領域（中央の約80%）に収める
- apple-touch-icon.png: iOSのホーム画面用（180px）。不透明な正方形（iOSが角を丸める）
- favicon-32.png / favicon-16.png / favicon.ico: ファビコン
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public"
CREAM = (253, 250, 244)  # 元画像の背景色


def load_tile():
    """元画像から、丸い四角を切り出し、外側（黒）を透明にしたRGBA画像を返す"""
    rgb = np.asarray(Image.open(HERE / "app-icon-source.png").convert("RGB")).astype(int)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    ys, xs = np.where(lum > 40)
    # 外側の黒が、丸い四角を一周とりまくように、余白（黒）を6画素つけて切り出す
    m = 6
    x0, x1, y0, y1 = xs.min() - m, xs.max() + 1 + m, ys.min() - m, ys.max() + 1 + m
    rgb, lum = rgb[y0:y1, x0:x1], lum[y0:y1, x0:x1]
    h, w = lum.shape
    # 外側の黒は、四隅から、暗い画素をたどって求める（絵の中の暗い部分は、クリーム色に囲まれていて、つながらない）
    outside = np.zeros((h, w), bool)
    queue = deque((y, x) for y, x in [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)])
    while queue:
        y, x = queue.popleft()
        if outside[y, x] or lum[y, x] > 60:
            continue
        outside[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not outside[ny, nx]:
                queue.append((ny, nx))
    # 縁の近くは、元画像の圧縮のにじみ（クリーム色より少し暗い画素）が残っている。外側から8画素以内は、クリーム色に塗り直す。
    # そのうち、外側に接する3画素は、黒とクリーム色の混ざりなので、明るさから透明度を求める（なめらかな角にする）
    def grow(mask, steps):
        for _ in range(steps):
            g = mask.copy()
            g[1:, :] |= mask[:-1, :]
            g[:-1, :] |= mask[1:, :]
            g[:, 1:] |= mask[:, :-1]
            g[:, :-1] |= mask[:, 1:]
            mask = g
        return mask

    ring = grow(outside, 3) & ~outside
    band = grow(outside, 8) & ~outside
    cream_lum = 0.299 * CREAM[0] + 0.587 * CREAM[1] + 0.114 * CREAM[2]
    alpha = np.full((h, w), 255, float)
    alpha[outside] = 0
    alpha[ring] = np.clip(lum[ring] / cream_lum * 255, 0, 255)
    rgb = rgb.astype(np.uint8)
    rgb[band | outside] = CREAM
    tile = Image.fromarray(np.dstack([rgb, alpha.astype(np.uint8)]), "RGBA")
    return tile.crop(tile.getchannel("A").point(lambda v: 255 if v > 0 else 0).getbbox())


def on_cream(tile, canvas, scale):
    """クリーム色の正方形の中央に、タイル（角も、クリーム色で埋める）を、scale倍で置く。
    透明度つきの画像を縮小すると、縁がにじんで線が出るため、元の大きさで重ねてから、縮小する"""
    full = tile.size[0]
    big = Image.new("RGB", (round(full / scale), round(full / scale)), CREAM)
    off = (big.size[0] - full) // 2
    big.paste(tile, (off, off), tile)
    return big.resize((canvas, canvas), Image.LANCZOS)


def main():
    tile = load_tile()
    for size in (512, 192):
        tile.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)
    # 絵が、タイルの左右の約4%〜96%に広がるため、安全領域（中央80%）に収めるには、約0.88倍にする
    on_cream(tile, 512, 0.88).save(OUT / "icon-maskable-512.png", optimize=True)
    on_cream(tile, 180, 0.94).save(OUT / "apple-touch-icon.png", optimize=True)
    for size in (32, 16):
        tile.resize((size, size), Image.LANCZOS).save(OUT / f"favicon-{size}.png", optimize=True)
    tile.resize((48, 48), Image.LANCZOS).save(OUT / "favicon.ico", sizes=[(48, 48), (32, 32), (16, 16)])
    print("生成しました:", ", ".join(sorted(p.name for p in OUT.glob("*.png")) + ["favicon.ico"]))


if __name__ == "__main__":
    main()
