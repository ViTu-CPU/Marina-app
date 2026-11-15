/**
 * Wind rose of a fetched wind climate (D41): 16 sectors, stacked by speed class (ordinal blue
 * ramp, validated with the dataviz checks), radius = share of hours. The sectors behind the
 * wave directions that exceed the criteria are outlined (D47). Each sector has a native tooltip; the table next to it is the table view.
 */
import { sectorBearing, SPEED_CLASSES, type WindClimate } from '../../engine/wind';

export const SPEED_COLORS = ['#86b6ef', '#5598e7', '#256abf', '#184f95', '#0d366b'] as const;
const LABELS = ['N', 'E', 'S', 'W'];

export const speedClassLabel = (i: number): string =>
  i < SPEED_CLASSES.length - 1 ? `${SPEED_CLASSES[i]}–${SPEED_CLASSES[i + 1]} m/s` : `≥ ${SPEED_CLASSES[i]} m/s`;

export function WindRose({ climate, highlight, percent }: { climate: WindClimate; highlight: readonly number[]; percent: (share: number) => string }) {
  const size = 220;
  const c = size / 2;
  const radius = c - 22;
  const totals = climate.sectors.map((s) => s.rose.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals, 1e-9);
  // Rings at round shares.
  const step = max > 0.2 ? 0.1 : max > 0.1 ? 0.05 : 0.02;
  const rings = Array.from({ length: Math.floor(max / step) }, (_, i) => (i + 1) * step);
  const r = (share: number) => (share / max) * radius;
  const point = (bearing: number, rr: number) => {
    const a = (bearing * Math.PI) / 180;
    return [c + rr * Math.sin(a), c - rr * Math.cos(a)] as const;
  };
  const wedge = (bearing: number, r0: number, r1: number) => {
    const half = 9; // degrees: 22.5° sector less a gap
    const [ax, ay] = point(bearing - half, r1);
    const [bx, by] = point(bearing + half, r1);
    const [cx, cy] = point(bearing + half, r0);
    const [dx, dy] = point(bearing - half, r0);
    return `M${dx},${dy} L${ax},${ay} A${r1},${r1} 0 0 1 ${bx},${by} L${cx},${cy} A${r0},${r0} 0 0 0 ${dx},${dy} Z`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wind rose" data-testid="wind-rose">
      {rings.map((s) => {
        // Labels on the gap between the N and NNE sectors, clear of the N label.
        const [x, y] = point(11.25, r(s));
        return (
          <g key={s}>
            <circle cx={c} cy={c} r={r(s)} fill="none" stroke="#e2e8f0" strokeWidth={1} />
            <text x={x + 2} y={y - 2} fontSize={9} fill="#64748b">
              {percent(s)}
            </text>
          </g>
        );
      })}
      {LABELS.map((l, i) => {
        const [x, y] = point(i * 90, radius + 12);
        return (
          <text key={l} x={x} y={y + 3} fontSize={11} textAnchor="middle" fill="#334155">
            {l}
          </text>
        );
      })}
      {climate.sectors.map((s, k) => {
        let acc = 0;
        const bearing = sectorBearing(k);
        return (
          <g key={k}>
            <title>{`${bearing}°: ${percent(totals[k]!)} (${s.rose.map((x, i) => `${speedClassLabel(i)} ${percent(x)}`).join(', ')})`}</title>
            {s.rose.map((share, i) => {
              if (share <= 0) return null;
              const r0 = r(acc);
              acc += share;
              return <path key={i} d={wedge(bearing, r0, r(acc))} fill={SPEED_COLORS[i]} stroke="#ffffff" strokeWidth={1} />;
            })}
            {highlight.includes(k) && totals[k]! > 0 && <path d={wedge(bearing, 0, r(totals[k]!))} fill="none" stroke="#ea580c" strokeWidth={2} />}
          </g>
        );
      })}
    </svg>
  );
}
