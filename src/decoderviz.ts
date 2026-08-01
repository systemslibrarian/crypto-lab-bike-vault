/**
 * decoderviz.ts — Step-by-step visualization of the Black-Gray-Flip (BGF) decoder.
 *
 * This renders the SAME decoder state the KEM computes (see bike.ts BgfStep): for
 * each iteration it shows the flip threshold T, the live syndrome weight, and a
 * grid of every code bit coloured by its unsatisfied-check counter — Black bits
 * (counter ≥ T, flipped this round), Gray bits (within τ of T, held back), and
 * settled bits. On the first iteration it also shows the two masked correction
 * passes BGF is named for: the Black pass that walks back flips which still look
 * wrong, and the Gray pass that flips the bits that were on the bubble. A Step /
 * Play control walks the iterations so the learner can watch counters cross the
 * threshold, bits flip, and the syndrome weight collapse toward zero (or, on a
 * decoding failure, stall above zero — the visible face of BIKE's non-zero DFR).
 *
 * Nothing here is fabricated: the trace is emitted by the real bgfDecode loop, and
 * every count on screen is a length of one of that trace's mask arrays.
 */

import type { BgfStep } from './bike';

export interface DecoderVizData {
  r: number;                    // block size
  initialSyndromeWeight: number;
  trace: BgfStep[];
  success: boolean;
  errorWeight: number;          // weight of the error vector that was planted
}

/** Render the grid of cells for one block at one iteration. */
function renderBlockGrid(
  counters: number[],
  black: number[],
  gray: number[],
  blackUndo: number[],
  grayFlips: number[],
  blockLabel: string,
): string {
  const blackSet = new Set(black);
  const graySet = new Set(gray);
  const undoSet = new Set(blackUndo);
  const grayFlipSet = new Set(grayFlips);

  const cells = counters
    .map((c, j) => {
      // Priority reflects what actually happened to the bit this iteration.
      let cls = 'bit-cold';
      let what = 'settled';
      if (undoSet.has(j)) { cls = 'bit-undo'; what = 'Black, flipped then un-flipped by the Black pass'; }
      else if (grayFlipSet.has(j)) { cls = 'bit-grayflip'; what = 'Gray, flipped by the Gray pass'; }
      else if (blackSet.has(j)) { cls = 'bit-flip'; what = 'Black, flipped'; }
      else if (graySet.has(j)) { cls = 'bit-gray'; what = 'Gray, held back'; }
      else if (c > 0) { cls = 'bit-warm'; what = 'some checks unsatisfied'; }
      // title carries the exact counter for pointer users; grid is aria-hidden
      // because the per-iteration summary line below is the SR-facing description.
      return `<span class="dv-cell ${cls}" title="bit ${j}: ${c} unsatisfied checks — ${what}"></span>`;
    })
    .join('');
  return `
    <div class="dv-block">
      <div class="dv-block-label">${blockLabel}</div>
      <div class="dv-grid" aria-hidden="true">${cells}</div>
    </div>
  `;
}

/** One phase row in the "what this iteration did" breakdown. */
function phaseRow(name: string, detail: string, from: number, to: number): string {
  const delta = to - from;
  const sign = delta > 0 ? '+' : '';
  const tone = delta < 0 ? 'dv-phase-down' : delta > 0 ? 'dv-phase-up' : 'dv-phase-flat';
  return `
    <li class="dv-phase ${tone}">
      <span class="dv-phase-name">${name}</span>
      <span class="dv-phase-detail">${detail}</span>
      <span class="dv-phase-weight">syndrome ${from} → ${to} <span class="dv-phase-delta">(${sign}${delta})</span></span>
    </li>
  `;
}

/** Build the full HTML for a single iteration frame. */
function renderFrame(data: DecoderVizData, idx: number): string {
  const step = data.trace[idx];
  const total = data.trace.length;
  const blackCount = step.black0.length + step.black1.length;
  const grayCount = step.gray0.length + step.gray1.length;
  const undoCount = step.blackUndo0.length + step.blackUndo1.length;
  const grayFlipCount = step.grayFlips0.length + step.grayFlips1.length;
  const netFlips = blackCount - undoCount + grayFlipCount;

  // Syndrome-weight bar, scaled against the initial (max) weight so the collapse
  // toward zero is visible as the bar shrinks iteration over iteration.
  const maxW = Math.max(data.initialSyndromeWeight, 1);
  const pctBefore = Math.round((step.syndromeWeight / maxW) * 100);

  const phases: string[] = [
    phaseRow(
      'Flip Black',
      `${blackCount} bit${blackCount === 1 ? '' : 's'} at counter ≥ T = ${step.threshold}`,
      step.syndromeWeight,
      step.syndromeWeightAfterBlack,
    ),
  ];
  if (step.masked) {
    phases.push(
      phaseRow(
        'Black pass',
        undoCount === 0
          ? `no Black flip still looked wrong — none un-flipped`
          : `${undoCount} of those ${blackCount} still had ≥ ${step.maskedThreshold} unsatisfied checks — un-flipped`,
        step.syndromeWeightAfterBlack,
        step.syndromeWeightAfterBlackPass,
      ),
      phaseRow(
        'Gray pass',
        grayFlipCount === 0
          ? `none of the ${grayCount} Gray bit${grayCount === 1 ? '' : 's'} reached ${step.maskedThreshold} on review`
          : `${grayFlipCount} of ${grayCount} Gray bit${grayCount === 1 ? '' : 's'} crossed ${step.maskedThreshold} on review — flipped`,
        step.syndromeWeightAfterBlackPass,
        step.syndromeWeightAfter,
      ),
    );
  }

  return `
    <div class="dv-frame">
      <div class="dv-stat-row">
        <span class="dv-stat"><span class="dv-stat-num">${idx + 1}</span>/${total} iteration${total === 1 ? '' : 's'}</span>
        <span class="dv-stat">threshold T = <span class="dv-stat-num">${step.threshold}</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-black">${blackCount} Black</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-gray">${grayCount} Gray</span></span>
        <span class="dv-stat"><span class="dv-badge dv-badge-flip">${netFlips} net flip${netFlips === 1 ? '' : 's'}</span></span>
      </div>

      <div class="dv-syndrome">
        <div class="dv-syndrome-label">Syndrome weight</div>
        <div class="dv-syndrome-track">
          <span class="dv-syndrome-fill" style="width:${pctBefore}%"></span>
        </div>
        <div class="dv-syndrome-val">${step.syndromeWeight} → <strong>${step.syndromeWeightAfter}</strong> after this iteration</div>
      </div>

      <ol class="dv-phases">${phases.join('')}</ol>
      ${step.masked
        ? '<p class="dv-phase-note">The two masked passes run on the <strong>first iteration only</strong> — that is exactly what the BIKE specification prescribes, and it is what separates BGF from a plain bit-flipping decoder.</p>'
        : '<p class="dv-phase-note">Later iterations are plain threshold flips: the Black and Gray correction passes belong to iteration 1.</p>'}

      <div class="dv-blocks">
        ${renderBlockGrid(step.counters0, step.black0, step.gray0, step.blackUndo0, step.grayFlips0, 'Block e₀')}
        ${renderBlockGrid(step.counters1, step.black1, step.gray1, step.blackUndo1, step.grayFlips1, 'Block e₁')}
      </div>

      <p class="dv-caption">
        Each cell is one code bit. A bit turns <span class="dv-key dv-key-black">Black</span>
        when at least T = ${step.threshold} of its parity checks are unsatisfied and gets flipped;
        a bit within τ = ${step.grayBand} of T is <span class="dv-key dv-key-gray">Gray</span> — held back
        this pass, then reviewed once the Black flips have changed the syndrome underneath it.
        Threshold T is recomputed from the live syndrome weight every iteration.
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
      <span class="dv-legend-item"><span class="dv-swatch bit-flip"></span>Black — flipped (≥ T)</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-undo"></span>Black pass un-flipped it</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-gray"></span>Gray — held back</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-grayflip"></span>Gray pass flipped it</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-warm"></span>some checks unsatisfied</span>
      <span class="dv-legend-item"><span class="dv-swatch bit-cold"></span>settled</span>
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
      outcome.textContent =
        `✗ The decoder stopped with a non-zero syndrome. This is a decoding failure — the visible face of BIKE's non-zero DFR. ` +
        `The error weight was ${data.errorWeight}; lower it with the error-weight slider (or re-encapsulate) and the decoder converges again.`;
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
