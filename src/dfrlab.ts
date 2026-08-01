/**
 * dfrlab.ts — "Break the decoder": error weight vs measured decoding-failure rate.
 *
 * BIKE's headline correctness claim is a number you are normally asked to take on
 * faith (DFR < 2⁻¹²⁸ at spec parameters — far too rare to ever observe). This panel
 * turns the claim into something you can watch move: crank the error weight past
 * what the code is provisioned to correct and run a few hundred real decodes, and
 * the failure rate climbs off the floor and saturates at 100%.
 *
 * Every trial is a genuine encapsulate-and-decode at the simulation parameters —
 * plant a random error of the chosen weight, form the true syndrome, run the real
 * BGF decoder, and check that it recovered *exactly* the planted error. A fresh
 * keypair is generated every batch, so the rate averages over keys rather than
 * reporting one lucky private key's luck.
 */

import { bikeKeyGen, measureDfr, SIM_R, SIM_T, SIM_HALF_W, BGF_ITERATIONS } from './bike';

/** Widest error weight the slider offers. Chosen from the measured curve: the
 *  decoder is already at 100% failure well before here, so the whole waterfall
 *  — floor, knee, saturation — fits on the slider. */
export const MAX_ERROR_WEIGHT = 40;
const BATCH = 50;          // trials per keypair / per animation frame
const DEFAULT_TRIALS = 600;

interface Point {
  weight: number;
  trials: number;
  failures: number;
}

/** Accumulated measurements, keyed by error weight, so the curve fills in as the
 *  learner sweeps the slider instead of resetting on every run. */
type Curve = Map<number, Point>;

function fmtRate(failures: number, trials: number): string {
  if (trials === 0) return '—';
  if (failures === 0) return `0 / ${trials.toLocaleString()} (< ${(100 / trials).toFixed(2)}%)`;
  const pct = (100 * failures) / trials;
  const log2 = Math.log2(failures / trials);
  return `${failures.toLocaleString()} / ${trials.toLocaleString()} = ${pct.toFixed(2)}% ≈ 2<sup>${log2.toFixed(1)}</sup>`;
}

function renderCurve(curve: Curve, current: number): string {
  const weights = [...curve.keys()].sort((a, b) => a - b);
  if (weights.length === 0) {
    return '<p class="dfr-empty">No measurements yet. Pick an error weight and run a batch — then move the slider and run again to build the curve.</p>';
  }
  const bars = weights.map((w) => {
    const p = curve.get(w)!;
    const rate = p.failures / p.trials;
    // Bars are short at the floor by design: a 0% column is the point.
    const pct = Math.max(rate > 0 ? 2 : 0, rate * 100);
    const cls = w === current ? 'dfr-bar dfr-bar-current' : 'dfr-bar';
    const cap = w <= SIM_T ? ' dfr-bar-inspec' : '';
    return `
      <div class="dfr-col" title="t = ${w}: ${p.failures} failures in ${p.trials} trials">
        <div class="dfr-col-track"><span class="${cls}${cap}" style="height:${pct.toFixed(1)}%"></span></div>
        <div class="dfr-col-pct">${(rate * 100).toFixed(rate > 0 && rate < 0.01 ? 2 : 0)}%</div>
        <div class="dfr-col-w">${w}</div>
      </div>`;
  }).join('');

  const rows = weights.map((w) => {
    const p = curve.get(w)!;
    return `<tr${w === current ? ' class="dfr-row-current"' : ''}><th scope="row">t = ${w}${w === SIM_T ? ' (spec t for these parameters)' : ''}</th><td>${fmtRate(p.failures, p.trials)}</td></tr>`;
  }).join('');

  return `
    <div class="dfr-chart" role="img" aria-label="Measured decoding failure rate by error weight: ${weights.map((w) => { const p = curve.get(w)!; return `t ${w}, ${((100 * p.failures) / p.trials).toFixed(1)} percent`; }).join('; ')}">
      ${bars}
    </div>
    <div class="dfr-chart-axis" aria-hidden="true"><span>error weight t →</span></div>
    <table class="dfr-table">
      <caption>Measured decoding failures (fresh keypair every ${BATCH} trials)</caption>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/** Attach the error-weight / DFR lab to a container. Returns a cancel function. */
export function renderDfrLab(container: HTMLElement): () => void {
  const curve: Curve = new Map();
  let weight = SIM_T;
  let running = false;
  let cancelled = false;

  container.innerHTML = `
    <div class="dfr-lab">
      <div class="dfr-controls">
        <label class="dfr-slider-label" for="dfr-weight">
          Error vector weight <strong>t = <span id="dfr-weight-val">${SIM_T}</span></strong>
          <span class="dfr-slider-hint">(these parameters are provisioned for t = ${SIM_T})</span>
        </label>
        <input type="range" id="dfr-weight" class="dfr-slider" min="1" max="${MAX_ERROR_WEIGHT}" step="1" value="${SIM_T}"
               aria-describedby="dfr-slider-help" />
        <p id="dfr-slider-help" class="dfr-slider-help">
          r = ${SIM_R}, w/2 = ${SIM_HALF_W} per block, ${BGF_ITERATIONS} BGF iterations. Raising t above ${SIM_T}
          plants more errors than the code was sized to correct — no real sender can do this, which is exactly why
          it is the interesting knob.
        </p>
        <div class="dfr-buttons">
          <button type="button" id="dfr-run" class="btn btn-primary">Run ${DEFAULT_TRIALS.toLocaleString()} decodes at t = <span id="dfr-run-t">${SIM_T}</span></button>
          <button type="button" id="dfr-clear" class="btn btn-secondary">Clear measurements</button>
        </div>
      </div>
      <div class="dfr-progress" hidden>
        <div class="dfr-progress-track"><span class="dfr-progress-fill" style="width:0%"></span></div>
        <span class="dfr-progress-label"></span>
      </div>
      <p class="dfr-live" role="status" aria-live="polite"></p>
      <div class="dfr-results"></div>
    </div>
  `;

  const slider = container.querySelector<HTMLInputElement>('#dfr-weight')!;
  const weightVal = container.querySelector<HTMLElement>('#dfr-weight-val')!;
  const runT = container.querySelector<HTMLElement>('#dfr-run-t')!;
  const runBtn = container.querySelector<HTMLButtonElement>('#dfr-run')!;
  const clearBtn = container.querySelector<HTMLButtonElement>('#dfr-clear')!;
  const progress = container.querySelector<HTMLElement>('.dfr-progress')!;
  const progressFill = container.querySelector<HTMLElement>('.dfr-progress-fill')!;
  const progressLabel = container.querySelector<HTMLElement>('.dfr-progress-label')!;
  const live = container.querySelector<HTMLElement>('.dfr-live')!;
  const results = container.querySelector<HTMLElement>('.dfr-results')!;

  function paint(): void {
    results.innerHTML = renderCurve(curve, weight);
  }

  slider.addEventListener('input', () => {
    weight = Number(slider.value);
    weightVal.textContent = String(weight);
    runT.textContent = String(weight);
    paint();
  });

  clearBtn.addEventListener('click', () => {
    curve.clear();
    live.textContent = '';
    paint();
  });

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    slider.disabled = true;
    progress.hidden = false;

    const target = weight;
    const point = curve.get(target) ?? { weight: target, trials: 0, failures: 0 };
    curve.set(target, point);
    let done = 0;
    const thresholds = new Set<number>();

    while (done < DEFAULT_TRIALS && !cancelled) {
      const kp = await bikeKeyGen();
      const sample = measureDfr(kp.privateH0, kp.privateH1, target, BATCH);
      point.trials += sample.trials;
      point.failures += sample.failures;
      for (const th of sample.thresholds) thresholds.add(th);
      done += BATCH;

      const pct = Math.min(100, (done / DEFAULT_TRIALS) * 100);
      progressFill.style.width = `${pct.toFixed(0)}%`;
      progressLabel.textContent = `${Math.min(done, DEFAULT_TRIALS).toLocaleString()} / ${DEFAULT_TRIALS.toLocaleString()} decodes`;
      live.innerHTML = `t = ${target}: ${fmtRate(point.failures, point.trials)}`;
      paint();
      // Yield so the progress bar actually paints and the tab stays responsive.
      await new Promise((res) => setTimeout(res, 0));
    }

    progress.hidden = true;
    const ts = [...thresholds].sort((a, b) => a - b);
    live.innerHTML =
      `<strong>t = ${target}</strong> — measured decoding-failure rate ${fmtRate(point.failures, point.trials)}. ` +
      `Thresholds the decoder actually used this run: T ∈ {${ts.join(', ')}}.`;
    paint();

    running = false;
    runBtn.disabled = false;
    slider.disabled = false;
  }

  runBtn.addEventListener('click', () => { void run(); });

  paint();
  return () => { cancelled = true; };
}
