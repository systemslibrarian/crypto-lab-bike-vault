import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Shared machinery for the WCAG gate.
 *
 * Two rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. An earlier version of
 *     this gate pushed `opacity: 1 !important` and zeroed every transition and
 *     animation duration before running axe. That does not suppress a check,
 *     it fabricates the input: partial opacity is real rendering, and forcing
 *     it opaque hands axe a foreground colour the page never paints. The
 *     numbers it produced were fiction in both directions. Zeroed transition
 *     durations likewise made the suite structurally unable to see a
 *     transition or theme-swap defect. Motion is now settled honestly instead
 *     — see `settle` — and the composite-aware arithmetic in contrast.ts
 *     measures faded text against the surface it is really painted on.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans
 *     well past first paint. axe over an empty container passes having checked
 *     nothing, and the states this page is actually interesting in — result
 *     panels, error text, a decoding-failure verdict, a 380px viewport — are
 *     not the state it loads in.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * A theme flip on this page starts ~84 concurrent transitions, which drain in
 * waves (measured: 84 running for 12 frames, then 68 for 3, then 0), so a poll
 * for "nothing running right now" can exit through a gap between waves. Require
 * quiescence to hold for several consecutive frames instead.
 *
 * The 20s ceiling is deliberately generous rather than tight: on a loaded
 * machine the raf cadence stretches, and the correct response to that is a
 * longer wait, never a narrower scan.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Load the page in a known theme with reduced motion actually in effect.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1 —
 * at file level and inside `test.describe` alike — so the emulation is applied
 * imperatively and then *asserted* from inside the page. Without that
 * assertion a gate can believe it is testing a reduced-motion rendering while
 * the page happily animates.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);

  // The page renders four regions from JS on DOMContentLoaded. Assert they
  // exist before anything scans, so a scan can never pass over empty boxes.
  await expect(page.locator('#circulant-demo .circ-matrix')).toBeAttached();
  await expect(page.locator('#key-size-bars .size-comparison')).toBeAttached();
  await expect(page.locator('#dfr-lab .dfr-lab')).toBeAttached();
  await expect(page.locator('#compare-chart .compare-chart')).toBeAttached();

  if (theme === 'light') {
    await page.locator('#cl-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  } else {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }
  await settle(page);
}

/** Open every native disclosure and every class-toggled tab panel. */
export async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
    for (const p of document.querySelectorAll('.panel')) {
      p.classList.add('active');
      p.removeAttribute('hidden');
    }
  });
  await settle(page);
}

/**
 * Scan the page as it currently stands.
 *
 * Three assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. Real defects hide there: an `aria-label` on a role-less
 *    element (ARIA prohibits naming a generic role, so the name is silently
 *    discarded) is filed as `aria-prohibited-attr` incomplete and is invisible
 *    to a violations-only gate. This lab carried nineteen of them. The one
 *    rule id allowed to remain incomplete is `color-contrast`, and only
 *    because the third assertion below computes those ratios arithmetically:
 *    axe bails out on a one-character cell, a non-text glyph, a gradient
 *    backdrop, or a node clipped by a scroll container, and every one of those
 *    cases is covered by the arithmetic instead.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node,
 *    measured against the surface the text is genuinely painted on. This is
 *    what caught `.circ-bit.circ-off` at 4.26:1, which axe had filed as
 *    incomplete for being "too short to determine if it is actual text".
 */
/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node. Both were being found by hand-sampling screenshot pixels, which does
 * not regress-test.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations in state: ${label}`).toEqual([]);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexplainedIncomplete, `axe incomplete results in state: ${label}`).toEqual([]);

  const contrast = formatContrastFailures(await auditContrast(page));
  expect(contrast, `measured contrast failures in state: ${label}`).toEqual([]);
  await expectNoNewNonTextFailures(page, label);
}
