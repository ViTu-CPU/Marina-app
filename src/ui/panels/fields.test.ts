import { describe, expect, it } from 'vitest';
import { parseLengthList } from './fields';

describe('length list input (D29)', () => {
  it('accepts spaces, semicolons and "comma + space" between entries, and a decimal comma inside one', () => {
    expect(parseLengthList('4, 5, 6, 10.5')).toEqual([4, 5, 6, 10.5]);
    expect(parseLengthList('4; 5; 10,5')).toEqual([4, 5, 10.5]);
    expect(parseLengthList('12 6 6 8')).toEqual([6, 8, 12]);
    expect(parseLengthList('  ')).toEqual([]);
  });

  it('rejects anything that is not a positive length', () => {
    expect(parseLengthList('4, x')).toBeNull();
    expect(parseLengthList('4, 0')).toBeNull();
    expect(parseLengthList('4,5,6')).toBeNull(); // ambiguous without spaces
  });

  it('allows 0 when asked (gangway positions, D32)', () => {
    expect(parseLengthList('0; 30')).toBeNull();
    expect(parseLengthList('0; 30', true)).toEqual([0, 30]);
    expect(parseLengthList('-1', true)).toBeNull();
  });
});
