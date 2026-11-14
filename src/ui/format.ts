/**
 * Number formatting for display (SPEC §3, DECISIONS D1):
 * lengths in metres with 1 decimal, areas in m² as integers, counts as integers.
 */
import type { Language } from '../i18n';

const LOCALE: Record<Language, string> = { en: 'en-GB', fi: 'fi-FI' };

const formatter = (language: Language, decimals: number): Intl.NumberFormat =>
  new Intl.NumberFormat(LOCALE[language], { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Length in metres, 1 decimal, without the unit. */
export const formatLength = (metres: number, language: Language = 'en'): string => formatter(language, 1).format(metres);

/** Area in m², integer, without the unit. */
export const formatArea = (squareMetres: number, language: Language = 'en'): string =>
  formatter(language, 0).format(Math.round(squareMetres));

export const formatCount = (count: number, language: Language = 'en'): string =>
  formatter(language, 0).format(Math.round(count));

/** A ratio such as berths per 1,000 m², 2 decimals. */
export const formatRatio = (value: number, language: Language = 'en'): string => formatter(language, 2).format(value);

export const formatPercent = (fraction: number, language: Language = 'en'): string =>
  `${formatter(language, 0).format(Math.round(fraction * 100))} %`;

/** Money in euros, whole euros with grouping, without the unit. */
export const formatEuro = (euros: number, language: Language = 'en'): string => formatter(language, 0).format(Math.round(euros));

/** A force in kN, 1 decimal, without the unit. */
export const formatKn = (kn: number, language: Language = 'en'): string => formatter(language, 1).format(kn);
