import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate for the DYNAMIC teaching visualizations.
 *
 * a11y.spec.ts scans the page in its initial state, but the trapdoor key
 * visualization (Panel 2) and the Black-Gray-Flip decoder visualization
 * (Panel 3) are rendered only after the user runs keygen / encap / decap. This
 * spec drives that real flow in both themes and scans the resulting content, so
 * the interactive visuals are held to the same WCAG 2.1 AA bar as static markup.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function driveFlow(page: Page): Promise<void> {
  // Panel 2 — generate a keypair; the sparse-vs-dense trapdoor viz appears.
  await page.locator('#tab-2').click();
  await page.locator('#keygen-btn').click();
  await expect(page.locator('#keyviz')).toBeVisible();

  // Panel 3 — encapsulate then decapsulate; the BGF decoder viz appears with
  // at least one real iteration frame (the decoder always runs ≥1 iteration).
  await page.locator('#tab-3').click();
  await page.locator('#encap-btn').click();
  await expect(page.locator('#decap-btn')).toBeEnabled();
  await page.locator('#decap-btn').click();
  await expect(page.locator('#decoder-viz-wrap')).toBeVisible();
  await expect(page.locator('.dv-frame')).toBeVisible();
}

async function scan(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.panel, .panel.active { animation: none !important; opacity: 1 !important; }';
    document.head.appendChild(style);
    for (const p of document.querySelectorAll('.panel')) {
      p.classList.add('active');
      p.removeAttribute('hidden');
    }
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
  });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 6),
  }));
  expect(summary).toEqual([]);
}

test('dynamic visualizations: no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await driveFlow(page);
  await scan(page);
});

test('dynamic visualizations: no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await driveFlow(page);
  await scan(page);
});
