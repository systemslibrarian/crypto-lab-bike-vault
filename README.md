# crypto-lab-bike-vault

> **`BIKE`** · **`QC-MDPC`** · **`AES-256-GCM`** · **`Code-Based`**

**[▶ Live Demo](https://systemslibrarian.github.io/crypto-lab-bike-vault/)**

## 1. What It Is

This project is an interactive demo of BIKE (Bit Flipping Key Encapsulation) built on QC-MDPC codes, with the derived shared secret used in AES-256-GCM. BIKE is a key encapsulation mechanism for establishing a shared secret over an untrusted channel without pre-shared keys. It addresses the key exchange problem under post-quantum assumptions by relying on code-based hardness rather than lattice assumptions. Security-wise, BIKE is an asymmetric post-quantum KEM, while AES-256-GCM is a symmetric authenticated-encryption primitive used after shared-secret agreement.

## 2. When to Use It

- Evaluate code-based post-quantum KEM behavior in a browser demo. This fits when you want to inspect BIKE flow and outputs without deploying native crypto toolchains.
- Teach BIKE and QC-MDPC concepts to engineers or students. The panelized UI maps core steps to concrete artifacts like keys, ciphertext, and shared-secret checks.
- Compare post-quantum assumptions across KEM families. It is useful when discussing BIKE vs ML-KEM tradeoffs and cryptographic diversity planning.
- Prototype educational workflows that pair a KEM with symmetric encryption. The demo shows how BIKE output can feed AES-256-GCM in an end-to-end sequence.
- Do not use this implementation for production cryptography. It is explicitly an illustrative browser simulation and not a hardened, validated BIKE deployment.

## 3. Live Demo

Live demo: https://systemslibrarian.github.io/crypto-lab-bike-vault/

The demo lets you move through BIKE primer material, run key generation, perform encapsulation/decapsulation, and test message encryption with AES-256-GCM. You can use controls including Generate Keypair, Encapsulate (Alice), Decapsulate (Bob), panel navigation tabs, and the message input for encryption. Parameter values are shown in the interface (for example BIKE-1 values and simulation parameters) so users can inspect how settings affect displayed outputs.

## 4. How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-bike-vault.git
cd crypto-lab-bike-vault
npm install
npm run dev
```

No environment variables are required.

## 5. Part of the Crypto-Lab Suite

This demo is part of the Crypto-Lab suite at https://systemslibrarian.github.io/crypto-lab/.

---

"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31