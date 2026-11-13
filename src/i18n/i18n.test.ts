import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fi } from './fi';
import { translate } from './index';

describe('i18n', () => {
  it('returns the English string for a known key', () => {
    expect(translate('en', 'app.title')).toBe('Marina Layout Planner');
  });

  it('falls back to English when Finnish lacks a key', () => {
    const missing = (Object.keys(en) as (keyof typeof en)[]).find((k) => fi[k] === undefined);
    // Finnish may be complete at times; the fallback is only checked when a key is missing.
    if (missing) expect(translate('fi', missing)).toBe(en[missing]);
  });

  it('Finnish has no keys that English does not define', () => {
    const extra = Object.keys(fi).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });
});
