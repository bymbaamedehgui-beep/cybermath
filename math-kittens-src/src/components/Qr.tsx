import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const { n, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n: count, path: d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} className="rounded-2xl bg-white" shapeRendering="crispEdges" aria-label="QR код">
      <path d={path} fill="#1b1035" />
    </svg>
  );
}
