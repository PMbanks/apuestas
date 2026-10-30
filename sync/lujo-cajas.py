"""Dibuja la imagen de cada caja de lujo, como las de las paginas de cajas: una caja de CS2 de verdad (la Horizon Case, de la CDN de Steam,
en 3D y con tapa) recolorada con el color de la categoria, un aura de luz con rayos detras, el objeto estrella recortado saliendo por encima de
la tapa y un sello con una estrella en la cara de delante. Las guarda en <salida>/cajas/<id sin "lujo-">.webp (460x480, transparente).
Lo lanza sync/lujo-imagenes.mjs:  python sync/lujo-cajas.py <carpeta app/img/lujo> <id:color:emblema:anillo> ...
  color: oro (el original), verde, azul, morado o rojo.  emblema: nombre del webp recortado (sin .webp).  anillo: plata u oro (el aro del sello).
Necesita Pillow y numpy. CAJA_BASE_DIR: carpeta donde guardar/leer horizon-base.png (si no esta, se baja de Steam)."""
import sys, os, io, math, random, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

BASE = 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3IV6vSrbfw8eaiWCjWVkewgseM9TXyxl0wi6mSHn9-tIHqUbg5yDpEmEPlK7EcXFmSLsw/512fx512f'
ORIGEN_H = 42                                   # tono (en grados) del amarillo de la caja original
TONO = {'oro': None, 'verde': 128, 'azul': 212, 'morado': 282, 'rojo': 352}
LUZ = {'oro': (255, 204, 64), 'verde': (70, 235, 120), 'azul': (80, 165, 255), 'morado': (200, 100, 255), 'rojo': (255, 80, 70)}
ANILLO = {'oro': ((246, 214, 120), (176, 128, 40)), 'plata': ((232, 236, 244), (132, 140, 156))}   # claro, oscuro
ESCALA = 1.6                                    # la caja de Steam mide ~240 px de ancho: se agranda un poco
SS = 4                                          # supermuestreo del sello
W, H = 460, 480                                 # lienzo final
CAJA_X, CAJA_Y = 31, 169                        # donde va la caja de 398x299 dentro del lienzo
CX, CY, R = 124, 166, 60                        # centro y radio del sello sobre la cara frontal de la caja (coordenadas de la caja)
HERO_W, HERO_H = 250, 205                       # el objeto estrella cabe en este rectangulo
HERO_BASE = CAJA_Y + 78                         # y de la base del objeto: se mete un poco en la tapa

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
    return im.resize((round(im.width * ESCALA), round(im.height * ESCALA)), Image.LANCZOS)

def recolorea(im, color):
    grados = TONO[color]
    a = im.getchannel('A')
    hsv = np.array(im.convert('RGB').convert('HSV')).astype(np.int32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if grados is not None:
        mover = (s > 55) & (v > 45)             # solo lo amarillo: el candado, las bisagras y la mugre oscura se quedan
        hsv[..., 0] = np.where(mover, (h + round((grados - ORIGEN_H) * 255 / 360)) % 256, h)
    hsv[..., 2] = np.clip(v * 1.08, 0, 255)     # un punto mas de brillo: que parezca nueva
    hsv[..., 1] = np.clip(s * 1.05, 0, 255)
    out = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB').convert('RGBA')
    out.putalpha(a)
    return out

def radial(w, h, cx, cy, radio, color, fuerza=1.0, caida=1.7):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.clip(np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / radio, 0, 1)
    a = ((1 - d) ** caida * fuerza * 255).clip(0, 255).astype(np.uint8)
    im = Image.new('RGBA', (w, h), color + (0,))
    im.putalpha(Image.fromarray(a, 'L'))
    return im

def rayos(color, cx, cy, n=16, largo=330):
    capa = Image.new('RGBA', (W, H), color + (0,))
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for k in range(n):
        ang = k * 2 * math.pi / n + 0.12
        ab = math.pi / n * 0.55
        d.polygon([(cx, cy), (cx + largo * math.cos(ang - ab), cy + largo * math.sin(ang - ab)), (cx + largo * math.cos(ang + ab), cy + largo * math.sin(ang + ab))], fill=70)
    m = m.filter(ImageFilter.GaussianBlur(2.5))
    fade = radial(W, H, cx, cy, largo, (0, 0, 0), 1.0, 0.9).getchannel('A')
    capa.putalpha(ImageChops.multiply(m, fade))
    return capa

def estrella(d, cx, cy, r1, r2, fill, n=5, rot=-math.pi / 2):
    pts = []
    for k in range(2 * n):
        r = r1 if k % 2 == 0 else r2
        a = rot + k * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=fill)

def sello(color, anillo):
    D = 2 * R * SS
    img = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    mask = Image.new('L', (D, D), 0); ImageDraw.Draw(mask).ellipse((0, 0, D - 1, D - 1), fill=255)
    n = np.linspace(0, 1, D)
    g = (n[None, :] * 0.5 + n[:, None] * 0.5)[..., None]
    c1, c2 = ANILLO[anillo]
    arr = (np.array(c1)[None, None, :] * (1 - g) + np.array(c2)[None, None, :] * g).astype(np.uint8)
    img.paste(Image.fromarray(arr, 'RGB').convert('RGBA'), (0, 0), mask)
    dentro = round(D * 0.84); o = (D - dentro) // 2
    m2 = Image.new('L', (D, D), 0); ImageDraw.Draw(m2).ellipse((o, o, o + dentro, o + dentro), fill=255)
    yy, xx = np.mgrid[0:D, 0:D]
    dist = np.sqrt((xx - D / 2) ** 2 + (yy - D / 2) ** 2) / (D / 2)
    fondo = np.zeros((D, D, 3), np.float32)
    base = np.array(color, np.float32) * 0.28
    fondo[...] = base[None, None, :] * (1.15 - 0.9 * dist)[..., None] + np.array([10, 10, 14], np.float32)
    img.paste(Image.fromarray(fondo.clip(0, 255).astype(np.uint8), 'RGB').convert('RGBA'), (0, 0), m2)
    # estrella con brillo
    glow = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    estrella(ImageDraw.Draw(glow), D / 2, D / 2 + SS, D * 0.30, D * 0.125, color + (255,))
    halo = glow.filter(ImageFilter.GaussianBlur(SS * 4))
    img.alpha_composite(halo)
    est = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    estrella(ImageDraw.Draw(est), D / 2, D / 2 + SS, D * 0.27, D * 0.115, (255, 255, 255, 255))
    img.alpha_composite(est)
    tinte = Image.new('RGBA', (D, D), color + (90,)); tinte.putalpha(ImageChops.multiply(est.getchannel('A'), Image.new('L', (D, D), 90)))
    img.alpha_composite(tinte)
    img.putalpha(ImageChops.multiply(img.getchannel('A'), mask))
    out = img.resize((2 * R, 2 * R), Image.LANCZOS)
    return out.resize((round(2 * R * 0.93), 2 * R), Image.LANCZOS)       # un poco estrechado: la cara frontal esta de lado

def dibuja(caja_base, slug, color, foto, anillo):
    luz = LUZ[color]
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hero = Image.open(foto).convert('RGBA')
    k = min(HERO_W / hero.width, HERO_H / hero.height)
    hero = hero.resize((max(1, round(hero.width * k)), max(1, round(hero.height * k))), Image.LANCZOS)
    hx, hy = (W - hero.width) // 2, HERO_BASE - hero.height
    centro_y = hy + hero.height // 2
    # sombra en el suelo
    suelo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(suelo).ellipse((CAJA_X + 8, CAJA_Y + 262, CAJA_X + 392, CAJA_Y + 308), fill=(0, 0, 0, 120))
    lienzo.alpha_composite(suelo.filter(ImageFilter.GaussianBlur(9)))
    # aura y rayos detras de todo
    lienzo.alpha_composite(radial(W, H, W / 2, centro_y + 20, 250, luz, 0.80, 1.5))
    lienzo.alpha_composite(rayos(luz, W / 2, centro_y + 30))
    # la caja
    lienzo.alpha_composite(caja_base, (CAJA_X, CAJA_Y))
    sel = sello(luz, anillo)
    sombra = Image.new('RGBA', sel.size, (0, 0, 0, 0)); sombra.putalpha(sel.getchannel('A').point(lambda v: int(v * 0.5)))
    pos = (CAJA_X + CX - sel.width // 2, CAJA_Y + CY - sel.height // 2)
    lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(3)), (pos[0] + 2, pos[1] + 4))
    lienzo.alpha_composite(sel, pos)
    # luz que se escapa por la tapa
    lienzo.alpha_composite(radial(W, H, W / 2, CAJA_Y + 62, 150, (255, 255, 255), 0.55, 2.2))
    lienzo.alpha_composite(radial(W, H, W / 2, CAJA_Y + 62, 190, luz, 0.65, 1.6))
    # el objeto: resplandor de su color, sombra sobre la tapa y el objeto
    sil = Image.new('RGBA', (W, H), luz + (0,))
    sa = Image.new('L', (W, H), 0); sa.paste(hero.getchannel('A'), (hx, hy))
    sil.putalpha(sa)
    lienzo.alpha_composite(Image.merge('RGBA', (*sil.split()[:3], sa.filter(ImageFilter.GaussianBlur(16)).point(lambda v: min(255, int(v * 1.6))))))
    lienzo.alpha_composite(Image.merge('RGBA', (*Image.new('RGBA', (W, H), (255, 255, 255, 0)).split()[:3], sa.filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.55)))))
    sb = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sb.paste(Image.new('RGBA', hero.size, (0, 0, 0, 255)), (hx + 4, hy + 12), hero.getchannel('A').point(lambda v: int(v * 0.45)))
    lienzo.alpha_composite(sb.filter(ImageFilter.GaussianBlur(7)))
    lienzo.alpha_composite(hero, (hx, hy))
    # destellos
    rnd = random.Random(slug)
    chispas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(chispas)
    for _ in range(11):
        x = rnd.uniform(W * 0.14, W * 0.86); y = rnd.uniform(centro_y - hero.height * 0.75, CAJA_Y + 40)
        r = rnd.choice([5, 7, 9, 12])
        estrella(dc, x, y, r, r * 0.22, (255, 255, 255, 235), n=4, rot=0)
    lienzo.alpha_composite(chispas.filter(ImageFilter.GaussianBlur(0.6)))
    lienzo.alpha_composite(chispas.filter(ImageFilter.GaussianBlur(5)))
    # recorta lo que sobre alrededor y deja el lienzo con margen pequeño
    return lienzo

carpeta = sys.argv[1]
os.makedirs(os.path.join(carpeta, 'cajas'), exist_ok=True)
gris = base_caja()
for spec in sys.argv[2:]:
    slug, color, emblema, anillo = spec.split(':')
    im = dibuja(recolorea(gris, color), slug, color, os.path.join(carpeta, emblema + '.webp'), anillo)
    dest = os.path.join(carpeta, 'cajas', slug + '.webp')
    im.save(dest, 'WEBP', quality=88, method=6, exact=True)
    print('caja %-26s %dx%d %d KB' % (slug, im.width, im.height, os.path.getsize(dest) // 1024))
