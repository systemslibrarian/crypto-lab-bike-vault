# crypto-lab-bike-vault

## What It Is

This project is an interactive demo of BIKE (Bit Flipping Key Encapsulation) built on QC-MDPC codes, with the derived shared secret used in AES-256-GCM. BIKE is a key encapsulation mechanism for establishing a shared secret over an untrusted channel without pre-shared keys. It addresses the key exchange problem under post-quantum assumptions by relying on code-based hardness rather than lattice assumptions. Security-wise, BIKE is an asymmetric post-quantum KEM, while AES-256-GCM is a symmetric authenticated-encryption primitive used after shared-secret agreement.

Rather than describe BIKE's mechanisms in prose alone, the demo lets you watch them run. A live circulant builder shows how one short row, cyclically shifted, defines a whole quasi-cyclic block; a sparse-vs-dense key visual makes the trapdoor (private = sparse and structured, public = dense and structureless) perceptual; and a step-by-step decoder animates the real Black-Gray-Flip algorithm — Black bits crossing the adaptive threshold and flipping, then the two masked correction passes BGF is named for (the Black pass un-flipping bits that still look wrong, the Gray pass reviewing the bits that were on the bubble), and the syndrome weight collapsing toward zero or stalling on a failure. An error-weight slider and a DFR lab let you push the error past what the code can correct and measure the decoding-failure rate climbing off the floor. Every visualization is driven by the demo's real in-browser QC-MDPC arithmetic, not scripted output.

Parameters: the page runs the BIKE Level 1 *structure* at reduced parameters (r = 587, w = 14, t = 13) so everything completes instantly in a browser. Spec BIKE Level 1 is r = 12,323, w = 142, t = 134 with a design DFR below 2⁻¹²⁸; the reduced parameters here measure around 0.5% (≈ 2⁻⁷·⁶), and the page says so wherever it quotes either number.

## When to Use It

- Evaluate code-based post-quantum KEM behavior in a browser demo. This fits when you want to inspect BIKE flow and outputs without deploying native crypto toolchains.
- Teach BIKE and QC-MDPC concepts to engineers or students. The panelized UI maps core steps to concrete artifacts like keys, ciphertext, and shared-secret checks.
- Compare post-quantum assumptions across KEM families. It is useful when discussing BIKE vs ML-KEM tradeoffs and cryptographic diversity planning.
- Prototype educational workflows that pair a KEM with symmetric encryption. The demo shows how BIKE output can feed AES-256-GCM in an end-to-end sequence.
- Do NOT use this implementation for production cryptography. It is explicitly an illustrative browser simulation and not a hardened, validated BIKE deployment.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-bike-vault](https://systemslibrarian.github.io/crypto-lab-bike-vault/)**

The demo lets you move through BIKE primer material, run key generation, perform encapsulation/decapsulation, and test message encryption with AES-256-GCM. You can use controls including Generate Keypair, Encapsulate (Alice), Decapsulate (Bob), panel navigation tabs, and the message input for encryption. Along the way you can toggle bits in the live circulant block, inspect the sparse-vs-dense key trapdoor, and step or play through the Black-Gray-Flip decoder one iteration and one masked pass at a time. Two controls let you break it on purpose: an error-weight slider that plants more errors than the code is provisioned to correct, and a DFR lab that runs hundreds of real decodes at a chosen weight and plots the measured failure rate — a flat floor, a sharp knee, then saturation at 100%. A collapsible terms strip and a deferred "Go deeper" hardness card keep the on-ramp gentle for newcomers while preserving the depth for specialists. Every parameter value in the copy is filled in from the constants the code actually runs, so the prose cannot drift from the live output.

## What Can Go Wrong

- **Decoding failures:** QC-MDPC decoders have a nonzero decoding-failure rate, and the bit-flipping decoder must be tuned to keep that rate negligibly small.
- **Reaction attacks:** leaking whether decapsulation succeeded or failed across many queries can reveal information about the secret key, so the IND-CCA transform and constant-time decoding matter.
- **Not a finalized standard:** BIKE was a NIST PQC round-4 candidate and was not selected for standardization, so it is less settled than ML-KEM.
- **Simulation, not hardened:** this browser demo illustrates the BIKE flow and is not a constant-time, validated implementation.
- **Symmetric-layer misuse:** the AES-256-GCM step still requires correct nonce handling; a KEM does not protect against misuse of the data-encryption stage.

## Real-World Usage

- BIKE is a code-based KEM that was a NIST Post-Quantum Cryptography round-4 candidate, evaluated as part of broadening beyond lattice assumptions.
- Code-based KEMs are valued for cryptographic diversity, so a future break of lattice schemes would not take down every deployed system.
- BIKE is available in the Open Quantum Safe `liboqs` library for experimentation and benchmarking.
- It is of research and prototyping interest for hybrid KEM constructions rather than mainstream production deployment today.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-bike-vault
cd crypto-lab-bike-vault
npm install
npm run dev
```

No environment variables are required.

## Related Demos

- [crypto-lab-kyber-vault](https://systemslibrarian.github.io/crypto-lab-kyber-vault/) — ML-KEM, the lattice-based KEM standard, for comparison.
- [crypto-lab-hqc-vault](https://systemslibrarian.github.io/crypto-lab-hqc-vault/) — another code-based post-quantum KEM (HQC).
- [crypto-lab-mceliece-gate](https://systemslibrarian.github.io/crypto-lab-mceliece-gate/) — Classic McEliece, the conservative code-based KEM.
- [crypto-lab-ntru-classic](https://systemslibrarian.github.io/crypto-lab-ntru-classic/) — NTRU lattice-based encryption for contrast.
- [crypto-lab-syndrome-drain](https://systemslibrarian.github.io/crypto-lab-syndrome-drain/) — decoding-failure / DOOM attacks against BIKE, HQC, and McEliece.

---

*One of 170+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
