"""Dibuja la imagen de cada caja de lujo al estilo de las paginas de cajas (EmpireDrops y parecidas): el objeto estrella, grande y recortado, en medio,
con un brillo del color de la categoria detras, y otros dos objetos de la caja a los lados, mas pequenos y algo girados, un poco por detras.
Sin fondo (transparente), 640x480 (4:3 como las cajas de CS2). Las guarda en <salida>/cajas/<id sin "lujo-">.webp.
Lo lanza sync/lujo-imagenes.mjs:  python sync/lujo-cajas.py <carpeta app/img/lujo> <id:color:centro+lado+lado> ...
  color: oro, verde, azul, morado o rojo.  centro y lados: nombre del webp recortado (sin .webp), sin "lujo-".
Necesita Pillow y numpy."""
import sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

LUZ = {'oro': (255, 196, 58), 'verde': (62, 226, 112), 'azul': (72, 160, 255), 'morado': (192, 96, 255), 'rojo': (255, 72, 72)}
W, H = 640, 480

def radial(cx, cy, rx, ry, color, fuerza=1.0, caida=1.6):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.clip(np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1)
    a = ((1 - d) ** caida * fuerza * 255).clip(0, 255).astype(np.uint8)
    im = Image.new('RGBA', (W, H), tuple(color) + (0,))
    im.putalpha(Image.fromarray(a, 'L'))
    return im

def chispa(d, x, y, r, a=235):
    pts = []
    for k in range(8):
        rr = r if k % 2 == 0 else r * 0.2
        ang = k * math.pi / 4
        pts.append((x + rr * math.cos(ang), y + rr * math.sin(ang)))
    d.polygon(pts, fill=(255, 255, 255, a))

def pon(lienzo, foto, caja, cx, base, giro=0, brillo=1.0):
    """pega un objeto dentro de `caja` (ancho, alto), centrado en cx y con la base en `base`; giro en grados; con sombra"""
    f = Image.open(foto).convert('RGBA')
    k = min(caja[0] / f.width, caja[1] / f.height)
    f = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS)
    if giro:
        f = f.rotate(giro, resample=Image.BICUBIC, expand=True)
    if brillo != 1.0:
        rgb = f.convert('RGB').point(lambda v: int(v * brillo)); rgb.putalpha(f.getchannel('A')); f = rgb
    x, y = round(cx - f.width / 2), round(base - f.height)
    sombra = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
    sombra.paste(Image.new('RGBA', f.size, (0, 0, 0, 255)), (x + 3, y + 10), f.getchannel('A').point(lambda v: int(v * 0.5)))
    lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(9)))
    # un filo de luz alrededor del objeto para que se lea sobre cualquier fondo
    lienzo.alpha_composite(f, (x, y))

def dibuja(color, fotos):
    luz = LUZ[color]
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    centro, izq, der = fotos
    # brillo del color detras de todo
    lienzo.alpha_composite(radial(W / 2, H * 0.47, W * 0.50, H * 0.44, luz, 0.70, 1.5))
    lienzo.alpha_composite(radial(W / 2, H * 0.52, W * 0.27, H * 0.30, (255, 255, 255), 0.30, 1.9))
    # suelo
    suelo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(suelo).ellipse((W * 0.17, H * 0.84, W * 0.83, H * 0.96), fill=(0, 0, 0, 120))
    lienzo.alpha_composite(suelo.filter(ImageFilter.GaussianBlur(11)))
    base = H * 0.90
    pon(lienzo, izq, (W * 0.27, H * 0.42), W * 0.135, base - 4, giro=6, brillo=0.88)
    pon(lienzo, der, (W * 0.27, H * 0.42), W * 0.865, base - 4, giro=-6, brillo=0.88)
    pon(lienzo, centro, (W * 0.54, H * 0.72), W / 2, base)
    # destellos
    rnd = random.Random(centro)
    ch = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(ch)
    for _ in range(8):
        chispa(dc, rnd.uniform(W * 0.1, W * 0.9), rnd.uniform(H * 0.08, H * 0.66), rnd.choice([7, 9, 12, 15]))
    lienzo.alpha_composite(ch.filter(ImageFilter.GaussianBlur(0.7)))
    lienzo.alpha_composite(ch.filter(ImageFilter.GaussianBlur(6)))
    return lienzo

if __name__ == '__main__':
    carpeta = sys.argv[1]
    os.makedirs(os.path.join(carpeta, 'cajas'), exist_ok=True)
    for spec in sys.argv[2:]:
        slug, color, objetos = spec.split(':')
        fotos = [os.path.join(carpeta, o + '.webp') for o in objetos.split('+')]
        im = dibuja(color, fotos)
        dest = os.path.join(carpeta, 'cajas', slug + '.webp')
        im.save(dest, 'WEBP', quality=90, method=6, exact=True)
        print('caja %-26s %dx%d %d KB' % (slug, im.width, im.height, os.path.getsize(dest) // 1024))
