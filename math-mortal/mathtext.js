/* Бодлогын $...$ хэсгийг KaTeX-ээр жинхэнэ математик бичиглэл болгож харуулна.
   KaTeX ачаалагдаагүй / рендер бүтэхгүй бол энгийн текстээр уншигдана.
   3D болон хураангуй (2D) хоёр хувилбар хоёулаа үүнийг хэрэглэнэ. */
export function setMathText(el, raw) {
  const s = String(raw ?? '');
  if (!el) return;
  if (!window.katex || s.indexOf('$') < 0) { el.textContent = s; return; }
  el.textContent = '';
  for (const part of s.split(/(\$[^$]*\$)/g)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
      const span = document.createElement('span');
      try {
        window.katex.render(part.slice(1, -1), span, { throwOnError: false, displayMode: false });
      } catch { span.textContent = part.slice(1, -1); }
      el.appendChild(span);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}
