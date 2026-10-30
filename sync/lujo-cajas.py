"""Dibuja la imagen de cada caja de lujo: una caja de CS2 de verdad (la Horizon Case, de la CDN de Steam, en 3D y con tapa) recolorada con el color
de la categoria y, en el centro de la cara de delante, dentro de un marco con un poco de luz detras, tres de los objetos que trae: el mas raro,
grande, en medio y uno a cada lado, mas pequenos. Nada sale por encima de la tapa. Las guarda en <salida>/cajas/<id sin "lujo-">.webp (460x480, transparente).
Lo lanza sync/lujo-imagenes.mjs:  python sync/lujo-cajas.py <carpeta app/img/lujo> <id:color:centro+lado+lado> ...
  color: oro (el original), verde, azul, morado o rojo.  centro y lados: nombre del webp recortado (sin .webp), sin "lujo-".
Necesita Pillow y numpy. CAJA_BASE_DIR: carpeta donde guardar/leer horizon-base.png (si no esta, se baja de Steam)."""
import sys, os, io, math, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

BASE = 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3IV6vSrbfw8eaiWCjWVkewgseM9TXyxl0wi6mSHn9-tIHqUbg5yDpEmEPlK7EcXFmSLsw/512fx512f'
ORIGEN_H = 42                                   # tono (en grados) del amarillo de la caja original
TONO = {'oro': None, 'verde': 128, 'azul': 212, 'morado': 282, 'rojo': 352}
LUZ = {'oro': (255, 204, 64), 'verde': (70, 235, 120), 'azul': (80, 165, 255), 'morado': (200, 100, 255), 'rojo': (255, 80, 70)}
W, H = 460, 480                                 # lienzo final
ANCHO_CAJA = 440                                # la caja se agranda hasta este ancho
CAJA_X = (W - ANCHO_CAJA) // 2
CAJA_Y = 118                                    # arriba de la caja (la tapa); debajo queda la sombra
# marco de la cara de delante, en fracciones de la caja ya agrandada
MARCO = (0.112, 0.395, 0.572, 0.885)            # izquierda, arriba, derecha, abajo

def base_caja():
    cache = os.path.join(os.environ.get('CAJA_BASE_DIR', '.'), 'horizon-base.png')
    if os.path.exists(cache):
        im = Image.open(cache).convert('RGBA')
    else:
        req = urllib.request.Request(BASE, headers={'User-Agent': 'apuestas-colegas/1.0'})
        data = urllib.request.urlopen(req, timeout=30).read()
        open(cache, 'wb').write(data)
        im = Image.open(io.BytesIO(data)).convert('RGBA')
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop((box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4))
    k = ANCHO_CAJA / im.width
    return im.resize((ANCHO_CAJA, round(im.height * k)), Image.LANCZOS)

def recolorea(im, color):
    grados = TONO[color]
    a = im.getchannel('A')
    hsv = np.array(im.convert('RGB').convert('HSV')).astype(np.int32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if grados is not None:
        mover = (s > 55) & (v > 45)             # solo lo amarillo: el candado, las bisagras y la mugre oscura se quedan
        hsv[..., 0] = np.where(mover, (h + round((grados - ORIGEN_H) * 255 / 360)) % 256, h)
    hsv[..., 2] = np.clip(v * 1.08, 0, 255)
    hsv[..., 1] = np.clip(s * 1.05, 0, 255)
    out = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB').convert('RGBA')
    out.putalpha(a)
    return out

def radial(w, h, cx, cy, rx, ry, color, fuerza=1.0, caida=1.7):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.clip(np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1)
    a = ((1 - d) ** caida * fuerza * 255).clip(0, 255).astype(np.uint8)
    im = Image.new('RGBA', (w, h), tuple(color) + (0,))
    im.putalpha(Image.fromarray(a, 'L'))
    return im

def rayos(color, cx, cy, n=16, largo=300):
    capa = Image.new('RGBA', (W, H), tuple(color) + (0,))
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for k in range(n):
        ang = k * 2 * math.pi / n + 0.12
        ab = math.pi / n * 0.5
        d.polygon([(cx, cy), (cx + largo * math.cos(ang - ab), cy + largo * math.sin(ang - ab)), (cx + largo * math.cos(ang + ab), cy + largo * math.sin(ang + ab))], fill=46)
    m = m.filter(ImageFilter.GaussianBlur(2.5))
    fade = radial(W, H, cx, cy, largo, largo, (0, 0, 0), 1.0, 0.9).getchannel('A')
    capa.putalpha(ImageChops.multiply(m, fade))
    return capa

def pon(lienzo, foto, caja, base_x, base_y):
    """pega un objeto dentro de `caja` (ancho, alto), centrado en base_x y con su base en base_y, con su sombra"""
    f = Image.open(foto).convert('RGBA')
    k = min(caja[0] / f.width, caja[1] / f.height)
    f = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS)
    x, y = round(base_x - f.width / 2), round(base_y - f.height)
    sombra = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
    sombra.paste(Image.new('RGBA', f.size, (0, 0, 0, 255)), (x + 2, y + 5), f.getchannel('A').point(lambda v: int(v * 0.5)))
    lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(4)))
    lienzo.alpha_composite(f, (x, y))

def dibuja(caja_img, color, fotos):
    luz = LUZ[color]
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ch = caja_img.height
    # sombra en el suelo y aura de luz detras de la caja
    suelo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(suelo).ellipse((CAJA_X + 6, CAJA_Y + ch - 62, CAJA_X + ANCHO_CAJA - 6, CAJA_Y + ch + 4), fill=(0, 0, 0, 125))
    lienzo.alpha_composite(suelo.filter(ImageFilter.GaussianBlur(9)))
    lienzo.alpha_composite(radial(W, H, W / 2, CAJA_Y + ch * 0.5, 235, 215, luz, 0.55, 1.5))
    lienzo.alpha_composite(rayos(luz, W / 2, CAJA_Y + ch * 0.5))
    lienzo.alpha_composite(caja_img, (CAJA_X, CAJA_Y))
    # el marco de la cara de delante
    ml, mt, mr, mb = MARCO
    x0, y0 = CAJA_X + round(ml * ANCHO_CAJA), CAJA_Y + round(mt * ch)
    x1, y1 = CAJA_X + round(mr * ANCHO_CAJA), CAJA_Y + round(mb * ch)
    pw, ph = x1 - x0, y1 - y0
    SS = 3
    placa = Image.new('RGBA', (pw * SS, ph * SS), (0, 0, 0, 0))
    m = Image.new('L', placa.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, placa.width - 1, placa.height - 1), radius=14 * SS, fill=255)
    yy, xx = np.mgrid[0:placa.height, 0:placa.width]
    d = np.clip(np.sqrt(((xx - placa.width / 2) / (placa.width * 0.62)) ** 2 + ((yy - placa.height * 0.55) / (placa.height * 0.7)) ** 2), 0, 1)
    fondo = np.zeros((placa.height, placa.width, 3), np.float32)
    fondo[...] = (np.array(luz, np.float32) * 0.55)[None, None, :] * ((1 - d) ** 1.4)[..., None] + np.array([16, 16, 22], np.float32)
    placa.paste(Image.fromarray(fondo.clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA'), (0, 0), m)
    aro = Image.new('RGBA', placa.size, (0, 0, 0, 0)); ImageDraw.Draw(aro).rounded_rectangle((0, 0, placa.width - 1, placa.height - 1), radius=14 * SS, outline=(235, 238, 245, 210), width=2 * SS)
    placa.alpha_composite(aro)
    placa = placa.resize((pw, ph), Image.LANCZOS)
    sombra = Image.new('RGBA', placa.size, (0, 0, 0, 0)); sombra.putalpha(placa.getchannel('A').point(lambda v: int(v * 0.5)))
    lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(3)), (x0 + 1, y0 + 3))
    lienzo.alpha_composite(placa, (x0, y0))
    # luz detras de los objetos y los objetos: los de los lados, mas pequenos y detras; el de en medio, grande y delante
    cx, base = x0 + pw / 2, y1 - 7
    luzobj = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    luzobj.alpha_composite(radial(W, H, cx, y0 + ph * 0.52, pw * 0.50, ph * 0.52, (255, 255, 255), 0.50, 1.8))
    luzobj.alpha_composite(radial(W, H, cx, y0 + ph * 0.52, pw * 0.56, ph * 0.60, luz, 0.65, 1.4))
    recorte = Image.new('L', (W, H), 0); recorte.paste(placa.getchannel('A'), (x0, y0))
    luzobj.putalpha(ImageChops.multiply(luzobj.getchannel('A'), recorte))
    lienzo.alpha_composite(luzobj)
    centro, izq, der = fotos
    pon(lienzo, izq, (pw * 0.46, ph * 0.54), cx - pw * 0.30, base - 3)
    pon(lienzo, der, (pw * 0.46, ph * 0.54), cx + pw * 0.30, base - 3)
    pon(lienzo, centro, (pw * 0.70, ph * 0.86), cx, base)
    return lienzo

if __name__ == '__main__':
    carpeta = sys.argv[1]
    os.makedirs(os.path.join(carpeta, 'cajas'), exist_ok=True)
    gris = base_caja()
    for spec in sys.argv[2:]:
        slug, color, objetos = spec.split(':')
        fotos = [os.path.join(carpeta, o + '.webp') for o in objetos.split('+')]
        im = dibuja(recolorea(gris, color), color, fotos)
        dest = os.path.join(carpeta, 'cajas', slug + '.webp')
        im.save(dest, 'WEBP', quality=88, method=6, exact=True)
        print('caja %-26s %dx%d %d KB' % (slug, im.width, im.height, os.path.getsize(dest) // 1024))
