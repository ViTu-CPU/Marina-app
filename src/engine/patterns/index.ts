import type { BerthType } from '../model';
import { fingerPierPattern } from './fingerPier';
import type { BerthPattern } from './types';
import { yBoomPattern } from './yBoom';

export { fingerPierPattern } from './fingerPier';
export { yBoomPattern } from './yBoom';

/** The pattern that lays out berths of a type (D34). Stern-buoy berths: next step. */
export function patternFor(type: BerthType | undefined): BerthPattern {
  return type === 'yBoom' ? yBoomPattern : fingerPierPattern;
}
export { localRectToPolygon } from './types';
export type { BayBerth, BayGeometry, BerthPattern, LocalRect, RowFrame } from './types';
