/**
 * circulant.ts — Live "one row defines the whole block" circulant demo.
 *
 * Bridges the [7,4] Hamming toy (Panel 1) to the quasi-cyclic structure that
 * defines QC-MDPC. The user edits a short first row; every subsequent row is that
 * row cyclically shifted right by one, filling an n×n circulant block. Toggling a
 * single bit in the first row visibly re-fills the entire block — making the
 * compact-key claim ("each circulant block is determined by one row") self-evident.
 *
 * This is exactly the structure of H₀ and H₁ in real BIKE, just at n = 12 instead
 * of r = 12,323 so a human can watch it.
 */

const N = 12; // small block size for the on-screen demo (real BIKE: r = 12,323)

/** Build the n×n circulant matrix whose first row is `firstRow`.
 *  Row i is the first row shifted right (cyclically) by i positions. */
export function buildCirculant(firstRow: number[]): number[][] {
  const n = firstRow.length;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(n);
    for (let j = 0; j < n; j++) {
      // circulant convention: M[i][j] = firstRow[(j - i) mod n]
      row[j] = firstRow[((j - i) % n + n) % n];
    }
    rows.push(row);
  }
  return rows;
}

function renderMatrix(firstRow: number[]): string {
  const mat = buildCirculant(firstRow);
  const rowsHtml = mat
    .map((row, i) => {
      const cells = row
        .map((b) => `<span class="circ-cell ${b ? 'circ-on' : 'circ-off'}"></span>`)
        .join('');
      const cls = i === 0 ? 'circ-row circ-row-first' : 'circ-row';
      return `<div class="${cls}">${cells}</div>`;
    })
    .join('');
  const weight = firstRow.reduce((a, b) => a + b, 0);
  return `
    <div class="circ-matrix" role="img" aria-label="A ${N} by ${N} circulant block. Each row is the first row cyclically shifted right by one. Row weight is ${weight}.">
      ${rowsHtml}
    </div>
  `;
}

function renderFirstRowEditor(firstRow: number[]): string {
  const btns = firstRow
    .map(
      (b, j) =>
        `<button type="button" class="circ-bit ${b ? 'circ-on' : 'circ-off'}" data-idx="${j}" aria-pressed="${b ? 'true' : 'false'}" aria-label="First-row bit ${j}: ${b ? '1, click to clear' : '0, click to set'}">${b}</button>`,
    )
    .join('');
  return `<div class="circ-editor" role="group" aria-label="Edit the first row of the circulant block">${btns}</div>`;
}

/** Attach the circulant demo to a container. */
export function renderCirculantDemo(container: HTMLElement): void {
  // A pleasant, sparse starting pattern (weight 3) so the diagonal shift is legible.
  let firstRow = new Array(N).fill(0);
  firstRow[0] = 1;
  firstRow[2] = 1;
  firstRow[5] = 1;

  const shell = document.createElement('div');
  shell.className = 'circ-demo';
  container.innerHTML = '';
  container.appendChild(shell);

  function paint(): void {
    const weight = firstRow.reduce((a, b) => a + b, 0);
    shell.innerHTML = `
      <p class="circ-instr">Toggle any bit in the <strong>first row</strong> below and watch the whole block re-fill. Every other row is just this row shifted one step to the right — so the entire ${N}×${N} block is stored as a single ${N}-bit row.</p>
      ${renderFirstRowEditor(firstRow)}
      <p class="circ-meta">First-row weight: <strong>${weight}</strong> of ${N} &nbsp;·&nbsp; the block is fully determined by these ${N} bits</p>
      ${renderMatrix(firstRow)}
      <p class="circ-caption">In BIKE-1 this same structure holds at <strong>r = 12,323</strong>: each circulant block H₀, H₁ is one sparse row of weight w/2 = 71, cyclically shifted — which is why the public key is compact.</p>
    `;
    shell.querySelector('.circ-editor')!.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.circ-bit');
      if (!btn) return;
      const j = Number(btn.dataset.idx);
      firstRow[j] ^= 1;
      paint();
      // keep keyboard focus on the toggled bit after re-render
      const again = shell.querySelector<HTMLElement>(`.circ-bit[data-idx="${j}"]`);
      again?.focus();
    });
  }

  paint();
}
