/** Nombre au format français : virgule décimale, vrai signe moins. */
export const fr = (v: number, digits: number) => v.toFixed(digits).replace('.', ',').replace('-', '−');

export const timeOf = (t: number | string) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const etaText = (secs: number) => (secs < 60 ? 'moins d’1 min' : '~' + Math.round(secs / 60) + ' min');

/** Pente (régression linéaire) d'une série, en unités par échantillon. */
export function slope(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  vals.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
  const den = n * sxx - sx * sx;
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

/** Tracé SVG d'une série dans une boîte w×h, valeurs bornées à [min, max]. */
export function pathOf(vals: number[], min: number, max: number, w: number, h: number): string {
  const n = vals.length;
  if (n === 0) return '';
  return vals
    .map((v, i) => {
      const x = n > 1 ? (i / (n - 1)) * w : 0;
      const c = Math.min(max, Math.max(min, v));
      const y = h - ((c - min) / (max - min)) * h;
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    })
    .join(' ');
}

/** Mini-courbe auto-cadrée 200×40. */
export function spark(vals: number[]): string {
  if (vals.length === 0) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.2, 0.5);
  return pathOf(vals, min - pad, max + pad, 200, 40);
}
