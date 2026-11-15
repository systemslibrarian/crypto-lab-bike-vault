import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Page-copy claim gate.
 *
 * The unit tests above prove the crypto core is right; this one pins the
 * sourced factual claims in index.html so a future edit cannot quietly put
 * the wrong hard problem, the wrong NIST status or "perfect correctness"
 * back on the page.
 *
 * Sources:
 * - BIKE Specification (https://bikesuite.org), Appendix B.1.1, Problems 3
 *   and 4: (2,1)-QC Syndrome Decoding and (2,1)-QC Codeword Finding.
 * - NIST IR 8545 (https://csrc.nist.gov/pubs/ir/8545/final), March 2025,
 *   §§3.1-3.2: BIKE depends on decisional QCSD and additionally QCCF; HQC
 *   was selected for standardization and BIKE was not.
 * - FIPS 203 (https://csrc.nist.gov/pubs/fips/203/final), Table 1:
 *   ML-KEM-768's decapsulation failure rate is 2^-164.8, i.e. non-zero.
 */

const page = readFileSync(
  fileURLToPath(new URL('../index.html', import.meta.url)),
  'utf8',
);

describe('index.html factual claims', () => {
  it('names QCSD and QCCF, not LPN, as the problems BIKE rests on', () => {
    expect(page).toContain('Quasi-Cyclic Syndrome Decoding (QCSD)');
    expect(page).toContain('Quasi-Cyclic Codeword Finding (QCCF)');
    // LPN is a neighbouring problem; neither the BIKE spec nor IR 8545
    // names it as BIKE's assumption.
    expect(page).not.toContain('Learning Parity with Noise');
    expect(page).not.toMatch(/\bLPN\b/);
  });

  it('quotes ML-KEM-768 decapsulation failure rate from FIPS 203 Table 1', () => {
    // U+2212 MINUS SIGN, as the rest of the page's exponents use.
    expect(page).toContain('2<sup>−164.8</sup>');
    // ML-KEM is not perfectly correct, so the page must not say it is.
    expect(page).not.toContain('requiring perfect correctness');
  });

  it('counts HQC as a code-based candidate beside Classic McEliece', () => {
    expect(page).not.toContain('Classic McEliece (the other code-based candidate)');
    expect(page).toContain('code-based fourth-round candidates alongside HQC');
  });

  it('records BIKE as a Round 4 candidate that was not selected', () => {
    expect(page).not.toContain('Round 4 Alternate');
    expect(page).not.toContain('Round 4 Alt<');
    expect(page).not.toContain('Round 4 alternate candidate');
    expect(page).toContain('NIST Round 4 — Not Selected');
    // Three BIKE rows in the BIKE-vs-ML-KEM status row, plus the panel-2 chip.
    expect(page.split('Round 4 — Not Selected').length - 1).toBe(4);
  });

  it('does not recommend deploying BIKE in hybrids after saying it has no path', () => {
    expect(page).toContain('has no NIST standardization path');
    expect(page).not.toContain('hybrid approaches</strong> that include code-based schemes like BIKE');
    // The standards-track code-based KEM named for the hedge is HQC.
    expect(page).toContain('the standards-track code-based KEM is <strong>HQC</strong>');
  });
});
