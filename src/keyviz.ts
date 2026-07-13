/**
 * keyviz.ts — Sparse-vs-dense trapdoor visualization for BIKE key generation.
 *
 * Renders the private polynomials h₀, h₁ as sparse dot patterns (a handful of set
 * positions among r) next to the public key h = h₀⁻¹·h₁ as a dense, roughly
 * half-full, structureless pattern. Seeing the two side by side delivers the core
 * trapdoor intuition instantly: the private key is sparse and easy to decode with;
 * the public key hides that structure so decoding looks like a hard random-code
 * problem to everyone else.
 *
 * The patterns are the ACTUAL generated key positions, not decoration.
 */

/** Render one r-bit polynomial as a compact grid of dots (set positions lit). */
function renderPattern(positions: number[], r: number, label: string, tone: string): string {
  const set = new Set(positions);
  // Cap the visual grid so it stays legible; each cell maps to one coefficient.
  // For the simulation r = 587 this is a full, faithful 1:1 map.
  const cells: string[] = [];
  for (let i = 0; i < r; i++) {
    cells.push(`<span class="kv-cell ${set.has(i) ? 'kv-on ' + tone : 'kv-off'}"></span>`);
  }
  const density = ((positions.length / r) * 100).toFixed(1);
  return `
    <div class="kv-pane">
      <div class="kv-pane-label">${label}</div>
      <div class="kv-grid" role="img" aria-label="${label}: ${positions.length} set positions out of ${r} (${density}% dense)">${cells.join('')}</div>
      <div class="kv-pane-meta">${positions.length} set / ${r} &nbsp;·&nbsp; ${density}% dense</div>
    </div>
  `;
}

export interface KeyVizData {
  h0Positions: number[];
  h1Positions: number[];
  hPositions: number[];
  r: number;
}

/** Attach the sparse-vs-dense trapdoor visualization to a container. */
export function renderKeyViz(container: HTMLElement, data: KeyVizData): void {
  container.innerHTML = `
    <div class="kv-wrap">
      <div class="kv-side kv-side-private">
        <div class="kv-side-title">Private key — <span class="kv-tag kv-tag-sparse">sparse &amp; structured</span></div>
        <div class="kv-panes">
          ${renderPattern(data.h0Positions, data.r, 'h₀', 'kv-tone-a')}
          ${renderPattern(data.h1Positions, data.r, 'h₁', 'kv-tone-b')}
        </div>
      </div>
      <div class="kv-arrow" aria-hidden="true">
        <span class="kv-arrow-op">h = h₀⁻¹ · h₁</span>
        <span class="kv-arrow-glyph">→</span>
      </div>
      <div class="kv-side kv-side-public">
        <div class="kv-side-title">Public key — <span class="kv-tag kv-tag-dense">dense &amp; structureless</span></div>
        <div class="kv-panes">
          ${renderPattern(data.hPositions, data.r, 'h', 'kv-tone-pub')}
        </div>
      </div>
    </div>
    <p class="kv-caption">
      The private key is two sparse rows (weight 7 each) — the trapdoor that makes decoding easy.
      Multiplying by h₀⁻¹ smears that structure into <strong>h</strong>, a ~half-full pattern with no
      visible sparsity. Recovering the sparse factorization from h alone is the hard problem BIKE rests on:
      to anyone without (h₀, h₁), h looks like a random code.
    </p>
  `;
}
