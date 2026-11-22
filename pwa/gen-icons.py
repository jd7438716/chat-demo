"""生成 PWA 图标（DeepSeek 品牌蓝 + 白色对话气泡）。用法：python gen-icons.py"""

from pathlib import Path

from PIL import Image, ImageDraw

BRAND = (77, 107, 254, 255)  # #4D6BFE
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).parent


def bubble(size: int, *, full_bleed: bool, content_scale: float) -> Image.Image:
    """画一张图标。full_bleed=True 时底色铺满（供 iOS / maskable 遮罩使用）。"""
    ss = 4  # 超采样，边缘更干净
    s = size * ss
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if full_bleed:
        d.rectangle([0, 0, s, s], fill=BRAND)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BRAND)

    # 以画布中心为基准缩放内容
    cx, cy = s / 2, s / 2
    half = s * content_scale / 2
    left, right = cx - half, cx + half
    top, bottom = cy - half * 0.82, cy + half * 0.82

    # 气泡主体
    d.rounded_rectangle(
        [left, top, right, bottom * 0.92],
        radius=int((right - left) * 0.22),
        fill=WHITE,
    )
    # 气泡小尾巴（左下）
    tail_w = (right - left) * 0.16
    tail_h = (bottom - top) * 0.16
    d.polygon(
        [
            (left + (right - left) * 0.20, bottom * 0.90),
            (left + (right - left) * 0.20 + tail_w, bottom * 0.90),
            (left + (right - left) * 0.20, bottom * 0.90 + tail_h),
        ],
        fill=WHITE,
    )
    # 三个点
    r = (right - left) * 0.075
    dot_y = (top + bottom * 0.92) / 2
    for i, fx in enumerate((0.30, 0.50, 0.70)):
        dx = left + (right - left) * fx
        d.ellipse([dx - r, dot_y - r, dx + r, dot_y + r], fill=BRAND)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    (OUT / "icons").mkdir(exist_ok=True)
    specs = [
        ("icon-192.png", 192, False, 0.74),
        ("icon-512.png", 512, False, 0.74),
        ("icon-maskable-512.png", 512, True, 0.60),  # 安全区：内容只占中心 60%
        ("apple-touch-icon-180.png", 180, True, 0.82),
        ("favicon-32.png", 32, False, 0.86),
    ]
    for name, size, bleed, scale in specs:
        img = bubble(size, full_bleed=bleed, content_scale=scale)
        img.save(OUT / "icons" / name, optimize=True)
        print(f"{name:28s} {size}x{size}  {bleed=} {scale=}")


if __name__ == "__main__":
    main()
