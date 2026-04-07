/**
 * main.ts — Entry point for BIKE Vault demo
 */
import { bikeKeyGen, bikeEncap, bikeDecap, aesEncryptDecrypt, toHex, SIM_R, SIM_W, SIM_T, type BikeKeyPair, type EncapResult } from './bike';
import { parityDemo, renderParityOutput } from './qcmdpc';
import { renderCompareChart } from './compare';
import { initPanels, initTheme } from './ui';

// --- State ---
let currentKeyPair: BikeKeyPair | null = null;
let currentEncap: EncapResult | null = null;
let sharedSecretForAes: Uint8Array | null = null;

// --- Helpers ---
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncHex(hex: string, maxLen = 64): string {
  if (hex.length <= maxLen) return hex;
  return hex.slice(0, maxLen) + '…';
}

// --- Panel 1: Parity Demo ---
function initParityDemo(): void {
  const btn = $('parity-encode-btn') as HTMLButtonElement;
  const input = $('parity-input') as HTMLInputElement;
  const output = $('parity-output');

  const doEncode = () => {
    const val = input.value.trim();
    if (!/^[01]{4}$/.test(val)) {
      output.innerHTML = '<p class="error-text" role="alert">Please enter exactly 4 binary digits (0 or 1).</p>';
      return;
    }
    const bits = val.split('').map(Number);
    const result = parityDemo(bits);
    output.innerHTML = renderParityOutput(result);
  };

  btn.addEventListener('click', doEncode);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') doEncode();
  });
}

// --- Panel 2: Key Generation ---
function initKeyGen(): void {
  const btn = $('keygen-btn') as HTMLButtonElement;
  const output = $('keygen-output');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Generating…';
    output.innerHTML = '<p class="loading-text">Generating BIKE-1 keypair (simulation: r=' + SIM_R + ', w=' + SIM_W + ', t=' + SIM_T + ')…</p>';

    try {
      const kp = await bikeKeyGen();
      currentKeyPair = kp;

      output.innerHTML = `
        <div class="output-section">
          <div class="status-chip-row">
            <span class="status-chip status-sim">⚠ Illustrative — not production BIKE</span>
          </div>
          <h4>Private Key (h₀ positions)</h4>
          <p class="mono output-scroll" aria-label="Private key h0 non-zero positions">[${kp.h0Positions.join(', ')}]</p>
          <p class="meta">Weight: ${kp.h0Positions.length} (target: ${SIM_W / 2})</p>

          <h4>Private Key (h₁ positions)</h4>
          <p class="mono output-scroll" aria-label="Private key h1 non-zero positions">[${kp.h1Positions.join(', ')}]</p>
          <p class="meta">Weight: ${kp.h1Positions.length} (target: ${SIM_W / 2})</p>

          <h4>Public Key h = h₀⁻¹ · h₁</h4>
          <p class="mono output-scroll" aria-label="Public key hex">${truncHex(toHex(kp.publicKey), 80)}</p>
          <p class="meta">Size: ${kp.publicKey.length} bytes (simulation) | Real BIKE-1: 1,541 bytes</p>
          <p class="meta">Non-zero positions: ${kp.hPositions.length} of ${SIM_R}</p>

          <p class="meta timing">⏱ Generated in ${kp.timingMs.toFixed(1)} ms</p>
        </div>
      `;

      // Enable encap panel
      updateEncapPrereq();

    } catch (err) {
      output.innerHTML = `<p class="error-text" role="alert">Key generation failed: ${escapeHtml(String(err))}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Keypair';
    }
  });
}

// --- Panel 3: Encap / Decap ---
function updateEncapPrereq(): void {
  const prereq = $('encap-prereq');
  const controls = $('encap-controls');
  if (currentKeyPair) {
    prereq.style.display = 'none';
    controls.style.display = 'block';
  } else {
    prereq.style.display = 'block';
    controls.style.display = 'none';
  }
}

function initEncapDecap(): void {
  const encapBtn = $('encap-btn') as HTMLButtonElement;
  const decapBtn = $('decap-btn') as HTMLButtonElement;
  const encapOutput = $('encap-output');
  const decapOutput = $('decap-output');
  const matchDiv = $('kem-match');

  encapBtn.addEventListener('click', async () => {
    if (!currentKeyPair) return;
    encapBtn.disabled = true;
    encapBtn.textContent = 'Encapsulating…';
    encapOutput.innerHTML = '<p class="loading-text">Generating error vector and computing ciphertext…</p>';
    decapOutput.innerHTML = '';
    matchDiv.style.display = 'none';

    try {
      const result = await bikeEncap(currentKeyPair.publicKey);
      currentEncap = result;

      encapOutput.innerHTML = `
        <div class="output-section">
          <h4>Ciphertext c₀</h4>
          <p class="mono output-scroll" aria-label="Ciphertext c0 hex">${truncHex(result.c0Hex, 80)}</p>

          <h4>Ciphertext c₁</h4>
          <p class="mono output-scroll" aria-label="Ciphertext c1 hex">${truncHex(result.c1Hex, 80)}</p>

          <h4>Alice's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret" aria-label="Alice's shared secret hex">${toHex(result.sharedSecret)}</p>

          <p class="meta">Error vector weight: ${result.errorPositions.length} (target: ${SIM_T})</p>
          <p class="meta">Total ciphertext: ${result.ciphertext.length} bytes (simulation) | Real BIKE-1: 1,573 bytes</p>
          <p class="meta timing">⏱ Encapsulated in ${result.timingMs.toFixed(1)} ms</p>
        </div>
      `;

      decapBtn.disabled = false;
    } catch (err) {
      encapOutput.innerHTML = `<p class="error-text" role="alert">Encapsulation failed: ${escapeHtml(String(err))}</p>`;
    } finally {
      encapBtn.disabled = false;
      encapBtn.textContent = 'Encapsulate (Alice)';
    }
  });

  decapBtn.addEventListener('click', async () => {
    if (!currentKeyPair || !currentEncap) return;
    decapBtn.disabled = true;
    decapBtn.textContent = 'Decapsulating…';
    decapOutput.innerHTML = '<p class="loading-text">Running Black-Gray-Flip decoder…</p>';

    try {
      const result = await bikeDecap(
        currentEncap.ciphertext,
        currentKeyPair.privateH0,
        currentKeyPair.privateH1,
      );

      const aliceHex = toHex(currentEncap.sharedSecret);
      const bobHex = toHex(result.sharedSecret);
      const match = aliceHex === bobHex;

      decapOutput.innerHTML = `
        <div class="output-section">
          <h4>Bob's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret" aria-label="Bob's shared secret hex">${bobHex}</p>

          <p class="meta">BGF decoder iterations: ${result.decoderIterations}</p>
          <p class="meta">Decoder ${result.success ? 'converged ✓' : 'did NOT converge ✗'}</p>
          <p class="meta">Recovered error positions: ${result.recoveredError.length}</p>
          <p class="meta timing">⏱ Decapsulated in ${result.timingMs.toFixed(1)} ms</p>
        </div>
      `;

      matchDiv.style.display = 'block';
      if (match && result.success) {
        matchDiv.innerHTML = `
          <div class="match-success" role="status">
            <span class="match-icon" aria-hidden="true">✅</span>
            <span><strong>Shared secrets match!</strong> K<sub>Alice</sub> = K<sub>Bob</sub></span>
          </div>
        `;
        sharedSecretForAes = result.sharedSecret;
        showAesSection();
      } else {
        matchDiv.innerHTML = `
          <div class="match-failure" role="alert">
            <span class="match-icon" aria-hidden="true">❌</span>
            <span><strong>Shared secrets do NOT match.</strong> This demonstrates BIKE's non-zero decapsulation failure rate. Try again — failures are rare but possible.</span>
          </div>
        `;
      }

    } catch (err) {
      decapOutput.innerHTML = `<p class="error-text" role="alert">Decapsulation failed: ${escapeHtml(String(err))}</p>`;
    } finally {
      decapBtn.disabled = true;
      decapBtn.textContent = 'Decapsulate (Bob)';
    }
  });
}

function showAesSection(): void {
  const prereq = $('aes-prereq');
  const section = $('aes-section');
  prereq.style.display = 'none';
  section.style.display = 'block';
}

function initAes(): void {
  const btn = $('aes-encrypt-btn') as HTMLButtonElement;
  const input = $('aes-plaintext') as HTMLInputElement;
  const output = $('aes-output');

  // Show prereq initially
  $('aes-prereq').style.display = 'block';
  $('aes-section').style.display = 'none';

  const doEncrypt = async () => {
    if (!sharedSecretForAes) return;
    const msg = input.value.trim();
    if (!msg) {
      output.innerHTML = '<p class="error-text" role="alert">Please enter a message to encrypt.</p>';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Encrypting…';

    try {
      const result = await aesEncryptDecrypt(sharedSecretForAes, msg);

      output.innerHTML = `
        <div class="output-section">
          <h4>AES-256-GCM Encryption</h4>
          <p class="meta">IV (nonce):</p>
          <p class="mono output-scroll" aria-label="AES initialization vector">${result.iv}</p>
          <p class="meta">Ciphertext:</p>
          <p class="mono output-scroll" aria-label="AES ciphertext hex">${truncHex(result.ciphertext, 120)}</p>

          <h4>Decrypted</h4>
          <p class="decrypted-text" aria-label="Decrypted plaintext">"${escapeHtml(result.plaintext)}"</p>

          <p class="meta">End-to-end: BIKE KEM → shared secret → AES-256-GCM → plaintext ✓</p>
        </div>
      `;
    } catch (err) {
      output.innerHTML = `<p class="error-text" role="alert">Encryption failed: ${escapeHtml(String(err))}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Encrypt';
    }
  };

  btn.addEventListener('click', doEncrypt);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') doEncrypt();
  });
}

// --- Panel 4: Comparison Chart ---
function initCompare(): void {
  const container = $('compare-chart');
  if (container) {
    renderCompareChart(container);
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPanels();
  initParityDemo();
  initKeyGen();
  initEncapDecap();
  initAes();
  initCompare();
});
