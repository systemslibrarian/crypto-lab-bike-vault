# crypto-lab-bike-vault

> **`BIKE`** · **`QC-MDPC`** · **`AES-256-GCM`** · **`Code-Based`**

**[▶ Live Demo](https://systemslibrarian.github.io/crypto-lab-bike-vault/)**

An interactive browser-based demonstration of **BIKE (Bit Flipping Key Encapsulation)** — a code-based post-quantum KEM and NIST Round 4 alternate candidate. Explore how quasi-cyclic moderate-density parity-check (QC-MDPC) codes enable post-quantum key encapsulation and how BIKE compares to the standardized ML-KEM (Kyber).

## Overview

BIKE is built on the hardness of decoding random quasi-cyclic codes — a problem studied since the 1960s and believed to be resistant to quantum computers. This demo walks through the complete BIKE KEM lifecycle: key generation, encapsulation with the Black-Gray-Flip decoder, decapsulation, and end-to-end encryption using the derived shared secret with AES-256-GCM.

**Important:** This demo uses a pedagogically accurate simulation with reduced parameters for browser performance. All algorithmic steps — sparse polynomial generation, polynomial inversion, QC-MDPC syndrome computation, and BGF decoding — are structurally identical to the real BIKE specification. The simulation is clearly labeled as illustrative, not production-ready.

## What You Can Explore

1. **Code-Based Cryptography Primer** — Error-correcting codes, parity check matrices, QC-MDPC structure, and the LPN hardness assumption
2. **BIKE Key Generation** — Generate a BIKE-1 keypair, inspect the sparse private key and public key structure, compare key sizes across schemes
3. **Encapsulation & Decapsulation** — Watch Alice encapsulate a shared secret, Bob recover it via the Black-Gray-Flip decoder, and verify the secrets match. Then encrypt a message end-to-end with AES-256-GCM
4. **BIKE vs ML-KEM Comparison** — Side-by-side comparison of key sizes, ciphertext sizes, security assumptions, and NIST status across all security levels
5. **Why Code-Based PQ Matters** — Cryptographic diversity, the McEliece legacy (1978), and why we shouldn't put all eggs in one mathematical basket

## Primitives Used

| Primitive | Role | Standard / Status |
|-----------|------|-------------------|
| **BIKE** | Key Encapsulation Mechanism | NIST Round 4 Alternate Candidate |
| **QC-MDPC** | Error-correcting code structure | Underlying mathematical foundation |
| **AES-256-GCM** | Symmetric encryption (DEM layer) | NIST Standard (via WebCrypto) |
| **SHA-256** | Shared secret derivation | NIST Standard (via WebCrypto) |

## Running Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-bike-vault.git
cd crypto-lab-bike-vault
npm install
npm run dev
```

Open [http://localhost:5173/crypto-lab-bike-vault/](http://localhost:5173/crypto-lab-bike-vault/) in your browser.

### Build & Deploy

```bash
npm run build    # Production build to dist/
npm run deploy   # Build + deploy to GitHub Pages
```

## Security Notes

- **Illustrative simulation:** This demo uses reduced BIKE parameters (r=587) for browser performance. The algorithmic structure is accurate, but this is not a production BIKE implementation. All simulation output is clearly labeled.
- **Non-zero DFR:** BIKE has a non-zero decapsulation failure rate (DFR < 2⁻¹²⁸ for BIKE-1). This means decapsulation can fail for some error patterns. BIKE is not suitable for protocols requiring perfect correctness — use ML-KEM for production deployments requiring zero DFR.
- **NIST Round 4 status:** BIKE is an alternate candidate under active evaluation. It is not yet standardized. For production post-quantum KEM, use ML-KEM (FIPS 203).
- **AES-256-GCM** operations use the native WebCrypto API — these are real, not simulated.

### BIKE Parameter Sets (NIST Round 4 Submission Spec)

| Parameter Set | Level | r | w | t |
|---------------|-------|-------|-----|-----|
| BIKE-1 | 1 | 12,323 | 142 | 134 |
| BIKE-3 | 3 | 24,659 | 206 | 199 |
| BIKE-5 | 5 | 40,973 | 274 | 264 |

Source: [BIKE Specification](https://bikesuite.org), NIST Round 4 Submission

## Accessibility

This demo meets **WCAG 2.1 AA** standards:

- Full keyboard navigation with logical tab order — no keyboard traps
- ARIA labels on all interactive elements
- Focus indicators visible in both dark and light modes (minimum 3:1 contrast ratio)
- Color-coded indicators always paired with text equivalents
- `prefers-reduced-motion` respected — animations suppressed when enabled
- Minimum 4.5:1 contrast ratio for normal text in both modes
- Screen reader navigable throughout

## Why This Matters

ML-KEM (Kyber) is the NIST-standardized post-quantum KEM — and it should be the default choice for most deployments. But **cryptographic diversity** matters.

BIKE belongs to the **code-based** cryptographic family, which traces back to McEliece (1978) — the oldest post-quantum proposal still unbroken. If a breakthrough attack against lattice problems (the foundation of ML-KEM) emerges, code-based schemes survive.

Post-quantum migration should not put all eggs in one mathematical basket.

## Related Demos

- **[crypto-lab-kyber-vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/)** — ML-KEM (Kyber): The NIST-standardized lattice-based KEM
- **[crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/)** — ML-DSA (Dilithium): Lattice-based digital signatures
- **[crypto-lab-sphincs-ledger](https://systemslibrarian.github.io/crypto-lab-sphincs-ledger/)** — SLH-DSA (SPHINCS+): Hash-based digital signatures
- **[crypto-compare](https://systemslibrarian.github.io/crypto-compare/)** — Side-by-side comparison dashboard

---

"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31