import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The `hidden` attribute must actually hide.
 *
 * `[hidden] { display: none }` is a UA rule whose attribute selector has
 * specificity (0,1,0) — exactly a class's — so any later `.foo { display: … }`
 * in this stylesheet wins and the element paints while the code believes it is
 * hidden. `.dfr-progress { display: grid }` did exactly that: the DFR lab
 * writes its progress bar into the page carrying `hidden`, and an empty 878x16
 * track painted for as long as panel 3 was open, before any run had started.
 * `progress.hidden = true` at the end of a run was equally inert.
 *
 * Asserted over the ATTRIBUTE rather than over that one element: a per-element
 * assertion would have to be added again for the next class that sets
 * `display`, which is the pattern this replaces. And asserted with each panel
 * open, because `.panel { display: none }` hides four of the five subtrees at
 * first paint — a first-paint-only check would have looked straight past this
 * one, which lives inside panel 3.
 */

const PANELS = [1, 2, 3, 4, 5] as const;

/** Every element carrying `hidden` that is nonetheless painting. */
async function painted(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[hidden]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          who: el.id || el.className || el.tagName,
          display: getComputedStyle(el).display,
          box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        };
      })
      .filter((x) => x.display !== 'none')
  );
}

test('nothing marked hidden is painted, in any panel', async ({ page }) => {
  await boot(page, 'dark');

  for (const n of PANELS) {
    await page.locator(`#tab-${n}`).click();
    await expect(page.locator(`#panel-${n}`)).toBeVisible();

    // Non-vacuity: an empty [hidden] set would make the assertion below pass
    // having checked nothing.
    const total = await page.locator('[hidden]').count();
    expect(total, `panel ${n}: no [hidden] elements, so this proves nothing`).toBeGreaterThan(0);

    expect(await painted(page), `panel ${n}: elements marked hidden that still paint`).toEqual([]);
  }

  // And the element this was found on is genuinely in the hidden set while its
  // panel is open, so the sweep above is not passing by its having quietly
  // stopped carrying the attribute.
  await page.locator('#tab-3').click();
  await expect(page.locator('.dfr-progress')).toHaveAttribute('hidden', '');
  await expect(page.locator('.dfr-progress')).toBeHidden();
});

test('the DFR progress bar appears only while a run is in flight', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, 'dark');
  await page.locator('#tab-3').click();

  // Before: the bar carries `hidden` and paints nothing.
  await expect(page.locator('.dfr-progress')).toBeHidden();

  await page.locator('#dfr-run').click();
  // During: `progress.hidden = false`, and it must now be real. This is the
  // half that keeps the fix honest — `display: none !important` on [hidden]
  // would be trivially satisfiable by a bar that never showed at all.
  await expect(page.locator('.dfr-progress')).toBeVisible({ timeout: 60_000 });

  // After: the run's own `progress.hidden = true` must retire it. It did not,
  // and a completed run left a full-width bar standing under the results.
  await expect(page.locator('#dfr-run')).toBeEnabled({ timeout: 120_000 });
  await expect(page.locator('.dfr-table')).toBeVisible();
  await expect(page.locator('.dfr-progress')).toBeHidden();
  expect(await painted(page), 'elements marked hidden that still paint after a run').toEqual([]);
});
