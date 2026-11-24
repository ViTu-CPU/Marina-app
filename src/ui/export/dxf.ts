/**
 * D61, I111: the selected alternative as a DXF drawing (AutoCAD R12, AC1009: the simplest variant,
 * read by every CAD program; AutoCAD saves it as DWG). Every product with a plan size is a block
 * (origin at the middle of its first end, length along x): pontoon modules, fingers and booms,
 * gangways, breakwater modules, and symbols for anchors (cube of the same volume) and buoys. The
 * layout is built of block inserts, so pontoons, fingers etc. can be copied and pasted; the whole
 * product library is placed beside the drawing. Coordinates are the drawing's local metres (x east,
 * y north); 1 drawing unit = 1 m. Text outside ASCII is written as \U+XXXX.
 */
import { anchoringPlan } from '../../engine/anchoring';
import { waveInput } from '../costModel';
import { BREAKWATERS, breakwaterModules, breakwaterProductOf, breakwatersOf } from '../../engine/breakwater';
import { chooseGangway, moduleCombination, pickByLength, seriesOf, type ResolvedChoices } from '../../engine/bom';
import type { PriceList, Product } from '../../engine/catalog';
import { add, distance, scale, sub } from '../../engine/geometry';
import type { Layout, Project, Vec2 } from '../../engine/model';
import { rowFrame, toLocalRect } from '../../engine/rows';
import { accessPontoonsOf, DEFAULT_GANGWAY_LENGTH, gangwayLinks, pierShoreLink, shorelinesOf } from '../../engine/site';
import { EQUIPMENT_DEFAULTS, equipmentPlan } from '../../engine/equipment';
import { equipmentSpacing } from '../../engine/bom';

/** Layers: name and AutoCAD colour index. */
export const DXF_LAYERS = {
  WATER: 5,
  SHORELINE: 3,
  ENTRANCE: 2,
  OBSTACLES: 8,
  ZONES: 1,
  PONTOONS: 7,
  FINGERS: 9,
  BERTHS: 8,
  BOATS: 4,
  GANGWAYS: 30,
  CHAINS: 32,
  ANCHORS: 34,
  BUOYS: 40,
  BREAKWATERS: 250,
  EQUIPMENT: 1,
  LIBRARY: 7,
  TEXT: 7,
} as const;
export type DxfLayer = keyof typeof DXF_LAYERS;

/** A block: name, rectangle (length along x, width across, origin at the middle of the first end) or a circle. */
export interface DxfBlock {
  name: string;
  label: string;
  group: 'Pontoons' | 'Fingers and booms' | 'Gangways' | 'Breakwaters' | 'Anchors' | 'Buoys';
  length: number;
  width: number;
  shape: 'rect' | 'circle';
}

const ASCII = /^[\x20-\x7e]*$/;
/** Text for DXF: \U+XXXX for characters outside ASCII. */
export const dxfText = (s: string): string => (ASCII.test(s) ? s : [...s].map((c) => (/[\x20-\x7e]/.test(c) ? c : `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)).join(''));

/** Block name for R12 (at most 31 characters of A–Z, 0–9, _ and -), unique within `used`. */
export function blockName(prefix: string, id: string, used: Set<string>): string {
  const clean = `${prefix}_${id}`
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9_-]+/g, '_')
    .slice(0, 31);
  let name = clean;
  for (let i = 2; used.has(name); i++) name = `${clean.slice(0, 31 - String(i).length - 1)}_${i}`;
  used.add(name);
  return name;
}

/** Cube of the same volume as a concrete anchor, m (plan size not published: Assumption). */
export const anchorSymbolSide = (massKg: number, concreteDensity = 2400): number => Math.cbrt(massKg / concreteDensity);

const fmt = (x: number) => (Math.round(x * 1000) / 1000).toString();

class Writer {
  private out: string[] = [];
  pair(code: number, value: string | number): void {
    this.out.push(String(code), typeof value === 'number' ? fmt(value) : value);
  }
  polyline(layer: string, points: readonly Vec2[], closed: boolean): void {
    if (points.length < 2) return;
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(70, closed ? 1 : 0);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    for (const p of points) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.pair(10, p.x);
      this.pair(20, p.y);
      this.pair(30, 0);
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }
  line(layer: string, a: Vec2, b: Vec2): void {
    this.pair(0, 'LINE');
    this.pair(8, layer);
    this.pair(10, a.x);
    this.pair(20, a.y);
    this.pair(30, 0);
    this.pair(11, b.x);
    this.pair(21, b.y);
    this.pair(31, 0);
  }
  circle(layer: string, c: Vec2, r: number): void {
    this.pair(0, 'CIRCLE');
    this.pair(8, layer);
    this.pair(10, c.x);
    this.pair(20, c.y);
    this.pair(30, 0);
    this.pair(40, r);
  }
  text(layer: string, at: Vec2, height: number, value: string, rotation = 0): void {
    this.pair(0, 'TEXT');
    this.pair(8, layer);
    this.pair(10, at.x);
    this.pair(20, at.y);
    this.pair(30, 0);
    this.pair(40, height);
    this.pair(1, dxfText(value));
    if (rotation) this.pair(50, rotation);
  }
  insert(layer: string, block: string, at: Vec2, rotation: number, xScale = 1): void {
    this.pair(0, 'INSERT');
    this.pair(8, layer);
    this.pair(2, block);
    this.pair(10, at.x);
    this.pair(20, at.y);
    this.pair(30, 0);
    if (xScale !== 1) this.pair(41, xScale);
    if (rotation) this.pair(50, rotation);
  }
  toString(): string {
    return `${this.out.join('\r\n')}\r\n`;
  }
}

const angleOf = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;
const unit = (a: Vec2, b: Vec2): Vec2 => scale(sub(b, a), 1 / (distance(a, b) || 1));

export interface DxfInput {
  project: Project;
  layout: Layout;
  /** Price list and resolved product choices (cost model); without them the structures are outlines only. */
  priceList: PriceList | null;
  choices: ResolvedChoices | null;
  vatPct: number;
  date: string;
}

/** The DXF text of the selected alternative with the product library beside it. */
export function buildDxf(input: DxfInput): string {
  const { project, layout, priceList: list, choices, vatPct } = input;
  const site = project.site;
  const used = new Set<string>();
  const blocks: DxfBlock[] = [];
  const blockOf = new Map<string, string>();
  const addBlock = (key: string, prefix: string, id: string, b: Omit<DxfBlock, 'name'>): string => {
    const existing = blockOf.get(key);
    if (existing) return existing;
    const name = blockName(prefix, id, used);
    blocks.push({ ...b, name });
    blockOf.set(key, name);
    return name;
  };
  const productBlock = (p: Product): string | null => {
    if (p.category === 'anchor' && p.anchorMassKg) {
      const s = anchorSymbolSide(p.anchorMassKg, project.anchoring.concreteDensity);
      return addBlock(p.id, 'ANC', p.id, { label: `${p.name} (${p.supplier}), symbol ${fmt(s)} m`, group: 'Anchors', length: s, width: s, shape: 'rect' });
    }
    if (p.category === 'buoy') return addBlock(p.id, 'BUOY', p.id, { label: `${p.name} (${p.supplier}), symbol 1 m`, group: 'Buoys', length: 1, width: 1, shape: 'circle' });
    if (!p.lengthM || !p.widthM) return null;
    const group = p.category === 'pontoon' ? 'Pontoons' : p.category === 'finger' ? 'Fingers and booms' : p.category === 'gangway' ? 'Gangways' : null;
    if (!group) return null;
    const prefix = p.category === 'pontoon' ? 'PON' : p.category === 'finger' ? 'FIN' : 'GW';
    return addBlock(p.id, prefix, p.id, { label: `${p.name} (${p.supplier}), ${fmt(p.lengthM)} x ${fmt(p.widthM)} m`, group, length: p.lengthM, width: p.widthM, shape: 'rect' });
  };
  // The whole library first, so that it is complete whatever the layout uses.
  for (const p of list?.products ?? []) productBlock(p);
  for (const b of BREAKWATERS) {
    for (const m of b.modules) addBlock(`bw:${m.code}`, 'BW', m.code, { label: `${b.name} ${m.code}, ${fmt(m.length)} x ${fmt(b.width)} m, ${fmt(m.weightT)} t`, group: 'Breakwaters', length: m.length, width: b.width, shape: 'rect' });
  }

  const e = new Writer();
  // --- Site ---
  if (site.water.length >= 3) e.polyline('WATER', site.water, true);
  for (const line of shorelinesOf(site)) e.polyline('SHORELINE', line, false);
  if (distance(site.entrance.a, site.entrance.b) > 0) e.line('ENTRANCE', site.entrance.a, site.entrance.b);
  for (const o of site.obstacles) e.polyline('OBSTACLES', o.shape, true);
  for (const z of site.zones) e.polyline('ZONES', z.shape, true);

  // --- Pontoons: piers and access pontoons, as module inserts where the price list has modules ---
  const pontoonProducts = list && choices?.pontoonSeries ? seriesOf(list, 'pontoon', choices.pontoonSeries) : [];
  const pontoons = [
    ...layout.piers.map((p) => ({ id: p.id, start: p.start, end: p.end, width: p.width })),
    ...accessPontoonsOf(site).map((a) => ({ id: a.id, start: a.start, end: a.end, width: a.width })),
  ];
  for (const h of pontoons) {
    const length = distance(h.start, h.end);
    if (!(length > 0)) continue;
    const dir = unit(h.start, h.end);
    const combo = pontoonProducts.some((p) => p.unit !== 'm') ? moduleCombination(length, pontoonProducts.filter((p) => p.unit !== 'm'), vatPct) : null;
    if (combo) {
      // Longest modules at the shore end.
      const modules = [...combo.entries()].sort((a, b) => b[0].lengthM! - a[0].lengthM!).flatMap(([m, n]) => new Array<Product>(n).fill(m));
      let at = 0;
      for (const m of modules) {
        const name = productBlock(m);
        if (name) e.insert('PONTOONS', name, add(h.start, scale(dir, at)), angleOf(dir));
        at += m.lengthM!;
      }
    } else {
      const generic = addBlock(`generic:${h.width}`, 'PON_PER_M', fmt(h.width), { label: `Pontoon per metre, ${fmt(h.width)} m wide (scale x to the length)`, group: 'Pontoons', length: 1, width: h.width, shape: 'rect' });
      e.insert('PONTOONS', generic, h.start, angleOf(dir), length);
    }
    e.text('TEXT', add(h.start, scale(dir, -3)), 1.5, h.id);
  }

  // --- Fingers and booms ---
  const pierById = new Map(layout.piers.map((p) => [p.id, p]));
  const fingerProducts = list && choices?.fingerSeries ? seriesOf(list, 'finger', choices.fingerSeries) : [];
  const boomProducts = list && choices?.boomSeries ? seriesOf(list, 'finger', choices.boomSeries) : [];
  for (const f of layout.fingers) {
    const pier = pierById.get(f.pierId);
    if (!pier) continue;
    const frame = rowFrame(pier, 'left');
    const r = toLocalRect(f.shape, frame);
    const needed = r.d1 - r.d0;
    const fit = pickByLength(f.kind === 'boom' ? boomProducts : fingerProducts, needed, vatPct);
    const name = fit ? productBlock(fit.product) : null;
    if (!name) {
      e.polyline('FINGERS', f.shape, true);
      continue;
    }
    // Root at the edge nearest the pier, pointing away from it.
    const dOut = r.d0 >= 0 ? 1 : -1;
    const rootD = dOut > 0 ? r.d0 : r.d1;
    const mid = (r.s0 + r.s1) / 2;
    const root = add(add(frame.origin, scale(frame.along, mid)), scale(frame.outward, rootD));
    e.insert('FINGERS', name, root, angleOf(scale(frame.outward, dOut)));
  }

  // --- Berths, boats, stern buoys ---
  for (const b of layout.berths.filter((x) => !x.removed)) {
    e.polyline('BERTHS', b.slot, true);
    if (b.boat.length >= 3) e.polyline('BOATS', b.boat, true);
    if (b.buoy) {
      const buoy = (list?.products ?? []).find((p) => p.category === 'buoy');
      const name = buoy ? productBlock(buoy) : null;
      if (name) e.insert('BUOYS', name, b.buoy, 0);
      else e.circle('BUOYS', b.buoy, 0.5);
    }
  }

  // --- Gangways ---
  const reach = project.params.gangwayLength ?? DEFAULT_GANGWAY_LENGTH;
  const gangwayProducts = list && choices?.gangwaySeries ? seriesOf(list, 'gangway', choices.gangwaySeries) : [];
  const wantedGangway = choices?.gangwayLength ?? reach;
  const gangwayAt = (from: Vec2, to: Vec2, served: number) => {
    const pick = list ? chooseGangway(list, gangwayProducts, served, wantedGangway, vatPct) : null;
    const name = pick ? productBlock(pick.product) : null;
    if (name) e.insert('GANGWAYS', name, to, angleOf(unit(to, from)));
    else e.line('GANGWAYS', from, to);
  };
  for (const pier of layout.piers) {
    const link = pierShoreLink(pier, site, reach);
    if (link?.kind === 'gangway') gangwayAt(link.from, link.to, layout.berths.filter((b) => b.pierId === pier.id && !b.removed).length);
  }
  for (const a of accessPontoonsOf(site)) for (const g of gangwayLinks(a, shorelinesOf(site))) gangwayAt(g.from, g.to, 0);

  // --- Breakwaters (D58) ---
  for (const bw of breakwatersOf(site)) {
    const product = breakwaterProductOf(bw);
    const dir = unit(bw.start, bw.end);
    let at = 0;
    for (const m of breakwaterModules(distance(bw.start, bw.end), product)) {
      e.insert('BREAKWATERS', blockOf.get(`bw:${m.code}`)!, add(bw.start, scale(dir, at)), angleOf(dir));
      at += m.length;
    }
    e.text('TEXT', add(bw.start, scale(dir, -3)), 1.5, `${bw.id} ${product.name}`);
  }

  // --- Anchoring: chains as lines, anchors as inserts ---
  if (list) {
    const plan = anchoringPlan({
      layout,
      site,
      classes: project.boatClasses,
      params: project.anchoring,
      priceList: list,
      vatPct,
      pierFreeboard: choices?.pontoonFreeboard ?? null,
      buoyDepthFactor: project.params.buoyDepthFactor,
      moduleLengths: project.params.pierModuleLengths,
      gangwayReach: reach,
      waves: waveInput(project, layout),
    });
    const byId = new Map(list.products.map((p) => [p.id, p]));
    for (const l of plan.lines) {
      e.line('CHAINS', l.fix, l.anchor);
      const anchor = l.anchorId ? byId.get(l.anchorId) : undefined;
      const name = anchor ? productBlock(anchor) : null;
      if (name && l.fixing === 'seabed' && l.role !== 'buoy') {
        const side = blocks.find((b) => b.name === name)!.length;
        // The symbol centred on the anchor point.
        e.insert('ANCHORS', name, add(l.anchor, { x: -side / 2, y: 0 }), 0);
      } else if (l.status === 'PILE') {
        // D64: a pile anchor at the end of the chain.
        e.text('ANCHORS', l.anchor, 0.8, 'PILE ANCHOR');
      }
    }
  }

  // --- D65: rescue ladders, safety equipment posts and power and water pedestals (indicative) ---
  const square = (c: Vec2, side: number): Vec2[] => [
    { x: c.x - side / 2, y: c.y - side / 2 },
    { x: c.x + side / 2, y: c.y - side / 2 },
    { x: c.x + side / 2, y: c.y + side / 2 },
    { x: c.x - side / 2, y: c.y + side / 2 },
  ];
  for (const x of equipmentPlan(layout, site, list ? equipmentSpacing(list) : EQUIPMENT_DEFAULTS).items) {
    if (x.kind === 'safetyPost') e.circle('EQUIPMENT', x.at, 0.6);
    else e.polyline('EQUIPMENT', square(x.at, x.kind === 'ladder' ? 0.7 : 0.6), true);
    e.text('EQUIPMENT', add(x.at, { x: 0.8, y: 0 }), 0.4, x.kind === 'ladder' ? 'LADDER' : x.kind === 'safetyPost' ? 'SAFETY POST' : 'PEDESTAL');
  }

  // --- Title ---
  const pts = [...site.water, ...layout.piers.flatMap((p) => [p.start, p.end])];
  const minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0;
  const maxX = pts.length ? Math.max(...pts.map((p) => p.x)) : 0;
  const minY = pts.length ? Math.min(...pts.map((p) => p.y)) : 0;
  const maxY = pts.length ? Math.max(...pts.map((p) => p.y)) : 0;
  e.text('TEXT', { x: minX, y: minY - 8 }, 2, `${project.name} - ${layout.name} - ${input.date}`);
  e.text('TEXT', { x: minX, y: minY - 12 }, 1.5, 'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer. Units: m.');

  // --- Product library beside the drawing ---
  const libX = maxX + 40;
  let y = maxY;
  e.text('LIBRARY', { x: libX, y: y + 4 }, 3, 'PRODUCT LIBRARY (blocks: copy and paste)');
  for (const group of ['Pontoons', 'Fingers and booms', 'Gangways', 'Breakwaters', 'Anchors', 'Buoys'] as const) {
    const members = blocks.filter((b) => b.group === group);
    if (members.length === 0) continue;
    y -= 4;
    e.text('LIBRARY', { x: libX, y }, 2.2, group);
    y -= 2;
    for (const b of members) {
      y -= Math.max(b.width, 1) / 2 + 1.5;
      e.insert('LIBRARY', b.name, { x: libX, y: b.shape === 'circle' ? y : y }, 0);
      e.text('LIBRARY', { x: libX + Math.max(b.length, 1) + 2, y: y - 0.4 }, 0.9, `${b.name}: ${b.label}`);
      y -= Math.max(b.width, 1) / 2 + 1;
    }
  }

  // --- File ---
  const w = new Writer();
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1009');
  w.pair(9, '$INSBASE');
  w.pair(10, 0);
  w.pair(20, 0);
  w.pair(30, 0);
  w.pair(9, '$EXTMIN');
  w.pair(10, minX - 20);
  w.pair(20, Math.min(minY - 20, y - 10));
  w.pair(30, 0);
  w.pair(9, '$EXTMAX');
  w.pair(10, libX + 80);
  w.pair(20, maxY + 20);
  w.pair(30, 0);
  w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');
  w.pair(0, 'TABLE');
  w.pair(2, 'LTYPE');
  w.pair(70, 1);
  w.pair(0, 'LTYPE');
  w.pair(2, 'CONTINUOUS');
  w.pair(70, 0);
  w.pair(3, 'Solid line');
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, 0);
  w.pair(0, 'ENDTAB');
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.pair(70, Object.keys(DXF_LAYERS).length + 1);
  for (const [name, color] of [['0', 7] as const, ...Object.entries(DXF_LAYERS)]) {
    w.pair(0, 'LAYER');
    w.pair(2, name);
    w.pair(70, 0);
    w.pair(62, color);
    w.pair(6, 'CONTINUOUS');
  }
  w.pair(0, 'ENDTAB');
  w.pair(0, 'TABLE');
  w.pair(2, 'STYLE');
  w.pair(70, 1);
  w.pair(0, 'STYLE');
  w.pair(2, 'STANDARD');
  w.pair(70, 0);
  w.pair(40, 0);
  w.pair(41, 1);
  w.pair(50, 0);
  w.pair(71, 0);
  w.pair(42, 2.5);
  w.pair(3, 'txt');
  w.pair(4, '');
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION');
  w.pair(2, 'BLOCKS');
  for (const b of blocks) {
    w.pair(0, 'BLOCK');
    w.pair(8, '0');
    w.pair(2, b.name);
    w.pair(70, 0);
    w.pair(10, 0);
    w.pair(20, 0);
    w.pair(30, 0);
    w.pair(3, b.name);
    if (b.shape === 'circle') w.circle('0', { x: 0, y: 0 }, b.length / 2);
    else {
      const h = b.width / 2;
      w.polyline('0', [{ x: 0, y: -h }, { x: b.length, y: -h }, { x: b.length, y: h }, { x: 0, y: h }], true);
    }
    w.pair(0, 'ENDBLK');
    w.pair(8, '0');
  }
  w.pair(0, 'ENDSEC');
  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');
  const head = w.toString();
  return `${head}${e.toString()}0\r\nENDSEC\r\n0\r\nEOF\r\n`;
}

/** Blocks a DXF text defines and the block names its inserts use (for checks). */
export function dxfSummary(text: string): { blocks: string[]; inserts: string[]; layers: string[] } {
  const lines = text.split(/\r?\n/);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i]!.trim(), lines[i + 1]!]);
  const blocks: string[] = [];
  const inserts: string[] = [];
  const layers: string[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i]!;
    if (c !== '0' || !['BLOCK', 'INSERT', 'LAYER'].includes(v)) continue;
    const name = pairs.slice(i + 1).find(([cc]) => cc === '2')?.[1];
    if (!name) continue;
    if (v === 'BLOCK') blocks.push(name);
    else if (v === 'INSERT') inserts.push(name);
    else layers.push(name);
  }
  return { blocks, inserts, layers };
}

