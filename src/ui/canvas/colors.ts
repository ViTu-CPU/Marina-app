/** Colours of the drawing; shared by the canvas and its legend (SPEC §8 styles). */
export const COLORS = {
  water: '#e0f2fe',
  waterTranslucent: 'rgba(186, 230, 253, 0.35)',
  waterEdge: '#0369a1',
  shoreline: '#15803d',
  entrance: '#f59e0b',
  access: '#6b7280',
  gangway: '#b45309',
  chain: '#92400e',
  anchor: '#78350f',
  obstacle: '#1f2937',
  zoneEdge: '#dc2626',
  pier: '#374151',
  pierLocked: '#111827',
  finger: '#9ca3af',
  boom: '#0f766e',
  slot: '#64748b',
  issue: '#dc2626',
  selection: '#2563eb',
  draft: '#7c3aed',
  grid: '#e2e8f0',
  gridMajor: '#cbd5e1',
};

/** Hatched fills (background, line) of fairways and restricted zones; see patterns.ts. */
export const HATCH = {
  fairway: ['rgba(186, 230, 253, 0.55)', 'rgba(56, 189, 248, 0.9)'],
  zone: ['rgba(254, 202, 202, 0.45)', 'rgba(220, 38, 38, 0.9)'],
} as const;
