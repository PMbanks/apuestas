"""Prepara la imagen de las cajas nuevas que dibujo Gemini: quita la franja con el nombre de abajo, quita el fondo oscuro y las guarda como webp con
transparencia (como las de las cajas de lujo viejas) en app/img/lujo/cajas/.
  python sync/cajas-gemini.py <carpeta de Gemini (sueltas)> <carpeta de salida> <gemini:id> ...     p. ej.  gaming:gaming  zapatillas:zapatillas-2026
Necesita rembg y Pillow (U2NET_HOME apuntando fuera de C: si hace falta). Los originales son 320x320 con la caja arriba y el nombre en letras blancas abajo."""
import sys, os
from PIL import Image
from rembg import remove, new_session

entrada, salida, pares = sys.argv[1], sys.argv[2], sys.argv[3:]
CORTE = 276            # donde acaba la caja: de ahi para abajo esta el nombre
LADO = 360             # cuadrado final (las tarjetas de la app las muestran con object-fit contain)
# arreglos de los originales: en joyas y cripto quedo el puntero del raton de la captura de la hoja (se borra: lo que no tiene color dentro de ese recuadro, repintado
# con lo de alrededor); en streetwear y motor la caja es casi negra o roja y rembg se la comeria: el fondo (oscuro y liso) se quita rellenando desde los bordes
PUNTERO = {'joyas': (189, 212, 228, 268), 'cripto': (188, 234, 228, 280)}
FONDO = {'streetwear': 14, 'motor': 18}; CIERRE = {14: 141}      # tolerancia del color del fondo oscuro
def sin_puntero(im, caja):
    import numpy as np, cv2
    x0, y0, x1, y1 = caja
    a = np.array(im); sub = a[y0:y1, x0:x1].astype(int)
    m = ((sub.max(axis=2) - sub.min(axis=2)) < 45).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    mask = np.zeros(a.shape[:2], np.uint8); mask[y0:y1, x0:x1] = m
    return Image.fromarray(cv2.inpaint(a, mask, 4, cv2.INPAINT_TELEA))
def quita_fondo(im, tol):
    import numpy as np, cv2
    a = np.array(im)[:, :, ::-1].copy(); h, w = a.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(0, w, 6):
        for y in (0, h - 1):
            if not mask[y + 1, x + 1]: cv2.floodFill(a.copy(), mask, (x, y), 0, (tol,) * 3, (tol,) * 3, 4 | cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    for y in range(0, h, 6):
        for x in (0, w - 1):
            if not mask[y + 1, x + 1]: cv2.floodFill(a.copy(), mask, (x, y), 0, (tol,) * 3, (tol,) * 3, 4 | cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    fondo = mask[1:-1, 1:-1]
    alfa = 255 - fondo
    alfa = cv2.morphologyEx(alfa, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if tol in CIERRE: alfa[350:] = cv2.morphologyEx(alfa, cv2.MORPH_CLOSE, np.ones((CIERRE[tol],) * 2, np.uint8))[350:]   # el cuerpo negro de la caja de Streetwear se parece al fondo: se rellena
    n, lab, st, _ = cv2.connectedComponentsWithStats((alfa > 0).astype(np.uint8), connectivity=8)   # solo la pieza grande y lo que le toca de cerca
    grande = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    cerca = cv2.dilate((lab == grande).astype(np.uint8), np.ones((31, 31), np.uint8))
    alfa = np.where(cerca > 0, alfa, 0).astype(np.uint8)
    return Image.fromarray(cv2.GaussianBlur(alfa, (5, 5), 1.2))
sesion = new_session('isnet-general-use')
for par in pares:
    gem, caja = par.split(':')
    im = Image.open(os.path.join(entrada, gem + '.webp')).convert('RGB')
    if gem in PUNTERO: im = sin_puntero(im, PUNTERO[gem])
    im = im.crop((0, 0, 320, CORTE))
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)      # rembg trabaja mejor con mas pixeles
    if gem in FONDO:
        cut = im.convert('RGBA'); cut.putalpha(quita_fondo(im, FONDO[gem]))
    else:
        cut = remove(im, session=sesion, post_process_mask=True)
    box = cut.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        print('SIN CAJA:', gem); continue
    cut = cut.crop(box)
    esc = (LADO - 24) / max(cut.size)
    cut = cut.resize((max(1, round(cut.width * esc)), max(1, round(cut.height * esc))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    lienzo.alpha_composite(cut, ((LADO - cut.width) // 2, (LADO - cut.height) // 2))
    lienzo.save(os.path.join(salida, caja + '.webp'), 'WEBP', quality=88, method=6, exact=True)
    print('%-12s -> %s.webp' % (gem, caja))
