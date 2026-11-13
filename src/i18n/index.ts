import { en, type StringKey } from './en';
import { fi } from './fi';

export type Language = 'en' | 'fi';
export type { StringKey };

const dictionaries: Record<Language, Partial<Record<StringKey, string>>> = { en, fi };

/** Look up a UI string; falls back to English when the language lacks the key. */
export function translate(language: Language, key: StringKey): string {
  return dictionaries[language][key] ?? en[key];
}
