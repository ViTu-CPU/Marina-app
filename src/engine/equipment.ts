/**
 * D65: safety and service equipment on the main piers and access pontoons (owner, 2026-11-18:
 * *"Lisää suunnitelmiin myös turvallisuusvälinepylväät, pelastautumistikkaat ja vesi, ja
 * sähköpollarit"*).
 *
 *  - Rescue ladders every `ladderSpacing` m (default 40 m). Top Marine, Pelastusvälineet
 *    (https://topmarinelaiturit.fi/laituritarvikkeet/pelastusvalineet/, read 2026-11-18):
 *    *"laituriin tulee turvatikkaat sijoittaa 40 metrin välein"* (a swimmer in clothes manages
 *    about 20 m), *"voivat vaihdella laiturien sijainnista riippuen"*.
 *  - Safety equipment posts (life ring with a 30 m throw line, rescue hook, 3 m ladder) every
 *    `safetyPostSpacing` m (default 80 m). The same page: *"pelastusvälinepylväät asennetaan 80
 *    metrin välein"* (a rescuer runs at most 40 m), usually at the pier head, several on long piers.
 *  - Power and water pedestals: one socket per berth and `berthsPerPedestal` sockets per pedestal
 *    (default 4). **Assumption**: no source read gives a ratio; Top Marine sells pedestals with 2 or 4
 *    × 16 A sockets and water (https://topmarinelaiturit.fi/laituritarvikkeet/sahkopylvaat/).
 *
 * Each pontoon on its own: n = ⌈L / spacing⌉ items at the middles of n equal parts, so that no point
 * of it is farther than spacing / 2 from one (ladders 20 m, posts 40 m: the reasons the page gives).
 * Pedestals spread the same way over the berthed part of each pier. Positions are indicative: the
 * real ones follow the fingers, the berths and the supplier. Breakwaters get none (not walkways).
 * Nothing here says the harbour meets any safety requirement.
 */
import { add, dot, scale, sub } from './geometry';
import { pierAxis } from './rows';
import type { Layout, Site, Vec2 } from './model';
import { accessPontoonsOf, distanceToShore, shorelinesOf } from './site';

export interface EquipmentSpacing {
  /** Rescue ladders, m; 0 = none. */
  ladderSpacing: number;
  /** Safety equipment posts, m; 0 = none. */
  safetyPostSpacing: number;
  /** Berths served by one power and water pedestal (one socket each); 0 = none. */
  berthsPerPedestal: number;
}

export const EQUIPMENT_DEFAULTS: EquipmentSpacing = { ladderSpacing: 40, safetyPostSpacing: 80, berthsPerPedestal: 4 };

export type EquipmentKind = 'ladder' | 'safetyPost' | 'pedestal';

export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  /** Pier or access pontoon it stands on. */
  holdsId: string;
  /** Position in plan: ladders at an edge, posts and pedestals on the centreline. */
  at: Vec2;
  /** Distance along the pontoon from its start, m. */
  t: number;
}

export interface EquipmentPlan {
  items: EquipmentItem[];
  /** Berths served by pedestals. */
  berths: number;
}

/** Middles of ⌈length / spacing⌉ equal parts of [from, from + length]; none for spacing ≤ 0. */
export function evenlySpaced(from: number, length: number, spacing: number): number[] {
  if (!(spacing > 0) || !(length > 0)) return [];
  const n = Math.max(1, Math.ceil(length / spacing - 1e-9));
  return Array.from({ length: n }, (_, i) => from + ((i + 0.5) * length) / n);
}

export function equipmentPlan(layout: Pick<Layout, 'piers' | 'berths'>, site: Site, spacing: EquipmentSpacing): EquipmentPlan {
  const items: EquipmentItem[] = [];
  let served = 0;
  const pontoons = [
    ...layout.piers.map((p) => ({ id: p.id, start: p.start, end: p.end, width: p.width, access: false })),
    ...accessPontoonsOf(site).map((a) => ({ id: a.id, start: a.start, end: a.end, width: a.width, access: true })),
  ];
  for (const p of pontoons) {
    const { length, along, left } = pierAxis({ id: p.id, start: p.start, end: p.end, width: p.width, locked: false, origin: 'manual' });
    if (!(length > 0)) continue;
    const at = (t: number, lateral = 0) => add(add(p.start, scale(along, t)), scale(left, lateral));
    // Ladders at an edge: on an access pontoon the edge away from the shore; on a pier alternately right and left.
    let ladderSide = -1;
    const shores = shorelinesOf(site);
    if (p.access && shores.length > 0) {
      const mid = at(length / 2);
      const near = (side: number) => distanceToShore(shores, add(mid, scale(left, (side * p.width) / 2)));
      ladderSide = near(1) <= near(-1) ? -1 : 1;
    }
    evenlySpaced(0, length, spacing.ladderSpacing).forEach((t, i) => {
      const side = p.access ? ladderSide : i % 2 === 0 ? -1 : 1;
      items.push({ id: `${p.id}-LAD${i + 1}`, kind: 'ladder', holdsId: p.id, at: at(t, (side * p.width) / 2), t });
    });
    evenlySpaced(0, length, spacing.safetyPostSpacing).forEach((t, i) => items.push({ id: `${p.id}-SP${i + 1}`, kind: 'safetyPost', holdsId: p.id, at: at(t), t }));
    if (p.access || !(spacing.berthsPerPedestal > 0)) continue;
    // Pedestals over the berthed part of the pier.
    const slots = layout.berths.filter((b) => b.pierId === p.id && !b.removed);
    if (slots.length === 0) continue;
    served += slots.length;
    const ts = slots.flatMap((b) => b.slot.map((q) => Math.min(length, Math.max(0, dot(sub(q, p.start), along)))));
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const n = Math.ceil(slots.length / spacing.berthsPerPedestal);
    for (let i = 0; i < n; i++) {
      const t = lo + ((i + 0.5) * (hi - lo)) / n;
      items.push({ id: `${p.id}-PED${i + 1}`, kind: 'pedestal', holdsId: p.id, at: at(t), t });
    }
  }
  return { items, berths: served };
}
