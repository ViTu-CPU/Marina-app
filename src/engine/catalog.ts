/**
 * Price list: products, labour and plant rates, and cost parameters (DECISIONS D18, D19).
 *
 * The price list is read from the Excel file `data/hinnasto.xlsx` (or a file the user
 * imports). Every row keeps the price exactly as its source published it, whether that
 * price includes VAT, the source and the date, so that the estimate stays traceable.
 * Prices used in calculations are VAT 0 % (D18).
 */

import { SEABED_KEYS, type SeabedKey } from './mooring';

export const PRODUCT_CATEGORIES = [
  'pontoon',
  'finger',
  'gangway',
  'chain',
  'anchor',
  'wall_fixing',
  'buoy',
  'shackle',
  'spring',
  'anode',
  'cleat',
  'ladder',
  'safety_post',
  'power',
  'labour',
  'plant',
  'transport',
  'other',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_UNITS = ['pcs', 'm', 'kg', 'h', 'day', 'lump'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** Seabed types of the anchoring calculation (D64: NAVFAC DM-7.02 keys of engine/mooring.ts). */
export const SEABED_TYPES = SEABED_KEYS;
export type SeabedType = SeabedKey;

/**
 * D62, D64: kinds of anchor in the price list (`anchor_type`). 'block' = concrete weight, sized by
 * the mooring calculation; 'pile' = pile anchor at the end of a chain (length and section by
 * geotechnical design). Owner (D64): no other kinds.
 */
export const ANCHOR_KINDS = ['block', 'pile'] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/**
 * D62: where an anchor's capacity comes from (`capacity_basis`): 'friction_model' = computed from
 * its mass and the seabed friction (blocks); 'published' = the supplier's published figure (needs
 * source_url and source_date).
 */
export const CAPACITY_BASES = ['friction_model', 'published'] as const;
export type CapacityBasis = (typeof CAPACITY_BASES)[number];

export interface Product {
  /** Unique key, stable across edits of the file. */
  id: string;
  category: ProductCategory;
  supplier: string;
  /** Products of one series are alternatives of different size (e.g. one pontoon width). */
  series: string;
  name: string;
  code: string;
  unit: ProductUnit;
  /** Price as published by the source, €, per unit; null when no price is known. */
  price: number | null;
  /** Whether `price` includes VAT. */
  priceIncludesVat: boolean;
  /** Extra quantity ordered on top of the calculated one (waste, cutting), %. */
  marginPct: number;
  lengthM: number | null;
  widthM: number | null;
  weightKg: number | null;
  /** Load capacity (buoyancy reserve) as published, kg. */
  capacityKg: number | null;
  freeboardM: number | null;
  chainDiameterMm: number | null;
  chainGrade: string;
  /** Minimum breaking load as published, kN. */
  breakingLoadKn: number | null;
  massKgPerM: number | null;
  anchorMassKg: number | null;
  /** D62: anchors: the kind (`anchor_type`); null = not given, which counts as 'block'. */
  anchorKind: AnchorKind | null;
  /** D62: anchors other than blocks: holding capacity of one piece against horizontal pull as published, kN. */
  capacityHorizontalKn: number | null;
  /** D62: anchors other than blocks: holding capacity of one piece against uplift as published, kN. */
  capacityUpliftKn: number | null;
  capacityBasis: CapacityBasis | null;
  /** D62: anchors: the seabeds the product suits; empty = not stated (a block suits any). */
  seabeds: SeabedType[];
  /**
   * D62: price of one piece installed (supply and installation), €, with the VAT status of `price`;
   * null = `price` is the supply price and the installation is estimated from the labour parameters.
   */
  installedPrice: number | null;
  shackleMm: number | null;
  sourceUrl: string;
  /** Date the source was read, YYYY-MM-DD. */
  sourceDate: string;
  /** Anything a reader must know: unverified, assumption, what the price includes. */
  note: string;
}

export interface PriceParameter {
  key: string;
  value: number;
  unit: string;
  description: string;
  /** Where the value comes from, or "Assumption". */
  source: string;
}

export interface PriceList {
  /** Where the list came from (file name). */
  title: string;
  products: Product[];
  parameters: PriceParameter[];
}

/** Value of a parameter, or `fallback` when the list does not define it. */
export function parameter(list: PriceList, key: string, fallback: number): number {
  return list.parameters.find((p) => p.key === key)?.value ?? fallback;
}

/** VAT rate used when the price list does not give one, %. */
export const DEFAULT_VAT_PCT = 25.5;

/** Unit price without VAT, €, or null when the product has no price. */
export function unitPriceVat0(product: Product, vatPct: number): number | null {
  if (product.price === null) return null;
  return product.priceIncludesVat ? product.price / (1 + vatPct / 100) : product.price;
}

/** D62: installed price of one piece without VAT, €, or null when the list gives none. */
export function installedPriceVat0(product: Product, vatPct: number): number | null {
  if (product.installedPrice === null) return null;
  return product.priceIncludesVat ? product.installedPrice / (1 + vatPct / 100) : product.installedPrice;
}

/** D62: the kind of an anchor; rows without `anchor_type` are concrete blocks. */
export const anchorKindOf = (product: Product): AnchorKind => product.anchorKind ?? 'block';
