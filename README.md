# crypto-lab-bike-vault

## What It Is

This project is an interactive demo of BIKE (Bit Flipping Key Encapsulation) built on QC-MDPC codes, with the derived shared secret used in AES-256-GCM. BIKE is a key encapsulation mechanism for establishing a shared secret over an untrusted channel without pre-shared keys. It addresses the key exchange problem under post-quantum assumptions by relying on code-based hardness rather than lattice assumptions. Security-wise, BIKE is an asymmetric post-quantum KEM, while AES-256-GCM is a symmetric authenticated-encryption primitive used after shared-secret agreement.

Rather than describe BIKE's signature mechanisms in prose alone, the demo lets you watch them run. A live circulant builder shows how one short row, cyclically shifted, defines a whole quasi-cyclic block; a sparse-vs-dense key visual makes the trapdoor (private = sparse and structured, public = dense and structureless) perceptual; and a step-by-step Black-Gray-Flip decoder animates each iteration — Black bits crossing the threshold, bits flipping, and the syndrome weight collapsing toward zero (or, on a rare failure, stalling — the visible face of BIKE's non-zero decapsulation failure rate). Every visualization is driven by the demo's real in-browser QC-MDPC arithmetic, not scripted output.

## When to Use It

- Evaluate code-based post-quantum KEM behavior in a browser demo. This fits when you want to inspect BIKE flow and outputs without deploying native crypto toolchains.
- Teach BIKE and QC-MDPC concepts to engineers or students. The panelized UI maps core steps to concrete artifacts like keys, ciphertext, and shared-secret checks.
- Compare post-quantum assumptions across KEM families. It is useful when discussing BIKE vs ML-KEM tradeoffs and cryptographic diversity planning.
- Prototype educational workflows that pair a KEM with symmetric encryption. The demo shows how BIKE output can feed AES-256-GCM in an end-to-end sequence.
- Do NOT use this implementation for production cryptography. It is explicitly an illustrative browser simulation and not a hardened, validated BIKE deployment.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-bike-vault](https://systemslibrarian.github.io/crypto-lab-bike-vault/)**

The demo lets you move through BIKE primer material, run key generation, perform encapsulation/decapsulation, and test message encryption with AES-256-GCM. You can use controls including Generate Keypair, Encapsulate (Alice), Decapsulate (Bob), panel navigation tabs, and the message input for encryption. Along the way you can toggle bits in the live circulant block, inspect the sparse-vs-dense key trapdoor, and step or play through the Black-Gray-Flip decoder one iteration at a time. A collapsible terms strip and a deferred "Go deeper" hardness card keep the on-ramp gentle for newcomers while preserving the depth for specialists. Parameter values are shown in the interface (for example BIKE-1 values and simulation parameters) so users can inspect how settings affect displayed outputs.

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

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
