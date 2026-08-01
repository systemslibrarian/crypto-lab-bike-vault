/**
 * compare.ts — BIKE vs ML-KEM comparison data and chart rendering
 *
 * All data sourced from published specification documents:
 * - BIKE: https://bikesuite.org (NIST Round 4 Submission)
 * - ML-KEM: FIPS 203 / https://pq-crystals.org/kyber/
 */

export interface KemEntry {
  name: string;
  level: number;
  pkBytes: number;
  ctBytes: number;
  ssBytes: number;
  assumption: string;
  nistStatus: string;
  family: 'bike' | 'mlkem';
}

export const COMPARISON_DATA: KemEntry[] = [
  { name: 'BIKE Level 1',       level: 1, pkBytes: 1541,  ctBytes: 1573,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Candidate',   family: 'bike' },
  { name: 'ML-KEM-512',   level: 1, pkBytes: 800,   ctBytes: 768,   ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
  { name: 'BIKE Level 3',       level: 3, pkBytes: 3083,  ctBytes: 3115,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Candidate',   family: 'bike' },
  { name: 'ML-KEM-768',   level: 3, pkBytes: 1184,  ctBytes: 1088,  ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
  { name: 'BIKE Level 5',       level: 5, pkBytes: 5122,  ctBytes: 5154,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Candidate',   family: 'bike' },
  { name: 'ML-KEM-1024',  level: 5, pkBytes: 1568,  ctBytes: 1568,  ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
];

// --- Public-key size comparison (Panel 2) ---

export interface KeySizeEntry {
  label: string;
  bytes: number;
  fill: string;  // css class for the bar fill
}

/** Published public-key sizes at NIST security level 1. */
export const KEY_SIZES: KeySizeEntry[] = [
  { label: 'BIKE Level 1',           bytes: 1541,   fill: 'bike-fill' },
  { label: 'ML-KEM-512',             bytes: 800,    fill: 'mlkem-fill' },
  { label: 'RSA-2048',               bytes: 256,    fill: 'rsa-fill' },
  { label: 'Classic McEliece 348864', bytes: 261120, fill: 'mceliece-fill' },
];

/**
 * Render the public-key size bars on a LOGARITHMIC axis.
 *
 * These four numbers span three orders of magnitude (256 B to 261 KB). On a linear
 * axis everything but Classic McEliece is a sliver; the previous hand-written
 * percentages "fixed" that by clipping McEliece to 100% while BIKE sat at 25%,
 * which drew a 4x picture over byte labels that read 169x. Bar lengths are now
 * computed from the byte counts themselves — log-scaled, so each bar's length is
 * an honest function of its own label and the axis is stated on the chart.
 */
export function renderKeySizeBars(container: HTMLElement): void {
  const maxBytes = Math.max(...KEY_SIZES.map((e) => e.bytes));
  const minBytes = Math.min(...KEY_SIZES.map((e) => e.bytes));
  // Decade gridlines from the smallest to the largest value, one per power of ten.
  const loDecade = Math.floor(Math.log10(minBytes));
  const hiDecade = Math.ceil(Math.log10(maxBytes));
  const lo = Math.pow(10, loDecade);
  const span = Math.log10(maxBytes) - Math.log10(lo);
  const pctFor = (bytes: number): number =>
    Math.max(2, Math.min(100, ((Math.log10(bytes) - Math.log10(lo)) / span) * 100));

  const ticks: string[] = [];
  for (let dec = loDecade; dec <= hiDecade; dec++) {
    const v = Math.pow(10, dec);
    if (v > maxBytes) break;
    ticks.push(
      `<span class="size-tick" style="left:${pctFor(v).toFixed(2)}%"><span class="size-tick-label">${v.toLocaleString()}</span></span>`,
    );
  }

  const ratio = Math.round(maxBytes / KEY_SIZES[0].bytes);

  const rows = KEY_SIZES.map((e) => `
    <div class="size-bar-group">
      <div class="size-bar-label">${e.label} Public Key</div>
      <div class="size-bar" style="--bar-pct: ${pctFor(e.bytes).toFixed(2)}%;">
        <span class="size-bar-fill ${e.fill}"></span>
        <span class="size-value">${e.bytes.toLocaleString()} B</span>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="size-comparison" role="img" aria-label="Public key sizes on a logarithmic scale: ${KEY_SIZES.map((e) => `${e.label} ${e.bytes.toLocaleString()} bytes`).join('; ')}">
      ${rows}
      <div class="size-axis" aria-hidden="true">${ticks.join('')}</div>
      <p class="size-axis-note">Bar length is <strong>logarithmic</strong> in bytes — each gridline is 10x the one before it. On a linear axis the first three bars would be invisible next to Classic McEliece, which is <strong>${ratio}x</strong> the size of BIKE's public key.</p>
    </div>
  `;
}

/** Render a CSS-based bar chart comparing pk+ct sizes */
export function renderCompareChart(container: HTMLElement): void {
  const levels = [1, 3, 5];
  const maxSize = Math.max(...COMPARISON_DATA.map(e => e.pkBytes + e.ctBytes));

  let html = '<div class="compare-chart" role="table" aria-label="Bar chart: public key plus ciphertext sizes">';
  html += '<div class="chart-header" role="row"><span role="columnheader">Scheme</span><span role="columnheader">PK + CT Size</span></div>';

  for (const level of levels) {
    const entries = COMPARISON_DATA.filter(e => e.level === level);
    html += `<div class="chart-rowgroup" role="rowgroup" aria-label="Security Level ${level}">`;
    html += `<div class="chart-level-label" role="presentation" aria-hidden="true">Level ${level}</div>`;

    for (const entry of entries) {
      const total = entry.pkBytes + entry.ctBytes;
      const pct = (total / maxSize) * 100;
      const barClass = entry.family === 'bike' ? 'bar-bike' : 'bar-mlkem';

      html += `
        <div class="chart-row" role="row">
          <span class="chart-label" role="rowheader">${entry.name}</span>
          <div class="chart-bar-container" role="cell">
            <div class="chart-bar ${barClass}" style="width:${pct.toFixed(1)}%;" aria-label="${entry.name}: ${total.toLocaleString()} bytes total">
              <span class="chart-bar-value">${total.toLocaleString()} B</span>
            </div>
          </div>
        </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  html += '<div class="chart-legend" aria-label="Chart legend">';
  html += '<span class="legend-item"><span class="legend-swatch bar-bike" aria-hidden="true"></span> BIKE (code-based)</span>';
  html += '<span class="legend-item"><span class="legend-swatch bar-mlkem" aria-hidden="true"></span> ML-KEM (lattice-based)</span>';
  html += '</div>';

  container.innerHTML = html;
}
