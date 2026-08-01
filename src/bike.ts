/**
 * bike.ts — Pedagogically accurate BIKE simulation using real QC-MDPC arithmetic
 *
 * ⚠ ILLUSTRATIVE — NOT PRODUCTION BIKE ⚠
 *
 * This module implements a structurally accurate simulation of BIKE Level 1
 * key generation, encapsulation, and decapsulation using real polynomial arithmetic
 * over F₂[x]/(x^r − 1). It uses REDUCED parameters for browser performance while
 * preserving the correct algorithmic structure.
 *
 * Real BIKE Level 1 parameters (NIST Round 4):
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
 * - Syndrome computation and the full Black-Gray-Flip decoder: the spec's affine
 *   threshold recomputed per iteration against THIS module's r, the Black and Gray
 *   masks, and both masked correction passes on the first iteration
 * - Shared secret derivation via SHA-256
 *
 * Measured decoding-failure rate at the simulation parameters: about 0.5% of
 * decodes (≈ 2⁻⁷·⁶), over 10,000 trials with a fresh keypair every 50. That is
 * the cost of the reduced r, not a property of BIKE — spec BIKE Level 1 targets
 * below 2⁻¹²⁸. Anywhere the UI quotes a DFR it says which of the two it means.
 *
 * Honest caveats (see the in-app "Ciphertext c₁" note):
 * - c₁ is emitted as 32 random bytes; the Fujisaki–Okamoto (IND-CCA) transform
 *   is NOT implemented, so decapsulation does not re-encrypt to verify. Decoding
 *   recovers the error directly. This is disclosed in the UI.
 * - Nothing here is constant-time; the decoder's data-dependent branching would
 *   be a side channel in a real deployment.
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

/** BIKE Level 1 Key Generation (simulation parameters) */
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

/** Unpack a bit-packed polynomial back to one byte per coefficient. */
export function unpackPoly(packed: Uint8Array, r: number): Uint8Array {
  const poly = zeroPoly(r);
  for (let i = 0; i < r; i++) {
    poly[i] = ((packed[i >> 3] >> (i & 7)) & 1) as 0 | 1;
  }
  return poly;
}

/**
 * BIKE Encapsulation (simulation parameters).
 *
 * `errorWeight` defaults to the parameter set's own t. Raising it above t is not
 * something a real sender can do — it is the demo's tamper control, which pushes
 * the error past what the decoder is provisioned to correct so the learner can
 * watch the decoding-failure rate climb instead of reading it as a constant.
 */
export async function bikeEncap(
  publicKey: Uint8Array,
  errorWeight: number = SIM_T,
): Promise<EncapResult> {
  const t0 = performance.now();

  // Unpack public key h
  const h = unpackPoly(publicKey, SIM_R);

  // Generate random error vector e = (e0, e1) of total weight t
  // Split: e0 has weight ceil(t/2), e1 has weight floor(t/2)
  const t = Math.max(0, Math.min(errorWeight, 2 * SIM_R));
  const w0 = Math.ceil(t / 2);
  const w1 = t - w0;
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

// --- BGF threshold: spec affine rule, re-expressed in scale-free coordinates ---

/** BIKE Level 1 reference threshold line: T = 0.0069722·S + 13.530, floor 36. */
const SPEC_THRESHOLD_SLOPE = 0.0069722;
const SPEC_THRESHOLD_INTERCEPT = 13.530;
const SPEC_R = BIKE_PARAMS[1].r;          // 12323
const SPEC_D = BIKE_PARAMS[1].w / 2;      // 71 — column weight of a circulant block

/**
 * The spec line, rewritten in the two quantities that actually set the scale:
 *   x = S / r   (syndrome *density* — what fraction of parity checks are unsatisfied)
 *   y = T / d   (threshold as a fraction of the checks touching one bit)
 * so   y = NORM_SLOPE · x + NORM_INTERCEPT.
 * A counter can never exceed d and a syndrome weight can never exceed r, so these
 * are the natural units; the spec's own coefficients are recovered exactly when
 * r = 12323 and d = 71.
 */
const NORM_SLOPE = (SPEC_THRESHOLD_SLOPE * SPEC_R) / SPEC_D;   // ≈ 1.2101
const NORM_INTERCEPT = SPEC_THRESHOLD_INTERCEPT / SPEC_D;      // ≈ 0.19056

/**
 * BGF flipping threshold (BIKE specification, "computeThreshold").
 *
 *   T = clamp( ⌊ d · (NORM_SLOPE · S/r + NORM_INTERCEPT) ⌋ , (d+1)/2 , d )
 *
 * The threshold is an affine function of the *live* syndrome weight S, so it
 * falls as the decoder eats the error and rises when the error is heavy. It is
 * floored by the majority value (d+1)/2 — the classic bit-flipping rule, "flip a
 * bit once more than half of the checks touching it are unsatisfied" — and capped
 * at d, above which nothing could ever flip.
 *
 * `r` defaults to the simulation's own block size, NOT the spec's 12323: an
 * earlier version divided by 12323 while running at r = 587, which pinned T to
 * the majority floor of 4 for every syndrome weight the simulation can produce.
 *
 * Honest note about the reduced parameters: with d = 7 the whole usable range is
 * T ∈ {4,5,6,7}, and at the shipped error weight (t = 13, syndrome density ≈ 0.15)
 * the line genuinely evaluates below the majority floor, so T = 4 is the correct
 * answer, not a stuck constant. Push the error weight up with the tamper slider
 * and the syndrome density rises far enough that T climbs to 5 and beyond — which
 * is the behaviour real BIKE shows across its own iteration sequence.
 */
export function computeThreshold(syndromeWeight: number, d: number, r: number = SIM_R): number {
  const affine = Math.floor(d * (NORM_SLOPE * (syndromeWeight / r) + NORM_INTERCEPT));
  const majority = Math.floor((d + 1) / 2);
  return Math.min(Math.max(affine, majority), d);
}

/**
 * Gray band width τ (BIKE spec uses τ = 3 at every level, where d = 71).
 * A bit is Gray when T − τ ≤ counter < T. Scaled to this block's column weight so
 * the band stays the same *fraction* of the counter range; at d = 7 that is τ = 1,
 * i.e. Gray = "exactly one check short of the threshold", which is what the
 * decoder visualization's legend shows.
 */
export function grayBand(d: number): number {
  return Math.max(1, Math.round((3 * d) / SPEC_D));
}

/** Number of BGF iterations (NbIter in the BIKE spec). */
export const BGF_ITERATIONS = 10;

/**
 * One recorded snapshot of a full BGF iteration, capturing exactly the state a
 * learner needs to watch the round unfold: the live syndrome weight, the flip
 * threshold T, and — per bit — how many unsatisfied parity checks touch it (the
 * "counter"). Bits whose counter is at or above T are Black; bits within the Gray
 * band below T are Gray.
 *
 * Iteration 0 has three phases (Black flip, Black correction, Gray correction) and
 * records the syndrome weight after each; later iterations record only the first.
 *
 * This is emitted by the real bgfDecode loop, not reconstructed after the fact —
 * the visualization shows the same arithmetic the KEM round-trip test verifies.
 */
export interface BgfStep {
  iteration: number;        // 0-based iteration index
  threshold: number;        // flip threshold T for this iteration
  grayBand: number;         // τ: a bit is Gray when T − τ ≤ counter < T
  maskedThreshold: number;  // (d+1)/2 — threshold used by the two correction passes
  syndromeWeight: number;   // weight of the syndrome at the start of this iteration
  counters0: number[];      // unsatisfied-check counter per bit of block 0
  counters1: number[];      // unsatisfied-check counter per bit of block 1
  black0: number[];         // Black mask, block 0 (counter ≥ T) — flipped by BFIter
  black1: number[];         // Black mask, block 1
  gray0: number[];          // Gray mask, block 0 (T − τ ≤ counter < T) — not yet flipped
  gray1: number[];          // Gray mask, block 1
  flips0: number[];         // block 0 bits flipped by the BFIter pass (== black0)
  flips1: number[];         // block 1 bits flipped by the BFIter pass (== black1)
  blackUndo0: number[];     // block 0 bits UN-flipped by the Black correction pass
  blackUndo1: number[];     // block 1 bits un-flipped by the Black correction pass
  grayFlips0: number[];     // block 0 Gray bits flipped by the Gray correction pass
  grayFlips1: number[];     // block 1 Gray bits flipped by the Gray correction pass
  masked: boolean;          // true when the two correction passes ran (iteration 0)
  syndromeWeightAfterBlack: number; // weight after the BFIter (Black) flips
  syndromeWeightAfterBlackPass: number; // weight after the Black correction pass
  syndromeWeightAfter: number;      // weight at the end of the whole iteration
}

/**
 * Black-Gray-Flip Decoder — BGF as specified in the BIKE submission (Algorithm 1).
 *
 *   for i in 0 .. NbIter−1:
 *     T ← computeThreshold(|s|)
 *     (e, black, gray) ← BFIter(s, e, T, H)      // flip every Black bit
 *     if i == 0:
 *       e ← BFMaskedIter(s, e, black, (d+1)/2, H)  // undo Black flips that still look wrong
 *       e ← BFMaskedIter(s, e, gray,  (d+1)/2, H)  // flip Gray bits that now look wrong
 *
 * The three phases are what make BGF more than a bit-flipping loop:
 *
 * - **BFIter** computes every counter against the *same* start-of-iteration
 *   syndrome and flips all Black bits simultaneously. Bits that fell in the Gray
 *   band (one to τ checks short of T) are recorded but deliberately NOT flipped.
 * - **Black correction pass** recomputes counters against the now-updated syndrome
 *   and re-flips (i.e. undoes) any Black bit that still shows ≥ (d+1)/2 unsatisfied
 *   checks. A bit that was flipped in error usually looks *worse* afterwards, so
 *   this is how BGF walks back its own mistakes — the single biggest contributor to
 *   its low decoding-failure rate versus a plain threshold decoder.
 * - **Gray correction pass** gives the bits that were on the bubble a second look
 *   against the updated syndrome; the ones that have now crossed (d+1)/2 get flipped.
 *
 * Both correction passes are *masked*: they only touch bits in their mask, never
 * the rest of the codeword.
 */
export function bgfDecode(
  syndrome: Uint8Array,
  h0: Uint8Array,
  h1: Uint8Array,
  r: number,
  maxIter: number = BGF_ITERATIONS,
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
  const d = h0Supp.length;               // column weight = w/2
  const tau = grayBand(d);               // Gray band width
  const maskedT = Math.floor((d + 1) / 2); // threshold for the two correction passes

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

  /** BFMaskedIter: re-flip masked bits whose counter has reached `t` against the
   *  CURRENT syndrome. Returns the positions it touched. */
  function maskedPass(e: Uint8Array, supp: number[], mask: number[], t: number): number[] {
    if (mask.length === 0) return [];
    const c = counters(supp);
    const touched: number[] = [];
    for (const j of mask) {
      if (c[j] >= t) touched.push(j);
    }
    for (const j of touched) flip(e, supp, j);
    return touched;
  }

  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    if (isZero()) break;
    iterations++;

    const sWeightBefore = weight(s);
    const T = computeThreshold(sWeightBefore, d, r);

    // --- Phase 1: BFIter. Counters are taken against the start-of-iteration
    // syndrome, then every Black bit flips at once. Gray bits are only recorded. ---
    const c0 = counters(h0Supp);
    const c1 = counters(h1Supp);

    const black0: number[] = [];
    const black1: number[] = [];
    const gray0: number[] = [];
    const gray1: number[] = [];

    for (let j = 0; j < r; j++) {
      if (c0[j] >= T) black0.push(j);
      else if (c0[j] >= T - tau) gray0.push(j);
    }
    for (let j = 0; j < r; j++) {
      if (c1[j] >= T) black1.push(j);
      else if (c1[j] >= T - tau) gray1.push(j);
    }

    for (const j of black0) flip(e0, h0Supp, j);
    for (const j of black1) flip(e1, h1Supp, j);
    const wAfterBlack = weight(s);

    // --- Phases 2 and 3: the two masked correction passes, first iteration only. ---
    let blackUndo0: number[] = [];
    let blackUndo1: number[] = [];
    let grayFlips0: number[] = [];
    let grayFlips1: number[] = [];
    let wAfterBlackPass = wAfterBlack;
    const masked = iter === 0;

    if (masked) {
      // Black correction: a Black bit that STILL has ≥ (d+1)/2 unsatisfied checks
      // against the updated syndrome was flipped in error — flip it back.
      blackUndo0 = maskedPass(e0, h0Supp, black0, maskedT);
      blackUndo1 = maskedPass(e1, h1Supp, black1, maskedT);
      wAfterBlackPass = weight(s);

      // Gray correction: bits that were on the bubble get a second look now that
      // the Black flips have changed the syndrome underneath them.
      grayFlips0 = maskedPass(e0, h0Supp, gray0, maskedT);
      grayFlips1 = maskedPass(e1, h1Supp, gray1, maskedT);
    }

    const wAfter = weight(s);

    if (trace) {
      trace.push({
        iteration: iter,
        threshold: T,
        grayBand: tau,
        maskedThreshold: maskedT,
        syndromeWeight: sWeightBefore,
        counters0: Array.from(c0),
        counters1: Array.from(c1),
        black0,
        black1,
        gray0,
        gray1,
        flips0: black0,
        flips1: black1,
        blackUndo0,
        blackUndo1,
        grayFlips0,
        grayFlips1,
        masked,
        syndromeWeightAfterBlack: wAfterBlack,
        syndromeWeightAfterBlackPass: wAfterBlackPass,
        syndromeWeightAfter: wAfter,
      });
    }

    const touched =
      black0.length + black1.length +
      blackUndo0.length + blackUndo1.length +
      grayFlips0.length + grayFlips1.length;
    if (touched === 0) break; // stalled — no bit crossed any threshold
  }

  return { e0, e1, iterations, success: isZero() };
}

/** BIKE Level 1 Decapsulation */
export async function bikeDecap(
  ciphertext: Uint8Array,
  privateH0: Uint8Array,
  privateH1: Uint8Array,
): Promise<DecapResult> {
  const t0 = performance.now();

  // Unpack c0 (c1 is the remaining 32 bytes, not needed for pure BGF decoding)
  const c0 = unpackPoly(ciphertext, SIM_R);

  // Unpack private key
  const h0 = unpackPoly(privateH0, SIM_R);
  const h1 = unpackPoly(privateH1, SIM_R);

  // Compute syndrome: s = c0 * h0.
  // Since c0 = e0 + e1 * h and h = h0^{-1} * h1 (in circulant ring),
  // c0 * h0 = e0 * h0 + e1 * h1
  const syndrome = polyMul(c0, h0, SIM_R);
  const initialSyndrome = getPositions(syndrome);

  // Decode using BGF, collecting a per-iteration trace for visualization.
  const trace: BgfStep[] = [];
  const result = bgfDecode(syndrome, h0, h1, SIM_R, BGF_ITERATIONS, trace);

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

// --- Empirical decoding-failure-rate measurement ---

/**
 * One decode trial at a chosen error weight, with the hashing and packing stripped
 * out so a few hundred trials run inside a frame budget. Plants a fresh random error
 * of weight `errorWeight`, forms the true syndrome, and reports whether BGF got back
 * to a zero syndrome AND recovered exactly the planted error.
 *
 * A "success" here is the strict condition: reaching a zero syndrome with a
 * *different* error vector is still a decapsulation failure, because Alice and Bob
 * then derive different shared secrets. Counting those as successes would flatter
 * the decoder.
 */
export function decodeTrial(
  h0: Uint8Array,
  h1: Uint8Array,
  errorWeight: number,
  r: number = SIM_R,
): { success: boolean; iterations: number; syndromeWeight: number; thresholds: number[] } {
  const t = Math.max(0, Math.min(errorWeight, 2 * r));
  const w0 = Math.ceil(t / 2);
  const { poly: e0 } = randomSparsePoly(r, w0);
  const { poly: e1 } = randomSparsePoly(r, t - w0);

  const s0 = polyMul(e0, h0, r);
  const s1 = polyMul(e1, h1, r);
  const s = zeroPoly(r);
  for (let i = 0; i < r; i++) s[i] = (s0[i] ^ s1[i]) as 0 | 1;
  const syndromeWeight = weight(s);

  const trace: BgfStep[] = [];
  const res = bgfDecode(s, h0, h1, r, BGF_ITERATIONS, trace);

  let exact = res.success;
  if (exact) {
    for (let i = 0; i < r; i++) {
      if (res.e0[i] !== e0[i] || res.e1[i] !== e1[i]) { exact = false; break; }
    }
  }
  return {
    success: exact,
    iterations: res.iterations,
    syndromeWeight,
    thresholds: trace.map((st) => st.threshold),
  };
}

export interface DfrSample {
  errorWeight: number;
  trials: number;
  failures: number;
  rate: number;              // failures / trials
  avgIterations: number;
  avgSyndromeWeight: number;
  thresholds: number[];      // distinct thresholds the decoder actually used, ascending
}

/** Run `trials` decode trials at one error weight against a fixed private key. */
export function measureDfr(
  privateH0: Uint8Array,
  privateH1: Uint8Array,
  errorWeight: number,
  trials: number,
  r: number = SIM_R,
): DfrSample {
  const h0 = unpackPoly(privateH0, r);
  const h1 = unpackPoly(privateH1, r);
  let failures = 0;
  let iterTotal = 0;
  let synTotal = 0;
  const thresholds = new Set<number>();
  for (let i = 0; i < trials; i++) {
    const res = decodeTrial(h0, h1, errorWeight, r);
    if (!res.success) failures++;
    iterTotal += res.iterations;
    synTotal += res.syndromeWeight;
    for (const th of res.thresholds) thresholds.add(th);
  }
  return {
    errorWeight,
    trials,
    failures,
    rate: trials > 0 ? failures / trials : 0,
    avgIterations: trials > 0 ? iterTotal / trials : 0,
    avgSyndromeWeight: trials > 0 ? synTotal / trials : 0,
    thresholds: [...thresholds].sort((a, b) => a - b),
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
