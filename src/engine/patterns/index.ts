import type { BerthType } from '../model';
import { fingerPierPattern } from './fingerPier';
import { mixedPattern } from './mixed';
import type { BerthPattern } from './types';
import { sternBuoyPattern } from './sternBuoy';
import { yBoomPattern } from './yBoom';

export { fingerPierPattern } from './fingerPier';
export { mixedPattern } from './mixed';
export { sternBuoyPattern } from './sternBuoy';
export { yBoomPattern } from './yBoom';

/** The pattern that lays out berths of a type (D34, D35, D51). */
export function patternFor(type: BerthType | undefined): BerthPattern {
  return type === 'yBoom' ? yBoomPattern : type === 'sternBuoy' ? sternBuoyPattern : type === 'mixed' ? mixedPattern : fingerPierPattern;
}
export { localRectToPolygon } from './types';
export type { BayBerth, BayGeometry, BerthPattern, LocalRect, RowFrame } from './types';
