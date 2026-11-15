/**
 * Legend of the map symbols (U22): an HTML box over the canvas listing the symbols of the
 * layers that are switched on. Not part of the PNG export.
 */
import { useState, type ReactNode } from 'react';
import type { StringKey } from '../../i18n';
import { useAppStore, type LayerId } from '../../state/store';
import { useT } from '../useT';
import { COLORS, HATCH } from './colors';

const W = 26;
const H = 12;

const swatch = (children: ReactNode) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);
const fill = (color: string, stroke?: string, dash?: string) =>
  swatch(<rect x={1} y={2} width={W - 2} height={H - 4} fill={color} stroke={stroke ?? 'none'} strokeWidth={1} strokeDasharray={dash} />);
const hatch = ([bg, line]: readonly [string, string], edge?: string) =>
  swatch(
    <>
      <rect x={1} y={2} width={W - 2} height={H - 4} fill={bg} stroke={edge ?? 'none'} />
      {[0, 6, 12, 18].map((x) => (
        <line key={x} x1={x + 1} y1={H - 2} x2={x + 7} y2={2} stroke={line} strokeWidth={1} />
      ))}
    </>,
  );
const line = (color: string, width: number, dash?: string) => swatch(<line x1={1} y1={H / 2} x2={W - 1} y2={H / 2} stroke={color} strokeWidth={width} strokeDasharray={dash} />);

/** Legend entries: the layer that shows them, the label and the swatch. */
const ENTRIES: { layer: LayerId; label: StringKey; swatch: ReactNode }[] = [
  { layer: 'water', label: 'legend.water', swatch: fill(COLORS.water, COLORS.waterEdge) },
  { layer: 'shoreline', label: 'legend.shoreline', swatch: line(COLORS.shoreline, 4) },
  { layer: 'shoreline', label: 'legend.entrance', swatch: line(COLORS.entrance, 5) },
  { layer: 'obstacles', label: 'legend.obstacle', swatch: fill(COLORS.obstacle) },
  { layer: 'zones', label: 'legend.zone', swatch: hatch(HATCH.zone, COLORS.zoneEdge) },
  { layer: 'fairways', label: 'legend.fairway', swatch: hatch(HATCH.fairway) },
  { layer: 'piers', label: 'legend.pier', swatch: fill(COLORS.pier) },
  { layer: 'piers', label: 'legend.access', swatch: fill(COLORS.access, COLORS.pier, '3 2') },
  { layer: 'piers', label: 'legend.gangway', swatch: line(COLORS.gangway, 4) },
  { layer: 'fingers', label: 'legend.finger', swatch: fill(COLORS.finger) },
  { layer: 'fingers', label: 'legend.boom', swatch: fill(COLORS.boom) },
  { layer: 'slots', label: 'legend.slot', swatch: fill('none', COLORS.slot) },
  { layer: 'boats', label: 'legend.buoy', swatch: swatch(<circle cx={W / 2} cy={H / 2} r={3.5} fill={COLORS.buoy} />) },
  { layer: 'boats', label: 'legend.boat', swatch: swatch(<rect x={4} y={2} width={W - 8} height={H - 4} rx={3} fill="#34d399" />) },
  { layer: 'fetch', label: 'legend.fetchRay', swatch: line(COLORS.fetchRay, 1) },
  { layer: 'fetch', label: 'legend.fetchMax', swatch: line(COLORS.fetchMax, 2) },
  { layer: 'anchoring', label: 'legend.chain', swatch: line(COLORS.chain, 1.5, '3 2') },
  { layer: 'anchoring', label: 'legend.anchor', swatch: swatch(<rect x={W / 2 - 4} y={H / 2 - 4} width={8} height={8} fill={COLORS.anchor} />) },
  { layer: 'anchoring', label: 'legend.severalAnchors', swatch: swatch(<rect x={W / 2 - 4} y={H / 2 - 4} width={8} height={8} fill={COLORS.issue} />) },
  { layer: 'anchoring', label: 'legend.wallFixing', swatch: swatch(<circle cx={W / 2} cy={H / 2} r={3} fill={COLORS.anchor} />) },
  { layer: 'anchoring', label: 'legend.pile', swatch: swatch(<circle cx={W / 2} cy={H / 2} r={4.5} fill={COLORS.pier} stroke={COLORS.anchor} />) },
  { layer: 'issues', label: 'legend.issue', swatch: fill('none', COLORS.issue) },
];

export function MapLegend() {
  const t = useT();
  const layers = useAppStore((s) => s.layers);
  // Closed by default so that it never covers the drawing until asked for.
  const [open, setOpen] = useState(false);
  const shown = ENTRIES.filter((e) => layers[e.layer]);
  return (
    <div className="absolute left-2 top-2 max-w-[13rem] rounded border border-slate-300 bg-white/90 text-xs shadow-sm" data-testid="legend">
      <button type="button" aria-expanded={open} className="px-2 py-1 text-left font-semibold text-slate-700" onClick={() => setOpen((x) => !x)}>
        {open ? '▾' : '▸'} {t('legend.title')}
      </button>
      {open && (
        <ul className="space-y-0.5 px-2 pb-1.5">
          {shown.map((e) => (
            <li key={e.label} className="flex items-center gap-1.5 text-slate-700">
              {e.swatch}
              <span>{t(e.label)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
