/**
 * decoderviz.ts — Step-by-step visualization of the Black-Gray-Flip (BGF) decoder.
 *
 * This renders the SAME decoder state the KEM computes (see bike.ts BgfStep): for
 * each iteration it shows the flip threshold T, the live syndrome weight, and a
 * grid of every code bit coloured by its unsatisfied-check counter — Black bits
 * (counter ≥ T, flipped this round), Gray bits (counter = T−1, on the bubble),
 * and settled bits. A Step / Play control walks the iterations so the learner can
 * watch counters cross the threshold, bits flip, and the syndrome weight collapse
 * toward zero (or, on a decoding failure, stall above zero — the visible face of
 * BIKE's non-zero DFR).
 *
 * Nothing here is fabricated: the trace is emitted by the real bgfDecode loop.
 */

import type { BgfStep } from './bike';

export interface DecoderVizData {
  r: number;                    // block size
  initialSyndromeWeight: number;
  trace: BgfStep[];
  success: boolean;
}

interface CellClass {
  cls: string;                  // css class for the bit cell
  label: string;                // aria/state label
}

/** Classify one bit for a given iteration snapshot. */
function classifyBit(counter: number, threshold: number, flipped: boolean): CellClass {
  if (flipped) return { cls: 'bit-flip', label: 'Black — flipped' };
  if (counter >= threshold) return { cls: 'bit-black', label: 'Black' };
  if (counter === threshold - 1) return { cls: 'bit-gray', label: 'Gray' };
  if (counter > 0) return { cls: 'bit-warm', label: 'checks pending' };
  return { cls: 'bit-cold', label: 'satisfied' };
}

/** Render the grid of cells for one block at one iteration. */
function renderBlockGrid(
  counters: number[],
  flips: number[],
  threshold: number,
  blockLabel: string,
): string {
  const flipSet = new Set(flips);
  const cells = counters
    .map((c, j) => {
      const { cls } = classifyBit(c, threshold, flipSet.has(j));
      // title carries the exact counter for pointer users; grid is aria-hidden
      // because the per-iteration summary line below is the SR-facing description.
      return `<span class="dv-cell ${cls}" title="bit ${j}: ${c} unsatisfied checks"></span>`;
    })
    .join('');
  return `
    <div class="dv-block">
      <div class="dv-block-label">${blockLabel}</div>
      <div class="dv-grid" aria-hidden="true">${cells}</div>
    </div>
  `;
}

/** Build the full HTML for a single iteration frame. */
function renderFrame(data: DecoderVizData, idx: number): string {
  const step = data.trace[idx];
  const total = data.trace.length;
  const blackCount =
    step.counters0.filter((c) => c >= step.threshold).length +
    step.counters1.filter((c) => c >= step.threshold).length;
  const grayCount =
    step.counters0.filter((c) => c === step.threshold - 1).length +
    step.counters1.filter((c) => c === step.threshold - 1).length;
  const flipCount = step.flips0.length + step.flips1.length;

  // Syndrome-weight bar, scaled against the initial (max) weight so the collapse
  // toward zero is visible as the bar shrinks iteration over iteration.
  const maxW = Math.max(data.initialSyndromeWeight, 1);
  const pctBefore = Math.round((step.syndromeWeight / maxW) * 100);
  const pctAfter = Math.round((step.syndromeWeightAfter / maxW) * 100);

  return `
    <div class="dv-frame">
      <div class="dv-stat-row">
        <span class="dv-stat"><span class="dv-stat-num">${idx + 1}</span>/${total} iteration${total === 1 ? '' : 's'}</span>
        <span class="dv-stat">threshold T = <span class="dv-stat-num">${step.threshold}</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-black">${blackCount} Black</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-gray">${grayCount} Gray</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-flip">${flipCount} flipped</span></span>
      </div>

      <div class="dv-syndrome">
        <div class="dv-syndrome-label">Syndrome weight</div>
        <div class="dv-syndrome-track">
          <span class="dv-syndrome-fill" style="width:${pctBefore}%"></span>
        </div>
        <div class="dv-syndrome-val">${step.syndromeWeight} → <strong>${step.syndromeWeightAfter}</strong> after flips</div>
      </div>

      <div class="dv-blocks">
        ${renderBlockGrid(step.counters0, step.flips0, step.threshold, 'Block e₀')}
        ${renderBlockGrid(step.counters1, step.flips1, step.threshold, 'Block e₁')}
      </div>

      <p class="dv-caption">
        Each cell is one code bit. A bit turns <span class="dv-key dv-key-black">Black</span>
        when at least T = ${step.threshold} of its parity checks are unsatisfied (almost
        certainly an error) and gets flipped; a bit one check short is
        <span class="dv-key dv-key-gray">Gray</span> (uncertain). This round flipped
        ${flipCount} bit${flipCount === 1 ? '' : 's'}, moving the syndrome weight from
        ${step.syndromeWeight} to ${step.syndromeWeightAfter}${pctAfter === 0 ? ' — zero, so the error is fully recovered.' : '.'}
      </p>
    </div>
  `;
}

/**
 * Attach the interactive decoder visualization to a container element.
 * Returns a cleanup function that stops any running animation.
 */
export function renderDecoderViz(container: HTMLElement, data: DecoderVizData): () => void {
  let idx = 0;
  let playTimer: number | null = null;

  const shell = document.createElement('div');
  shell.className = 'decoder-viz';
  shell.innerHTML = `
    <div class="dv-controls" role="group" aria-label="Black-Gray-Flip decoder playback">
      <button type="button" class="btn btn-secondary dv-btn" data-act="prev" aria-label="Previous decoder iteration">‹ Step back</button>
      <button type="button" class="btn btn-primary dv-btn" data-act="play" aria-label="Play the decoder iteration animation">▶ Play</button>
      <button type="button" class="btn btn-secondary dv-btn" data-act="next" aria-label="Next decoder iteration">Step ›</button>
      <button type="button" class="btn btn-secondary dv-btn" data-act="reset" aria-label="Reset decoder animation to first iteration">↺ Reset</button>
    </div>
    <div class="dv-legend" aria-hidden="true">
      <span class="dv-legend-item"><span class="dv-swatch bit-black"></span>Black (≥ T, flip)</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-gray"></span>Gray (T−1)</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-flip"></span>flipped this round</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-warm"></span>some checks unsatisfied</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-cold"></span>satisfied</span>
    </div>
    <div class="dv-stage" aria-live="polite"></div>
    <p class="dv-outcome" role="status"></p>
  `;
  container.innerHTML = '';
  container.appendChild(shell);

  const stage = shell.querySelector<HTMLElement>('.dv-stage')!;
  const outcome = shell.querySelector<HTMLElement>('.dv-outcome')!;
  const playBtn = shell.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paintOutcome(): void {
    const atEnd = idx >= data.trace.length - 1;
    if (!atEnd) {
      outcome.textContent = '';
      outcome.className = 'dv-outcome';
      return;
    }
    if (data.success) {
      outcome.className = 'dv-outcome dv-outcome-ok';
      outcome.textContent = '✓ Syndrome reached zero — the error vector is recovered and the shared secret can be derived.';
    } else {
      outcome.className = 'dv-outcome dv-outcome-fail';
      outcome.textContent = '✗ The decoder stopped with a non-zero syndrome. This is a decoding failure — the visible face of BIKE\'s non-zero DFR. Re-encapsulate to try a fresh error pattern.';
    }
  }

  function render(): void {
    if (data.trace.length === 0) {
      stage.innerHTML = '<p class="dv-caption">The syndrome was already zero — nothing to decode.</p>';
      outcome.textContent = '';
      return;
    }
    stage.innerHTML = renderFrame(data, idx);
    paintOutcome();
  }

  function stop(): void {
    if (playTimer !== null) {
      window.clearInterval(playTimer);
      playTimer = null;
      playBtn.textContent = '▶ Play';
      playBtn.setAttribute('aria-label', 'Play the decoder iteration animation');
    }
  }

  function play(): void {
    if (data.trace.length <= 1) return;
    if (playTimer !== null) { stop(); return; }
    if (idx >= data.trace.length - 1) idx = 0;
    playBtn.textContent = '⏸ Pause';
    playBtn.setAttribute('aria-label', 'Pause the decoder iteration animation');
    playTimer = window.setInterval(() => {
      if (idx >= data.trace.length - 1) { stop(); return; }
      idx++;
      render();
    }, prefersReduced ? 1100 : 750);
  }

  shell.querySelector('.dv-controls')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'play') { play(); return; }
    stop();
    if (act === 'next') idx = Math.min(idx + 1, data.trace.length - 1);
    else if (act === 'prev') idx = Math.max(idx - 1, 0);
    else if (act === 'reset') idx = 0;
    render();
  });

  render();
  return stop;
}
