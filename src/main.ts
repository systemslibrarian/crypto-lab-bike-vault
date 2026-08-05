/**
 * main.ts — Entry point for BIKE Vault demo
 */
import {
  bikeKeyGen, bikeEncap, bikeDecap, aesEncryptDecrypt, toHex,
  SIM_R, SIM_W, SIM_T, SIM_HALF_W, BIKE_PARAMS, BGF_ITERATIONS,
  type BikeKeyPair, type EncapResult,
} from './bike';
import { parityDemo, renderParityOutput } from './qcmdpc';
import { renderCompareChart, renderKeySizeBars } from './compare';
import { renderCirculantDemo } from './circulant';
import { renderKeyViz } from './keyviz';
import { renderDecoderViz } from './decoderviz';
import { renderDfrLab, MAX_ERROR_WEIGHT } from './dfrlab';
import { initPanels, initTheme } from './ui';

// --- State ---
let currentKeyPair: BikeKeyPair | null = null;
let currentEncap: EncapResult | null = null;
let currentErrorWeight = SIM_T;
let sharedSecretForAes: Uint8Array | null = null;
let stopDecoderViz: (() => void) | null = null;

// --- Helpers ---
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/**
 * Every parameter number that appears in the page prose is filled in from the
 * constants at runtime via `data-param`, so a value can never be typed into the
 * copy and then drift away from what the code actually runs. `sim-*` are the
 * reduced simulation parameters; `spec-*` are published BIKE Level 1 figures.
 */
const PARAM_STRINGS: Record<string, string> = {
  'sim-r': SIM_R.toLocaleString(),
  'sim-w': String(SIM_W),
  'sim-t': String(SIM_T),
  'sim-half-w': String(SIM_HALF_W),
  'sim-iters': String(BGF_ITERATIONS),
  'sim-max-t': String(MAX_ERROR_WEIGHT),
  'spec-r': BIKE_PARAMS[1].r.toLocaleString(),
  'spec-w': String(BIKE_PARAMS[1].w),
  'spec-t': String(BIKE_PARAMS[1].t),
  'spec-half-w': String(BIKE_PARAMS[1].w / 2),
  'spec-pk-bytes': BIKE_PARAMS[1].pk_bytes.toLocaleString(),
  'spec-ct-bytes': BIKE_PARAMS[1].ct_bytes.toLocaleString(),
};

function fillParamStrings(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-param]').forEach((el) => {
    const key = el.dataset.param;
    if (key && key in PARAM_STRINGS) el.textContent = PARAM_STRINGS[key];
  });
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
    output.innerHTML = `<p class="loading-text">Generating keypair at the simulation parameters (r=${SIM_R}, w=${SIM_W}, t=${SIM_T})…</p>`;

    try {
      const kp = await bikeKeyGen();
      currentKeyPair = kp;

      output.innerHTML = `
        <div class="output-section">
          <div class="status-chip-row">
            <span class="status-chip status-sim">⚠ Illustrative — not production BIKE</span>
          </div>
          <h4>Private Key (h₀ positions)</h4>
          <p class="mono output-scroll">[${kp.h0Positions.join(', ')}]</p>
          <p class="meta">Weight: ${kp.h0Positions.length} (target: ${SIM_W / 2})</p>

          <h4>Private Key (h₁ positions)</h4>
          <p class="mono output-scroll">[${kp.h1Positions.join(', ')}]</p>
          <p class="meta">Weight: ${kp.h1Positions.length} (target: ${SIM_W / 2})</p>

          <h4>Public Key h = h₀⁻¹ · h₁</h4>
          <p class="mono output-scroll">${truncHex(toHex(kp.publicKey), 80)}</p>
          <p class="meta">Size: ${kp.publicKey.length} bytes (simulation) | Spec BIKE Level 1: ${BIKE_PARAMS[1].pk_bytes.toLocaleString()} bytes</p>
          <p class="meta">Non-zero positions: ${kp.hPositions.length} of ${SIM_R}</p>

          <p class="meta timing">⏱ Generated in ${kp.timingMs.toFixed(1)} ms</p>
        </div>
      `;

      // Render the sparse-vs-dense trapdoor visualization from the real key positions.
      const kvPrereq = $('keyviz-prereq');
      const kvContainer = $('keyviz');
      kvPrereq.hidden = true;
      kvContainer.hidden = false;
      renderKeyViz(kvContainer, {
        h0Positions: kp.h0Positions,
        h1Positions: kp.h1Positions,
        hPositions: kp.hPositions,
        r: SIM_R,
        specHalfWeight: BIKE_PARAMS[1].w / 2,
      });

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

  // Tamper control: plant more errors than the code is provisioned to correct.
  const tamper = document.getElementById('encap-weight') as HTMLInputElement | null;
  const tamperVal = document.getElementById('encap-weight-val');
  const tamperWarn = document.getElementById('encap-weight-warn');
  if (tamper) {
    tamper.min = '1';
    tamper.max = String(MAX_ERROR_WEIGHT);
    tamper.value = String(SIM_T);
    const syncTamper = () => {
      currentErrorWeight = Number(tamper.value);
      if (tamperVal) tamperVal.textContent = String(currentErrorWeight);
      if (tamperWarn) {
        tamperWarn.hidden = currentErrorWeight <= SIM_T;
        tamperWarn.textContent =
          `t = ${currentErrorWeight} is above the ${SIM_T} these parameters are provisioned for — the decoder is now being asked to correct more errors than it can. Expect failures.`;
      }
    };
    tamper.addEventListener('input', syncTamper);
    syncTamper();
  }

  encapBtn.addEventListener('click', async () => {
    if (!currentKeyPair) return;
    encapBtn.disabled = true;
    encapBtn.textContent = 'Encapsulating…';
    encapOutput.innerHTML = '<p class="loading-text">Generating error vector and computing ciphertext…</p>';
    decapOutput.innerHTML = '';
    matchDiv.style.display = 'none';
    // A fresh encapsulation invalidates any prior decoder run.
    if (stopDecoderViz) { stopDecoderViz(); stopDecoderViz = null; }
    $('decoder-viz-wrap').hidden = true;
    $('decoder-viz').innerHTML = '';

    try {
      const result = await bikeEncap(currentKeyPair.publicKey, currentErrorWeight);
      currentEncap = result;

      encapOutput.innerHTML = `
        <div class="output-section">
          <h4>Ciphertext c₀</h4>
          <p class="mono output-scroll">${truncHex(result.c0Hex, 80)}</p>

          <h4>Ciphertext c₁ <span class="status-chip status-sim">simulated</span></h4>
          <p class="mono output-scroll">${truncHex(result.c1Hex, 80)}</p>
          <p class="meta note-inline">In real BIKE, c₁ = m ⊕ L(e) binds the message to the error under the
          Fujisaki–Okamoto (IND-CCA) transform, and decapsulation re-encrypts to
          verify it. This demo emits 32 random bytes for c₁ and does <strong>not</strong>
          perform that re-encryption check — decoding recovers the error directly,
          so tampering with c₁ is not detected here.</p>

          <h4>Alice's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret">${toHex(result.sharedSecret)}</p>

          <p class="meta">Error vector weight: ${result.errorPositions.length}${
            result.errorPositions.length === SIM_T
              ? ` (the parameter set's t = ${SIM_T})`
              : ` — <strong>tampered</strong>, the parameter set's t is ${SIM_T}`
          }</p>
          <p class="meta">Total ciphertext: ${result.ciphertext.length} bytes (simulation) | Spec BIKE Level 1: ${BIKE_PARAMS[1].ct_bytes.toLocaleString()} bytes</p>
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

      // Render the step-by-step Black-Gray-Flip decoder from the real trace.
      if (stopDecoderViz) { stopDecoderViz(); stopDecoderViz = null; }
      const dvWrap = $('decoder-viz-wrap');
      const dvContainer = $('decoder-viz');
      dvWrap.hidden = false;
      stopDecoderViz = renderDecoderViz(dvContainer, {
        r: SIM_R,
        initialSyndromeWeight: result.initialSyndromeWeight,
        trace: result.trace,
        success: result.success,
        errorWeight: currentEncap.errorPositions.length,
      });

      const aliceHex = toHex(currentEncap.sharedSecret);
      const bobHex = toHex(result.sharedSecret);
      const match = aliceHex === bobHex;

      decapOutput.innerHTML = `
        <div class="output-section">
          <h4>Bob's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret">${bobHex}</p>

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
        const tampered = currentEncap.errorPositions.length > SIM_T;
        matchDiv.innerHTML = `
          <div class="match-failure" role="alert">
            <span class="match-icon" aria-hidden="true">❌</span>
            <span><strong>Shared secrets do NOT match.</strong> ${
              tampered
                ? `The error weight was pushed to ${currentEncap.errorPositions.length}, past what these parameters can correct — this is the decoding-failure regime, on purpose.`
                : `A decoding failure at the parameter set's own t = ${SIM_T}. At these reduced simulation parameters that happens for roughly 0.5% of error patterns; spec BIKE Level 1 targets below 2<sup>−128</sup>.`
            } Measure the rate yourself in the DFR lab below.</span>
          </div>
        `;
      }

    } catch (err) {
      decapOutput.innerHTML = `<p class="error-text" role="alert">Decapsulation failed: ${escapeHtml(String(err))}</p>`;
    } finally {
      decapBtn.disabled = false;
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
          <p class="mono output-scroll">${result.iv}</p>
          <p class="meta">Ciphertext:</p>
          <p class="mono output-scroll">${truncHex(result.ciphertext, 120)}</p>

          <h4>Decrypted</h4>
          <p class="decrypted-text">"${escapeHtml(result.plaintext)}"</p>

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

// --- Panel 1: Circulant demo ---
function initCirculant(): void {
  const container = document.getElementById('circulant-demo');
  if (container) renderCirculantDemo(container);
}

// --- Panel 4: Comparison Chart ---
function initCompare(): void {
  const container = $('compare-chart');
  if (container) {
    renderCompareChart(container);
  }
}

// --- Panel 2: Key size bars (log axis, computed from the byte counts) ---
function initKeySizes(): void {
  const container = document.getElementById('key-size-bars');
  if (container) renderKeySizeBars(container);
}

// --- Panel 3: Error weight vs measured DFR ---
function initDfrLab(): void {
  const container = document.getElementById('dfr-lab');
  if (container) renderDfrLab(container);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPanels();
  fillParamStrings();
  initParityDemo();
  initCirculant();
  initKeyGen();
  initKeySizes();
  initEncapDecap();
  initDfrLab();
  initAes();
  initCompare();
});
