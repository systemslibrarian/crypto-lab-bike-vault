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
  { name: 'BIKE-1',       level: 1, pkBytes: 1541,  ctBytes: 1573,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Alternate',   family: 'bike' },
  { name: 'ML-KEM-512',   level: 1, pkBytes: 800,   ctBytes: 768,   ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
  { name: 'BIKE-3',       level: 3, pkBytes: 3083,  ctBytes: 3115,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Alternate',   family: 'bike' },
  { name: 'ML-KEM-768',   level: 3, pkBytes: 1184,  ctBytes: 1088,  ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
  { name: 'BIKE-5',       level: 5, pkBytes: 5122,  ctBytes: 5154,  ssBytes: 32, assumption: 'QC-MDPC Decoding', nistStatus: 'Round 4 Alternate',   family: 'bike' },
  { name: 'ML-KEM-1024',  level: 5, pkBytes: 1568,  ctBytes: 1568,  ssBytes: 32, assumption: 'Module-LWE',       nistStatus: 'FIPS 203 Standard',    family: 'mlkem' },
];

/** Render a CSS-based bar chart comparing pk+ct sizes */
export function renderCompareChart(container: HTMLElement): void {
  const levels = [1, 3, 5];
  const maxSize = Math.max(...COMPARISON_DATA.map(e => e.pkBytes + e.ctBytes));

  let html = '<div class="compare-chart" role="table" aria-label="Bar chart: public key plus ciphertext sizes">';
  html += '<div class="chart-header" role="row"><span role="columnheader">Scheme</span><span role="columnheader">PK + CT Size</span></div>';

  for (const level of levels) {
    const entries = COMPARISON_DATA.filter(e => e.level === level);
    html += `<div class="chart-level-label" role="rowgroup" aria-label="Security Level ${level}">Level ${level}</div>`;

    for (const entry of entries) {
      const total = entry.pkBytes + entry.ctBytes;
      const pct = (total / maxSize) * 100;
      const barClass = entry.family === 'bike' ? 'bar-bike' : 'bar-mlkem';

      html += `
        <div class="chart-row" role="row">
          <span class="chart-label" role="rowheader">${entry.name}</span>
          <div class="chart-bar-container">
            <div class="chart-bar ${barClass}" style="width:${pct.toFixed(1)}%;" role="cell" aria-label="${entry.name}: ${total.toLocaleString()} bytes total">
              <span class="chart-bar-value">${total.toLocaleString()} B</span>
            </div>
          </div>
        </div>`;
    }
  }

  html += '</div>';
  html += '<div class="chart-legend" aria-label="Chart legend">';
  html += '<span class="legend-item"><span class="legend-swatch bar-bike" aria-hidden="true"></span> BIKE (code-based)</span>';
  html += '<span class="legend-item"><span class="legend-swatch bar-mlkem" aria-hidden="true"></span> ML-KEM (lattice-based)</span>';
  html += '</div>';

  container.innerHTML = html;
}
