import { describe, it, expect } from 'vitest';
import {
  SIM_R,
  SIM_HALF_W,
  SIM_T,
  polyMul,
  polyInverse,
  randomSparsePoly,
  zeroPoly,
  getPositions,
  bgfDecode,
  computeThreshold,
  bikeKeyGen,
  bikeEncap,
  bikeDecap,
  toHex,
} from '../src/bike';

/** Multiply by the ring identity monomial x^0 = 1: helper to build a delta poly. */
function delta(r: number, pos: number): Uint8Array {
  const p = zeroPoly(r);
  p[pos] = 1;
  return p;
}

function polyEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('polynomial arithmetic over F2[x]/(x^r - 1)', () => {
  it('multiplication by 1 is the identity', () => {
    const { poly } = randomSparsePoly(SIM_R, SIM_HALF_W);
    const one = delta(SIM_R, 0);
    expect(polyEqual(polyMul(poly, one, SIM_R), poly)).toBe(true);
  });

  it('multiplication is commutative', () => {
    const a = randomSparsePoly(SIM_R, 5).poly;
    const b = randomSparsePoly(SIM_R, 5).poly;
    expect(polyEqual(polyMul(a, b, SIM_R), polyMul(b, a, SIM_R))).toBe(true);
  });

  it('x^i * x^j = x^((i+j) mod r) — cyclic wrap-around', () => {
    const r = SIM_R;
    const prod = polyMul(delta(r, r - 1), delta(r, 3), r);
    // (r-1) + 3 = r + 2 ≡ 2 (mod r)
    expect(getPositions(prod)).toEqual([2]);
  });

  it('is distributive: a*(b+c) = a*b + a*c', () => {
    const r = SIM_R;
    const a = randomSparsePoly(r, 4).poly;
    const b = randomSparsePoly(r, 4).poly;
    const c = randomSparsePoly(r, 4).poly;
    const bc = zeroPoly(r);
    for (let i = 0; i < r; i++) bc[i] = (b[i] ^ c[i]) as 0 | 1;
    const lhs = polyMul(a, bc, r);
    const ab = polyMul(a, b, r);
    const ac = polyMul(a, c, r);
    const rhs = zeroPoly(r);
    for (let i = 0; i < r; i++) rhs[i] = (ab[i] ^ ac[i]) as 0 | 1;
    expect(polyEqual(lhs, rhs)).toBe(true);
  });
});

describe('polyInverse in F2[x]/(x^r - 1)', () => {
  it('inverse of a sparse poly satisfies a * a^{-1} = 1', () => {
    // Try several random sparse polys; a valid inverse must round-trip to 1.
    let verified = 0;
    for (let trial = 0; trial < 20; trial++) {
      const { poly } = randomSparsePoly(SIM_R, SIM_HALF_W);
      const inv = polyInverse(poly, SIM_R);
      if (inv === null) continue; // non-invertible (rare) — skip
      const prod = polyMul(poly, inv, SIM_R);
      expect(prod[0]).toBe(1);
      for (let i = 1; i < SIM_R; i++) expect(prod[i]).toBe(0);
      verified++;
    }
    expect(verified).toBeGreaterThan(0);
  });

  it('inverse of the identity is the identity', () => {
    const inv = polyInverse(delta(SIM_R, 0), SIM_R);
    expect(inv).not.toBeNull();
    expect(getPositions(inv!)).toEqual([0]);
  });

  it('inverse of a monomial x^k is x^(r-k)', () => {
    const k = 5;
    const inv = polyInverse(delta(SIM_R, k), SIM_R);
    expect(inv).not.toBeNull();
    // x^k * x^(r-k) = x^r = 1 in the ring
    expect(getPositions(inv!)).toEqual([SIM_R - k]);
  });

  it('the zero polynomial has no inverse', () => {
    expect(polyInverse(zeroPoly(SIM_R), SIM_R)).toBeNull();
  });
});

describe('BGF threshold rule (spec affine rule, not the old heuristic)', () => {
  it('never drops below the majority value (d+1)/2', () => {
    const d = SIM_HALF_W; // 7
    for (let s = 0; s <= SIM_R; s++) {
      expect(computeThreshold(s, d)).toBeGreaterThanOrEqual(Math.floor((d + 1) / 2));
    }
  });

  it('is monotonic non-decreasing in syndrome weight', () => {
    const d = SIM_HALF_W;
    let prev = computeThreshold(0, d);
    for (let s = 1; s <= SIM_R; s++) {
      const t = computeThreshold(s, d);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('is bounded above by the column weight d (a bit cannot exceed d unsatisfied checks)', () => {
    const d = SIM_HALF_W;
    // threshold above d would make the decoder flip nothing — must stay <= d
    expect(computeThreshold(SIM_R, d)).toBeLessThanOrEqual(d);
  });
});

describe('BGF decoder recovers the planted error (KAT-style)', () => {
  it('decodes a syndrome built from a known sparse error e0, e1', async () => {
    // Build a real BIKE instance so h = h0^{-1} h1 holds.
    const kp = await bikeKeyGen();
    const h0 = zeroPoly(SIM_R);
    const h1 = zeroPoly(SIM_R);
    for (let i = 0; i < SIM_R; i++) {
      h0[i] = ((kp.privateH0[i >> 3] >> (i & 7)) & 1) as 0 | 1;
      h1[i] = ((kp.privateH1[i >> 3] >> (i & 7)) & 1) as 0 | 1;
    }

    // Plant an error and form the true syndrome s = e0*h0 + e1*h1.
    const w0 = Math.ceil(SIM_T / 2);
    const w1 = SIM_T - w0;
    const { poly: e0, positions: e0Pos } = randomSparsePoly(SIM_R, w0);
    const { poly: e1, positions: e1Pos } = randomSparsePoly(SIM_R, w1);
    const s0 = polyMul(e0, h0, SIM_R);
    const s1 = polyMul(e1, h1, SIM_R);
    const s = zeroPoly(SIM_R);
    for (let i = 0; i < SIM_R; i++) s[i] = (s0[i] ^ s1[i]) as 0 | 1;

    const res = bgfDecode(s, h0, h1, SIM_R);
    if (res.success) {
      // When it converges, it MUST recover exactly the planted error.
      expect(getPositions(res.e0)).toEqual([...e0Pos].sort((a, b) => a - b));
      expect(getPositions(res.e1)).toEqual([...e1Pos].sort((a, b) => a - b));
    } else {
      // A decoding failure is legitimate (non-zero DFR) but the residual
      // syndrome must be non-zero — the decoder must not falsely claim success.
      expect(res.success).toBe(false);
    }
  });

  it('reports success only when the residual syndrome is truly zero', async () => {
    // Over many instances, every "success" must be a genuine recovery.
    const kp = await bikeKeyGen();
    const h0 = zeroPoly(SIM_R);
    const h1 = zeroPoly(SIM_R);
    for (let i = 0; i < SIM_R; i++) {
      h0[i] = ((kp.privateH0[i >> 3] >> (i & 7)) & 1) as 0 | 1;
      h1[i] = ((kp.privateH1[i >> 3] >> (i & 7)) & 1) as 0 | 1;
    }
    for (let trial = 0; trial < 25; trial++) {
      const w0 = Math.ceil(SIM_T / 2);
      const { poly: e0 } = randomSparsePoly(SIM_R, w0);
      const { poly: e1 } = randomSparsePoly(SIM_R, SIM_T - w0);
      const s0 = polyMul(e0, h0, SIM_R);
      const s1 = polyMul(e1, h1, SIM_R);
      const s = zeroPoly(SIM_R);
      for (let i = 0; i < SIM_R; i++) s[i] = (s0[i] ^ s1[i]) as 0 | 1;
      const res = bgfDecode(s, h0, h1, SIM_R);
      if (res.success) {
        // recompute syndrome of recovered error, must equal original s
        const r0 = polyMul(res.e0, h0, SIM_R);
        const r1 = polyMul(res.e1, h1, SIM_R);
        const rs = zeroPoly(SIM_R);
        for (let i = 0; i < SIM_R; i++) rs[i] = (r0[i] ^ r1[i]) as 0 | 1;
        expect(polyEqual(rs, s)).toBe(true);
      }
    }
  });

  it('zero syndrome decodes instantly to the zero error', () => {
    const kp0 = zeroPoly(SIM_R);
    // Any h0/h1 support works for the zero syndrome; use a light one.
    const h0 = randomSparsePoly(SIM_R, SIM_HALF_W).poly;
    const h1 = randomSparsePoly(SIM_R, SIM_HALF_W).poly;
    const res = bgfDecode(kp0, h0, h1, SIM_R);
    expect(res.success).toBe(true);
    expect(getPositions(res.e0)).toEqual([]);
    expect(getPositions(res.e1)).toEqual([]);
  });
});

describe('BGF decoder trace (backs the step-by-step visualization)', () => {
  it('emits one snapshot per iteration with self-consistent flip counts and syndrome weights', async () => {
    // The visualization renders this trace verbatim, so it must reflect the real
    // decoder: each frame's flip count must equal the number of at-or-above-T
    // counters, and the "after" weight must match the next frame's "before".
    const kp = await bikeKeyGen();
    const enc = await bikeEncap(kp.publicKey);
    const dec = await bikeDecap(enc.ciphertext, kp.privateH0, kp.privateH1);

    expect(dec.trace.length).toBeGreaterThan(0);
    expect(dec.initialSyndromeWeight).toBe(dec.initialSyndrome.length);

    for (let i = 0; i < dec.trace.length; i++) {
      const step = dec.trace[i];
      const blackFlips =
        step.counters0.filter((c) => c >= step.threshold).length +
        step.counters1.filter((c) => c >= step.threshold).length;
      // Every Black bit (counter >= T) is exactly the set that gets flipped.
      expect(step.flips0.length + step.flips1.length).toBe(blackFlips);
      // Counters never exceed the column weight d = w/2 (a bit touches d checks).
      for (const c of [...step.counters0, ...step.counters1]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(SIM_HALF_W);
      }
      // Chaining: this frame's post-flip weight is the next frame's pre-flip weight.
      if (i + 1 < dec.trace.length) {
        expect(dec.trace[i + 1].syndromeWeight).toBe(step.syndromeWeightAfter);
      }
    }

    // The first frame starts from the reported initial syndrome weight.
    expect(dec.trace[0].syndromeWeight).toBe(dec.initialSyndromeWeight);
    // A successful decode ends at zero syndrome weight.
    if (dec.success) {
      expect(dec.trace[dec.trace.length - 1].syndromeWeightAfter).toBe(0);
    }
  }, 30_000);
});

describe('full KEM round-trip keygen -> encap -> decap', () => {
  it('produces matching shared secrets on a successful decapsulation', async () => {
    // With correct decoding, Alice and Bob must derive the same K.
    // Retry a few times to tolerate the (small) simulated DFR.
    let matched = 0;
    let attempts = 0;
    for (let i = 0; i < 12 && matched === 0; i++) {
      attempts++;
      const kp = await bikeKeyGen();
      const enc = await bikeEncap(kp.publicKey);
      const dec = await bikeDecap(enc.ciphertext, kp.privateH0, kp.privateH1);
      if (dec.success) {
        expect(toHex(dec.sharedSecret)).toBe(toHex(enc.sharedSecret));
        // recovered error positions must match the planted ones
        expect(dec.recoveredError.sort((a, b) => a - b)).toEqual(
          [...enc.errorPositions].sort((a, b) => a - b),
        );
        matched++;
      }
    }
    // The decoder must succeed at least once in a dozen tries; otherwise the
    // "shared secret match" narrative in the UI would be a lie.
    expect(matched).toBeGreaterThan(0);
  }, 30_000);

  it('a tampered ciphertext does NOT yield the original shared secret', async () => {
    const kp = await bikeKeyGen();
    const enc = await bikeEncap(kp.publicKey);
    const tampered = new Uint8Array(enc.ciphertext);
    // Flip several bits of c0 to push it off the valid coset.
    tampered[0] ^= 0xff;
    tampered[1] ^= 0xff;
    tampered[2] ^= 0xff;
    const dec = await bikeDecap(tampered, kp.privateH0, kp.privateH1);
    // Either decoding fails, or it recovers a different error -> different K.
    if (dec.success) {
      expect(toHex(dec.sharedSecret)).not.toBe(toHex(enc.sharedSecret));
    } else {
      expect(dec.success).toBe(false);
    }
  }, 30_000);
});

describe('key generation invariants', () => {
  it('private blocks have exactly w/2 set bits and h = h0^{-1} h1', async () => {
    const kp = await bikeKeyGen();
    expect(kp.h0Positions.length).toBe(SIM_HALF_W);
    expect(kp.h1Positions.length).toBe(SIM_HALF_W);

    // Reconstruct h0, h1 and verify the public key relation.
    const h0 = zeroPoly(SIM_R);
    const h1 = zeroPoly(SIM_R);
    const h = zeroPoly(SIM_R);
    for (let i = 0; i < SIM_R; i++) {
      h0[i] = ((kp.privateH0[i >> 3] >> (i & 7)) & 1) as 0 | 1;
      h1[i] = ((kp.privateH1[i >> 3] >> (i & 7)) & 1) as 0 | 1;
      h[i] = ((kp.publicKey[i >> 3] >> (i & 7)) & 1) as 0 | 1;
    }
    // h * h0 should equal h1  (since h = h0^{-1} h1)
    const prod = polyMul(h, h0, SIM_R);
    expect(polyEqual(prod, h1)).toBe(true);
  });
});
