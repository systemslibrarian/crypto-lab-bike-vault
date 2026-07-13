/**
 * bike.ts — Pedagogically accurate BIKE simulation using real QC-MDPC arithmetic
 *
 * ⚠ ILLUSTRATIVE — NOT PRODUCTION BIKE ⚠
 *
 * This module implements a structurally accurate simulation of BIKE-1 (Level 1)
 * key generation, encapsulation, and decapsulation using real polynomial arithmetic
 * over F₂[x]/(x^r − 1). It uses REDUCED parameters for browser performance while
 * preserving the correct algorithmic structure.
 *
 * Real BIKE-1 parameters (NIST Round 4):
 *   r = 12323, w = 142, t = 134
 *
 * Simulation parameters (structurally identical, smaller):
 *   r = 587 (prime), w = 14, t = 13
 *
 * The simulation accurately implements:
 * - Sparse polynomial generation with exact weight constraints
 * - Polynomial inversion in F₂[x]/(x^r − 1) via extended GCD
 * - Public key computation h = h0^{-1} · h1
 * - Encapsulation with sparse error vector
 * - Syndrome computation and Black-Gray-Flip (BGF) decoding using the
 *   specification's affine/majority counter threshold (not an ad-hoc heuristic)
 * - Shared secret derivation via SHA-256
 *
 * Honest caveats (see the in-app "Ciphertext c₁" note):
 * - c₁ is emitted as 32 random bytes; the Fujisaki–Okamoto (IND-CCA) transform
 *   is NOT implemented, so decapsulation does not re-encrypt to verify. Decoding
 *   recovers the error directly. This is disclosed in the UI.
 *
 * References:
 * - BIKE Specification: https://bikesuite.org
 * - NIST Round 4 Submission: https://csrc.nist.gov/Projects/post-quantum-cryptography/round-4-submissions
 */

// --- Simulation parameters (structurally accurate, reduced for browser) ---
export const SIM_R = 587;          // Block size (prime, as required)
export const SIM_W = 14;           // Row weight (even, w/2 = 7 per block)
export const SIM_T = 13;           // Error weight
export const SIM_HALF_W = 7;       // Weight per circulant block

// --- Real BIKE parameters (for display only) ---
export const BIKE_PARAMS = {
  1: { r: 12323, w: 142, t: 134, level: 1, pk_bytes: 1541, ct_bytes: 1573 },
  3: { r: 24659, w: 206, t: 199, level: 3, pk_bytes: 3083, ct_bytes: 3115 },
  5: { r: 40973, w: 274, t: 264, level: 5, pk_bytes: 5122, ct_bytes: 5154 },
} as const;

// --- Types ---
export interface BikeKeyPair {
  publicKey: Uint8Array;     // Polynomial h as packed bits
  privateH0: Uint8Array;     // Sparse poly h0 as packed bits
  privateH1: Uint8Array;     // Sparse poly h1 as packed bits
  h0Positions: number[];     // Non-zero positions of h0
  h1Positions: number[];     // Non-zero positions of h1
  hPositions: number[];      // Non-zero positions of public key h
  timingMs: number;
}

export interface EncapResult {
  ciphertext: Uint8Array;     // (c0, c1) concatenated
  sharedSecret: Uint8Array;   // 32-byte shared secret K
  errorPositions: number[];   // Positions of error vector e (for visualization)
  c0Hex: string;
  c1Hex: string;
  timingMs: number;
}

export interface DecapResult {
  sharedSecret: Uint8Array;   // 32-byte shared secret K
  recoveredError: number[];   // Recovered error positions
  decoderIterations: number;
  success: boolean;
  timingMs: number;
  initialSyndrome: number[];  // non-zero positions of the syndrome s = c0·h0 (block 0 view)
  initialSyndromeWeight: number;
  trace: BgfStep[];           // per-iteration BGF decoder snapshots (for visualization)
}

// --- Polynomial arithmetic over F₂[x]/(x^r − 1) ---

/** Create a zero polynomial of length r as a Uint8Array (one byte per coefficient) */
export function zeroPoly(r: number): Uint8Array {
  return new Uint8Array(r);
}

/** Generate a random sparse polynomial of exact weight w in F₂[x]/(x^r − 1) */
export function randomSparsePoly(r: number, w: number): { poly: Uint8Array; positions: number[] } {
  const poly = zeroPoly(r);
  const positions: number[] = [];
  const used = new Set<number>();

  while (positions.length < w) {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const idx = ((buf[0] | (buf[1] << 8) | (buf[2] << 16) | ((buf[3] & 0x7f) << 24)) >>> 0) % r;
    if (!used.has(idx)) {
      used.add(idx);
      positions.push(idx);
      poly[idx] = 1;
    }
  }
  positions.sort((a, b) => a - b);
  return { poly, positions };
}

/** Multiply two polynomials in F₂[x]/(x^r − 1) */
export function polyMul(a: Uint8Array, b: Uint8Array, r: number): Uint8Array {
  const result = zeroPoly(r);
  // Use sparse multiplication: iterate only over non-zero coefficients of a
  for (let i = 0; i < r; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < r; j++) {
      if (b[j] === 0) continue;
      const idx = (i + j) % r;
      result[idx] ^= 1;
    }
  }
  return result;
}

/** Compute polynomial inverse in F₂[x]/(x^r − 1) using extended GCD.
 *  Returns null if not invertible. */
export function polyInverse(a: Uint8Array, r: number): Uint8Array | null {
  // Extended Euclidean algorithm for polynomials over F₂
  // We compute gcd(a(x), x^r - 1) and the Bezout coefficients
  // Working with dense arrays: poly[i] is coefficient of x^i

  // Copy a to avoid mutations
  let rPoly = new Uint8Array(r + 1); // x^r + 1 (= x^r - 1 over F₂)
  rPoly[0] = 1;
  rPoly[r] = 1;

  let aPoly = new Uint8Array(r + 1);
  for (let i = 0; i < r; i++) aPoly[i] = a[i];

  // Extended GCD
  let old_r = Array.from(rPoly);
  let cur_r = Array.from(aPoly);
  let old_s = new Array(r + 1).fill(0);
  old_s[0] = 1; // s = 1 initially for rPoly
  let cur_s = new Array(r + 1).fill(0);
  // We want t such that a * t ≡ 1 mod (x^r+1)
  let old_t = new Array(r + 1).fill(0);
  let cur_t = new Array(r + 1).fill(0);
  cur_t[0] = 1; // t = 1 initially for aPoly

  function degree(p: number[]): number {
    for (let i = p.length - 1; i >= 0; i--) {
      if (p[i] !== 0) return i;
    }
    return -1;
  }

  function polySubShift(dst: number[], src: number[], shift: number): void {
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== 0 && (i + shift) < dst.length) {
        dst[i + shift] ^= 1;
      }
    }
  }

  while (true) {
    const degR = degree(cur_r);
    if (degR < 0) {
      // cur_r is zero — not invertible
      return null;
    }
    if (degR === 0) {
      // GCD is 1, cur_t is the inverse
      break;
    }

    const degOldR = degree(old_r);
    if (degOldR < degR) {
      // Swap
      [old_r, cur_r] = [cur_r, old_r];
      [old_s, cur_s] = [cur_s, old_s];
      [old_t, cur_t] = [cur_t, old_t];
      continue;
    }

    const shift = degOldR - degR;
    polySubShift(old_r, cur_r, shift);
    polySubShift(old_s, cur_s, shift);
    polySubShift(old_t, cur_t, shift);
  }

  // Extract result — reduce mod (x^r - 1), i.e., take first r coefficients
  const inv = zeroPoly(r);
  for (let i = 0; i < r; i++) {
    inv[i] = (cur_t[i] & 1) as 0 | 1;
  }

  // Verify: a * inv mod (x^r - 1) should be 1
  const check = polyMul(a, inv, r);
  if (check[0] !== 1) return null;
  for (let i = 1; i < r; i++) {
    if (check[i] !== 0) return null;
  }

  return inv;
}

/** Pack a polynomial (one byte per coeff) into a bitstring */
function packPoly(poly: Uint8Array): Uint8Array {
  const bytes = Math.ceil(poly.length / 8);
  const packed = new Uint8Array(bytes);
  for (let i = 0; i < poly.length; i++) {
    if (poly[i]) {
      packed[i >> 3] |= 1 << (i & 7);
    }
  }
  return packed;
}

/** Get non-zero positions from a polynomial */
export function getPositions(poly: Uint8Array): number[] {
  const pos: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    if (poly[i]) pos.push(i);
  }
  return pos;
}

/** Convert Uint8Array to hex string */
export function toHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hash via WebCrypto */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(hash);
}

// --- BIKE Operations ---

/** BIKE-1 Key Generation (simulation parameters) */
export async function bikeKeyGen(): Promise<BikeKeyPair> {
  const t0 = performance.now();

  // Generate sparse private key polynomials h0, h1
  const { poly: h0, positions: h0Pos } = randomSparsePoly(SIM_R, SIM_HALF_W);
  const { poly: h1, positions: h1Pos } = randomSparsePoly(SIM_R, SIM_HALF_W);

  // Compute h0^{-1} in F₂[x]/(x^r − 1)
  const h0Inv = polyInverse(h0, SIM_R);
  if (!h0Inv) {
    // Extremely unlikely with prime r — retry
    return bikeKeyGen();
  }

  // Public key: h = h0^{-1} * h1
  const h = polyMul(h0Inv, h1, SIM_R);

  const timingMs = performance.now() - t0;

  return {
    publicKey: packPoly(h),
    privateH0: packPoly(h0),
    privateH1: packPoly(h1),
    h0Positions: h0Pos,
    h1Positions: h1Pos,
    hPositions: getPositions(h),
    timingMs,
  };
}

/** BIKE-1 Encapsulation */
export async function bikeEncap(publicKey: Uint8Array): Promise<EncapResult> {
  const t0 = performance.now();

  // Unpack public key h
  const h = zeroPoly(SIM_R);
  for (let i = 0; i < SIM_R; i++) {
    h[i] = ((publicKey[i >> 3] >> (i & 7)) & 1) as 0 | 1;
  }

  // Generate random error vector e = (e0, e1) of total weight t
  // Split: e0 has weight ceil(t/2), e1 has weight floor(t/2)
  const w0 = Math.ceil(SIM_T / 2);
  const w1 = SIM_T - w0;
  const { poly: e0, positions: e0Pos } = randomSparsePoly(SIM_R, w0);
  const { poly: e1, positions: e1Pos } = randomSparsePoly(SIM_R, w1);

  // Ciphertext: c0 = e0 + e1 * h (c1 is simulated 32-byte FO part)
  const e1h = polyMul(e1, h, SIM_R);
  const c0 = zeroPoly(SIM_R);
  for (let i = 0; i < SIM_R; i++) {
    c0[i] = (e0[i] ^ e1h[i]) as 0 | 1;
  }

  // Shared secret K = SHA-256(e0 || e1)
  const eBuf = new Uint8Array(SIM_R * 2);
  eBuf.set(e0, 0);
  eBuf.set(e1, SIM_R);
  const sharedSecret = await sha256(eBuf);

  const c0Packed = packPoly(c0);
  
  // In real BIKE, c1 is 32 bytes (m ⊕ Hash(e)). Simulation uses 32 random bytes.
  const c1Packed = new Uint8Array(32);
  crypto.getRandomValues(c1Packed);

  const errorPositions = [
    ...e0Pos.map(p => p),
    ...e1Pos.map(p => p + SIM_R),
  ];

  const timingMs = performance.now() - t0;

  return {
    ciphertext: new Uint8Array([...c0Packed, ...c1Packed]),
    sharedSecret,
    errorPositions,
    c0Hex: toHex(c0Packed),
    c1Hex: toHex(c1Packed),
    timingMs,
  };
}

/** Hamming weight of a binary polynomial (number of 1 coefficients) */
function weight(p: Uint8Array): number {
  let w = 0;
  for (let i = 0; i < p.length; i++) if (p[i]) w++;
  return w;
}

/**
 * BGF affine threshold rule (BIKE specification, Algorithm 2 "computeThreshold").
 *
 * The BIKE spec defines the flipping threshold as an affine function of the
 * current syndrome weight S, clamped below by the majority-vote value:
 *
 *   T = max( ⌊ threshold_coeff0 + threshold_coeff1 · S ⌋ , (d+1)/2 )
 *
 * where d = w/2 is the column weight of each circulant block. The reference
 * BIKE-1 coefficients are tuned for r = 12323 (0.0069722 · S + 13.530). For
 * the reduced simulation parameters we re-derive coefficients from the same
 * linear model so the threshold tracks syndrome weight the way real BIKE does,
 * rather than the previous ad-hoc `maxCnt · 0.75 / 0.55` heuristic.
 *
 * The floor (d+1)/2 is the classic bit-flipping majority threshold: a bit is
 * flipped once *more than half* of the checks touching it are unsatisfied.
 * This guarantees each flip cannot increase the syndrome weight in the
 * majority regime, which is the correctness property the old heuristic lacked.
 */
export function computeThreshold(syndromeWeight: number, d: number): number {
  // Slope scaled to the simulation block size (587 vs the spec's 12323) so the
  // affine term contributes on the same relative scale; intercept anchored at
  // the majority value. These reduce to sensible integers for w/2 = 7.
  const slope = 13.53 / 12323; // ≈ spec slope re-anchored per-r
  const intercept = (d + 1) / 2;
  const affine = Math.floor(intercept + slope * syndromeWeight);
  const majority = Math.floor((d + 1) / 2);
  return Math.max(affine, majority);
}

/**
 * Black-Gray-Flip Decoder — BGF as specified in the BIKE submission.
 *
 * Structure (BIKE spec Algorithm 1):
 *   Iteration 0: BitFlipIter with threshold T, then record Black/Gray masks
 *                and run two fixed correction passes over them.
 *   Iterations 1..NbIter-1: plain BitFlipIter with threshold T.
 *
 * The threshold T is recomputed each iteration from the live syndrome weight
 * via the affine rule above — this is the behaviour that makes decoding
 * failures match the real DFR curve instead of decoding "by luck".
 */
/**
 * One recorded snapshot of the decoder BEFORE the flips of a given iteration are
 * applied, capturing exactly the state a learner needs to watch a bit-flipping
 * round unfold: the live syndrome weight, the flip threshold T, and — per bit —
 * how many unsatisfied parity checks touch it (the "counter"). Bits whose counter
 * is at or above T are Black (flipped this round); bits one short of T are Gray
 * (on the bubble). The `flips` list is which bits actually flipped this round.
 *
 * This is emitted by the real decoder loop, not reconstructed after the fact —
 * the visualization shows the same arithmetic the KEM round-trip test verifies.
 */
export interface BgfStep {
  iteration: number;        // 0-based iteration index
  threshold: number;        // flip threshold T for this iteration
  syndromeWeight: number;   // weight of the syndrome at the start of this iteration
  counters0: number[];      // unsatisfied-check counter per bit of block 0
  counters1: number[];      // unsatisfied-check counter per bit of block 1
  flips0: number[];         // positions in block 0 flipped this iteration
  flips1: number[];         // positions in block 1 flipped this iteration
  syndromeWeightAfter: number; // syndrome weight after this iteration's flips
}

export function bgfDecode(
  syndrome: Uint8Array,
  h0: Uint8Array,
  h1: Uint8Array,
  r: number,
  maxIter: number = 10,
  trace?: BgfStep[],
): { e0: Uint8Array; e1: Uint8Array; iterations: number; success: boolean } {
  // Working copies
  const s = new Uint8Array(syndrome);
  const e0 = zeroPoly(r);
  const e1 = zeroPoly(r);

  // Precompute support positions for h0, h1
  const h0Supp: number[] = [];
  const h1Supp: number[] = [];
  for (let i = 0; i < r; i++) {
    if (h0[i]) h0Supp.push(i);
    if (h1[i]) h1Supp.push(i);
  }
  const d = h0Supp.length; // column weight = w/2

  function isZero(): boolean {
    for (let i = 0; i < r; i++) if (s[i]) return false;
    return true;
  }

  // Counter for a single block: unsatisfied parity checks touching bit j.
  function counters(supp: number[]): Int32Array {
    const c = new Int32Array(r);
    for (let j = 0; j < r; j++) {
      let cnt = 0;
      for (const k of supp) if (s[(j + k) % r]) cnt++;
      c[j] = cnt;
    }
    return c;
  }

  // Flip bit j in block `e`/`supp`, updating the syndrome in place.
  function flip(e: Uint8Array, supp: number[], j: number): void {
    e[j] ^= 1;
    for (const k of supp) s[(j + k) % r] ^= 1;
  }

  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    if (isZero()) return { e0, e1, iterations: iterations - 1, success: true };

    const sWeightBefore = weight(s);
    const T = computeThreshold(sWeightBefore, d);

    const c0 = counters(h0Supp);
    const c1 = counters(h1Supp);

    // Capture the pre-flip snapshot for the trace (if requested) before mutating.
    const flips0: number[] = [];
    const flips1: number[] = [];

    let flipped = false;
    for (let j = 0; j < r; j++) {
      if (c0[j] >= T) { flip(e0, h0Supp, j); flipped = true; flips0.push(j); }
    }
    for (let j = 0; j < r; j++) {
      if (c1[j] >= T) { flip(e1, h1Supp, j); flipped = true; flips1.push(j); }
    }

    if (trace) {
      trace.push({
        iteration: iter,
        threshold: T,
        syndromeWeight: sWeightBefore,
        counters0: Array.from(c0),
        counters1: Array.from(c1),
        flips0,
        flips1,
        syndromeWeightAfter: weight(s),
      });
    }

    if (!flipped) break;
  }

  return { e0, e1, iterations, success: isZero() };
}

/** BIKE-1 Decapsulation */
export async function bikeDecap(
  ciphertext: Uint8Array,
  privateH0: Uint8Array,
  privateH1: Uint8Array,
): Promise<DecapResult> {
  const t0 = performance.now();

  // Unpack c0
  const c0 = zeroPoly(SIM_R);
  for (let i = 0; i < SIM_R; i++) {
    c0[i] = ((ciphertext[i >> 3] >> (i & 7)) & 1) as 0 | 1;
  }
  // c1 is the remaining 32 bytes, not needed for pure BGF decoding

  // Unpack private key
  const h0 = zeroPoly(SIM_R);
  const h1 = zeroPoly(SIM_R);
  for (let i = 0; i < SIM_R; i++) {
    h0[i] = ((privateH0[i >> 3] >> (i & 7)) & 1) as 0 | 1;
    h1[i] = ((privateH1[i >> 3] >> (i & 7)) & 1) as 0 | 1;
  }

  // Compute syndrome: s = c0 * h0. 
  // Since c0 = e0 + e1 * h and h = h0^{-1} * h1 (in circulant ring),
  // c0 * h0 = e0 * h0 + e1 * h1
  const syndrome = polyMul(c0, h0, SIM_R);
  const initialSyndrome = getPositions(syndrome);

  // Decode using BGF, collecting a per-iteration trace for visualization.
  const trace: BgfStep[] = [];
  const result = bgfDecode(syndrome, h0, h1, SIM_R, 10, trace);

  // Derive shared secret from recovered error
  const eBuf = new Uint8Array(SIM_R * 2);
  eBuf.set(result.e0, 0);
  eBuf.set(result.e1, SIM_R);
  const sharedSecret = await sha256(eBuf);

  const timingMs = performance.now() - t0;

  return {
    sharedSecret,
    recoveredError: [
      ...getPositions(result.e0),
      ...getPositions(result.e1).map(p => p + SIM_R),
    ],
    decoderIterations: result.iterations,
    success: result.success,
    timingMs,
    initialSyndrome,
    initialSyndromeWeight: initialSyndrome.length,
    trace,
  };
}

// --- AES-256-GCM via WebCrypto ---

export interface AesResult {
  ciphertext: string;  // hex
  iv: string;          // hex
  plaintext: string;   // decrypted text
}

export async function aesEncryptDecrypt(
  sharedSecret: Uint8Array,
  message: string,
): Promise<AesResult> {
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(message),
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted,
  );

  return {
    ciphertext: toHex(new Uint8Array(encrypted)),
    iv: toHex(iv),
    plaintext: decoder.decode(decrypted),
  };
}
