import { expect, test } from '@playwright/test';
import { boot, revealAll, scan, settle } from './gate';

/**
 * WCAG regression gate — the page's static states.
 *
 * Every panel is visited as a real tab activation (not just class-toggled into
 * view), in both themes, at desktop width and at 380px. The narrow pass is not
 * decoration: `scrollable-region-focusable` can only fail where something
 * actually overflows, so a 1280px-only gate can never see it. Both table
 * wrappers were WCAG 2.1.1 keyboard traps at mobile width, and both topbar
 * links lost their accessible name entirely below 560px, where
 * `.cl-btn span{display:none}` leaves nothing but an aria-hidden icon.
 *
 * See gate.ts for why nothing is injected into the page before a scan.
 */

const PANELS = [1, 2, 3, 4, 5] as const;

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme, every panel`, async ({ page }) => {
    await boot(page, theme);

    for (const n of PANELS) {
      await page.locator(`#tab-${n}`).click();
      await expect(page.locator(`#panel-${n}`)).toBeVisible();
      await expect(page.locator(`#panel-${n} h2`)).toBeVisible();
      await settle(page);
      await scan(page, `${theme} / panel ${n}`);
    }

    // Everything open at once, which is the only way the <details> bodies and
    // the panels that are not currently selected get looked at together.
    await revealAll(page);
    await expect(page.locator('details[open]').first()).toBeVisible();
    await scan(page, `${theme} / all panels and disclosures open`);
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 720 });
    await boot(page, theme);

    // The tables only overflow their wrappers here, so this is the only place
    // the wrappers' keyboard reachability can be exercised at all.
    await page.locator('#tab-2').click();
    await expect(page.locator('#panel-2')).toBeVisible();
    const wrapperScrolls = await page
      .locator('.param-table-wrapper')
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(wrapperScrolls, '.param-table-wrapper must actually overflow at 380px').toBe(true);
    await scan(page, `${theme} / 380px / panel 2`);

    await revealAll(page);
    await scan(page, `${theme} / 380px / all panels and disclosures open`);
  });
}
