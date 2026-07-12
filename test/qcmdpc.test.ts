import { describe, it, expect } from 'vitest';
import { parityDemo } from '../src/qcmdpc';

describe('[7,4] Hamming parity demo', () => {
  it('corrects any single-bit error and recovers the original message', () => {
    // Exhaustive over all 16 messages; the demo injects a random 1-bit error,
    // so a correct syndrome decoder must always recover the message.
    for (let m = 0; m < 16; m++) {
      const bits = [(m >> 3) & 1, (m >> 2) & 1, (m >> 1) & 1, m & 1];
      for (let trial = 0; trial < 20; trial++) {
        const res = parityDemo(bits);
        expect(res.decodedMessage).toEqual(bits);
        expect(res.success).toBe(true);
        // Exactly one bit differs between encoded and withError.
        const diff = res.encoded.reduce(
          (acc, b, i) => acc + (b !== res.withError[i] ? 1 : 0),
          0,
        );
        expect(diff).toBe(1);
      }
    }
  });

  it('rejects malformed input', () => {
    expect(() => parityDemo([1, 0, 1])).toThrow();
    expect(() => parityDemo([2, 0, 1, 0])).toThrow();
  });
});
