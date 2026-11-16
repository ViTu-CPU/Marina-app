/**
 * Test helper: a minimal Mapbox Vector Tile encoder (spec 2.1: layers 3, features 2, geometry
 * commands MoveTo 1 / LineTo 2 / ClosePath 7 with zigzag deltas) for polygons only.
 */
import { PbfWriter } from 'pbf';

export interface MvtPolygon {
  /** Rings in tile units (0…extent). */
  rings: [number, number][][];
  properties?: Record<string, string>;
}

const zigzag = (n: number) => (n << 1) ^ (n >> 31);

function geometry(rings: [number, number][][]): number[] {
  const out: number[] = [];
  let cx = 0;
  let cy = 0;
  for (const ring of rings) {
    const pts = ring.map(([x, y]) => [Math.round(x), Math.round(y)] as const);
    out.push((1 & 7) | (1 << 3), zigzag(pts[0]![0] - cx), zigzag(pts[0]![1] - cy));
    [cx, cy] = pts[0]!;
    out.push((2 & 7) | ((pts.length - 1) << 3));
    for (const [x, y] of pts.slice(1)) {
      out.push(zigzag(x - cx), zigzag(y - cy));
      cx = x;
      cy = y;
    }
    out.push((7 & 7) | (1 << 3));
  }
  return out;
}

export function encodeTile(layers: Record<string, MvtPolygon[]>, extent = 4096): Uint8Array {
  const pbf = new PbfWriter();
  for (const [name, features] of Object.entries(layers)) {
    pbf.writeMessage(3, () => {
      const keys: string[] = [];
      const values: string[] = [];
      pbf.writeVarintField(15, 2);
      pbf.writeStringField(1, name);
      for (const f of features) {
        const tags: number[] = [];
        for (const [k, v] of Object.entries(f.properties ?? {})) {
          if (!keys.includes(k)) keys.push(k);
          if (!values.includes(v)) values.push(v);
          tags.push(keys.indexOf(k), values.indexOf(v));
        }
        pbf.writeMessage(
          2,
          () => {
            if (tags.length) pbf.writePackedVarint(2, tags);
            pbf.writeVarintField(3, 3);
            pbf.writePackedVarint(4, geometry(f.rings));
          },
          undefined,
        );
      }
      for (const k of keys) pbf.writeStringField(3, k);
      for (const v of values) pbf.writeMessage(4, () => pbf.writeStringField(1, v), undefined);
      pbf.writeVarintField(5, extent);
    }, undefined);
  }
  return pbf.finish();
}
