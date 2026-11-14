/**
 * Price list: products, labour and plant rates, and cost parameters (DECISIONS D18, D19).
 *
 * The price list is read from the Excel file `data/hinnasto.xlsx` (or a file the user
 * imports). Every row keeps the price exactly as its source published it, whether that
 * price includes VAT, the source and the date, so that the estimate stays traceable.
 * Prices used in calculations are VAT 0 % (D18).
 */

export const PRODUCT_CATEGORIES = [
  'pontoon',
  'finger',
  'gangway',
  'chain',
  'anchor',
  'shackle',
  'spring',
  'anode',
  'cleat',
  'ladder',
  'power',
  'labour',
  'plant',
  'transport',
  'other',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_UNITS = ['pcs', 'm', 'kg', 'h', 'day', 'lump'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

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
