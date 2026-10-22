# PPTX-ийг нийтэд хүргэх CyberMath хувилбар болгоно (эх файлд ХҮРЭХГҮЙ — шинэ файл бичнэ).
#   python -I tools/ppt/brand.py <оролт.pptx> <гаралт.pptx>
#
#  1. Хувийн мэдээлэл: «Багш: …Бямбадорж» мөрийг устгана, «Цонжин Кибер Боардинг …» → «cyber-math.com»,
#     «ЦКБС» → «CyberMath», docProps-ийн зохиогч/байгууллага → CyberMath.
#  2. Өнгө аяс: Tsonjin (хар хөх + далайн ногоон) → CyberMath (гүн нил ягаан + #7B52EE + лаванда).
#     XML-ийн srgbClr, theme, гарчгийн слайдын дэвсгэр (градиент), харанхуй дэвсгэр дээрх accent текст.
#  3. Зураг (ppt/media/*.png — тэгшитгэл, график): ногоон/далайн ногоон → ягаан, хар хөх → нил ягаан
#     (HSV-ээр өнгө аясыг нь эргүүлнэ — anti-alias ирмэг хэвээр).
import sys, re, io, zipfile
import numpy as np
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]

# ── өнгө ──
EXPLICIT = {
    '16235E': '241552',  # үндсэн текст (dk1)
    '101A44': '1C1240',  # гарчгийн слайдын дэвсгэр (dk2)
    '00A17F': '7B52EE',  # accent1 — CyberMath ягаан
    '00866A': '5A32D6', '008667': '5A32D6',  # бараан accent текст
    'E3F4EE': 'F3EEFF',  # самбар
    'D7F0E6': 'EAE2FF',  # хариуны хайрцаг
    'EAF4F0': 'F1EEF8',  # lt2
    'F2F5FA': 'F7F5FC', 'EEF3F9': 'F4F1FB',  # картын дэвсгэр
    'D5DEEA': 'E3DCF3', 'C9D3E0': 'DAD2EC',  # хүрээ
    'C9D6E8': 'D9CEF5',  # харанхуй дэвсгэр дээрх цайвар текст
    '5F7084': '6B6590',  # туслах саарал текст (accent6)
    '7A5AF8': 'A855F7',  # accent5
}
KEEP = {'FFFFFF', '000000', 'D6336C', 'FBEFF3', 'C2570C', 'E8900C', '0E8BB8'}
DARK_TEXT_ACCENT = 'C4B5FD'   # харанхуй дэвсгэр дээрх accent1 текст (уншигдахуйц цайвар нил ягаан)
TITLE_BG = ('<p:bgPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="1A1040"/></a:gs>'
            '<a:gs pos="100000"><a:srgbClr val="3B1D8F"/></a:gs></a:gsLst><a:lin ang="2700000" scaled="0"/></a:gradFill>'
            '<a:effectLst/></p:bgPr>')

def hex_to_hsv(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mx, mn = max(r, g, b), min(r, g, b); d = mx - mn
    if d == 0: hh = 0
    elif mx == r: hh = (60 * ((g - b) / d)) % 360
    elif mx == g: hh = 60 * ((b - r) / d) + 120
    else: hh = 60 * ((r - g) / d) + 240
    return hh, (0 if mx == 0 else d / mx), mx

def hsv_to_hex(h, s, v):
    c = v * s; x = c * (1 - abs((h / 60) % 2 - 1)); m = v - c
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return '%02X%02X%02X' % tuple(round((u + m) * 255) for u in (r, g, b))

def map_hsv(h, s, v):
    """Ерөнхий дүрэм (EXPLICIT-д байхгүй өнгө, зургийн пиксел): ногоон/далайн ногоон → ягаан, хар хөх → нил ягаан."""
    if s > 0.12 and 140 <= h <= 200: return 258.0, s * 0.8, v + (1 - v) * 0.6
    if s > 0.15 and 205 <= h <= 238: return 252.0, s * 0.92, v
    return h, s, v

def map_hex(hx):
    hx = hx.upper()
    if hx in EXPLICIT: return EXPLICIT[hx]
    if hx in KEEP: return hx
    return hsv_to_hex(*map_hsv(*hex_to_hsv(hx)))

# ── текст ──
def a_text(p): return ''.join(re.findall(r'<a:t>([^<]*)</a:t>', p))

def scrub_paragraph(m):
    p = m.group(0); t = a_text(p)
    if re.search(r'Бямбадорж|Багш\s*:', t): return ''                       # багшийн нэр — мөрийг бүхэлд нь хасна
    if re.search(r'Цонжин|Боардинг', t):                                   # сургуулийн нэр — CyberMath хаяг
        first = [True]
        def one(mt):
            if first[0]: first[0] = False; return '<a:t>cyber-math.com</a:t>'
            return '<a:t></a:t>'
        return re.sub(r'<a:t>[^<]*</a:t>', one, p)
    if 'ЦКБС' in t: return p.replace('ЦКБС', 'CyberMath')
    return p

def fix_txbody(m):
    body = m.group(0)
    if '<a:p>' not in body and '<a:p ' not in body:
        body = body.replace('</p:txBody>', '<a:p><a:endParaRPr lang="mn-MN" dirty="0"/></a:p></p:txBody>')
    return body

def recolor_xml(x):
    x = re.sub(r'(<a:srgbClr val=")([0-9A-Fa-f]{6})(")', lambda m: m.group(1) + map_hex(m.group(2)) + m.group(3), x)
    x = re.sub(r'((?:fill|stroke|stop-color|color)=")#([0-9A-Fa-f]{6})(")', lambda m: m.group(1) + '#' + map_hex(m.group(2)) + m.group(3), x)
    return x

def is_dark_bg(x):
    bg = re.search(r'<p:bg>.*?</p:bg>', x, flags=re.S)
    return bool(bg and re.search(r'schemeClr val="tx2"|srgbClr val="(101A44|1C1240|16235E)"', bg.group(0)))

def lighten_accent_text(x):
    # харанхуй дэвсгэртэй слайд/layout: текстийн (rPr / endParaRPr / defRPr) accent1 → цайвар нил ягаан
    return re.sub(r'(<a:(?:rPr|endParaRPr|defRPr)\b[^>]*>)(.*?)(</a:(?:rPr|endParaRPr|defRPr)>)',
                  lambda m: m.group(1) + m.group(2).replace('<a:schemeClr val="accent1"/>', '<a:srgbClr val="' + DARK_TEXT_ACCENT + '"/>') + m.group(3),
                  x, flags=re.S)

# ── зураг ──
def recolor_png(data):
    im = Image.open(io.BytesIO(data))
    mode = im.mode
    rgba = im.convert('RGBA')
    a = np.asarray(rgba).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0); v = mx
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, (60 * ((g - b) / dd)) % 360, np.where(mx == g, 60 * ((b - r) / dd) + 120, 60 * ((r - g) / dd) + 240))
    h = np.where(d == 0, 0, h)
    teal = (s > 0.12) & (h >= 140) & (h <= 200)
    navy = (s > 0.15) & (h >= 205) & (h <= 238)
    if not (teal.any() or navy.any()): return data, False
    h2 = np.where(teal, 258.0, np.where(navy, 252.0, h))
    s2 = np.where(teal, s * 0.8, np.where(navy, s * 0.92, s))
    v2 = np.where(teal, v + (1 - v) * 0.6, v)
    c = v2 * s2; hp = h2 / 60.0; x = c * (1 - np.abs(hp % 2 - 1)); m = v2 - c
    i = np.floor(hp).astype(int) % 6
    R = np.choose(i, [c, x, 0 * c, 0 * c, x, c]); G = np.choose(i, [x, c, c, x, 0 * c, 0 * c]); B = np.choose(i, [0 * c, 0 * c, x, c, c, x])
    out = np.concatenate([np.stack([R + m, G + m, B + m], -1), alpha], -1)
    img = Image.fromarray(np.clip(np.round(out * 255), 0, 255).astype(np.uint8), 'RGBA')
    if mode in ('RGB', 'P', 'L'): img = img.convert('RGB') if mode == 'RGB' else img
    buf = io.BytesIO(); img.save(buf, 'PNG', optimize=True)
    return buf.getvalue(), True

# ── zip ──
zin = zipfile.ZipFile(SRC)
names = zin.namelist()
# слайд → layout (харанхуй дэвсгэртэй layout-ыг ашигладаг слайдыг олно)
dark_layouts = set()
for n in names:
    if re.match(r'ppt/slideLayouts/slideLayout\d+\.xml$', n) and is_dark_bg(zin.read(n).decode('utf8')): dark_layouts.add(n.rsplit('/', 1)[1])
dark_slides = set()
for n in names:
    m = re.match(r'ppt/slides/_rels/(slide\d+\.xml)\.rels$', n)
    if m:
        lay = re.search(r'slideLayouts/(slideLayout\d+\.xml)', zin.read(n).decode('utf8'))
        if lay and lay.group(1) in dark_layouts: dark_slides.add(m.group(1))

stats = {'scrub': 0, 'png': 0, 'xml': 0}
zout = zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED)
for info in zin.infolist():
    data = zin.read(info.filename); n = info.filename
    if n.endswith('.xml') or n.endswith('.rels') or n.endswith('.svg'):
        x = data.decode('utf8'); x0 = x
        if n.startswith('ppt/slides/slide') or n.startswith('ppt/slideLayouts/') or n.startswith('ppt/slideMasters/') or n.startswith('ppt/notesSlides/'):
            x = re.sub(r'<a:p>.*?</a:p>', scrub_paragraph, x, flags=re.S)
            x = re.sub(r'<p:txBody>.*?</p:txBody>', fix_txbody, x, flags=re.S)
        if n == 'docProps/core.xml':
            x = re.sub(r'(<dc:creator>)[^<]*(</dc:creator>)', r'\1CyberMath\2', x)
            x = re.sub(r'(<cp:lastModifiedBy>)[^<]*(</cp:lastModifiedBy>)', r'\1CyberMath\2', x)
        if n == 'docProps/app.xml':
            x = re.sub(r'(<Company>)[^<]*(</Company>)', r'\1CyberMath\2', x)
        x = re.sub(r'Цонжин Кибер Боардинг(?: сургууль)?', 'CyberMath', x)
        x = x.replace('Tsonjin Math', 'CyberMath')
        if n.startswith('ppt/'):
            fname = n.rsplit('/', 1)[1]
            if (n.startswith('ppt/slideLayouts/') and fname in dark_layouts) or (n.startswith('ppt/slides/') and fname in dark_slides):
                x = lighten_accent_text(x)
            if n.startswith('ppt/slideLayouts/') and fname in dark_layouts:
                x = re.sub(r'<p:bgPr>.*?</p:bgPr>', TITLE_BG, x, count=1, flags=re.S)
            x = recolor_xml(x)
        if x != x0:
            stats['xml'] += 1
            if re.search(r'Бямбадорж|Цонжин|ЦКБС', x0): stats['scrub'] += 1
        data = x.encode('utf8')
    elif n.startswith('ppt/media/') and n.lower().endswith('.png'):
        data, changed = recolor_png(data)
        if changed: stats['png'] += 1
    zi = zipfile.ZipInfo(n, date_time=info.date_time); zi.compress_type = zipfile.ZIP_STORED if n.lower().endswith(('.png', '.jpg', '.jpeg')) else zipfile.ZIP_DEFLATED
    zi.external_attr = info.external_attr
    zout.writestr(zi, data)
zout.close()

# шалгалт: хувийн нэр үлдээгүй
z2 = zipfile.ZipFile(DST); left = []
for n in z2.namelist():
    if n.endswith('.xml'):
        t = z2.read(n).decode('utf8')
        if re.search(r'Бямбадорж|Цонжин|Боардинг|ЦКБС', t): left.append(n)
sys.stdout.reconfigure(encoding='utf-8')
print('brand OK · xml %d (нэр арилсан %d) · png %d · харанхуй layout %s' % (stats['xml'], stats['scrub'], stats['png'], sorted(dark_layouts)))
if left:
    print('АЛДАА: нэр үлдсэн: ' + ', '.join(left)); sys.exit(2)
