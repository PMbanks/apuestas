"""Quita el fondo a las fotos de los objetos de lujo, las encuadra sin bordes vacios y las guarda en webp con transparencia.
Lo lanza sync/lujo-imagenes.mjs:  python sync/lujo-recorte.py <carpeta de originales> <carpeta de salida> <slug> [<slug> ...]
Necesita rembg y Pillow. El modelo (isnet-general-use) se baja solo la primera vez a U2NET_HOME."""
import sys, os
from PIL import Image
from rembg import remove, new_session

MAX = 512
orig, out, slugs = sys.argv[1], sys.argv[2], sys.argv[3:]
sesion = new_session('isnet-general-use')
for slug in slugs:
    im = Image.open(os.path.join(orig, slug + '.src'))
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if max(im.size) > 1400:
        im.thumbnail((1400, 1400), Image.LANCZOS)
    cut = remove(im, session=sesion, post_process_mask=True)
    alpha = cut.getchannel('A')
    # lo que queda de ruido suelto se limpia: solo cuenta lo bastante opaco
    caja = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not caja:
        print('SIN OBJETO:', slug); continue
    cut = cut.crop(caja)
    cobertura = sum(1 for v in cut.getchannel('A').getdata() if v > 24) / (cut.width * cut.height)
    esc = MAX / max(cut.size)
    cut = cut.resize((max(1, round(cut.width * esc)), max(1, round(cut.height * esc))), Image.LANCZOS)
    cut.save(os.path.join(out, slug + '.webp'), 'WEBP', quality=84, method=6, exact=True)
    print('%-28s %4dx%-4d cobertura %.0f%%%s' % (slug, cut.width, cut.height, cobertura * 100, '  <-- REVISAR' if cobertura < 0.3 else ''))
