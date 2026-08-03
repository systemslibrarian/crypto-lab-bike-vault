import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Scans the full page in both themes with every
 * collapsible region revealed. This lab uses class-toggled tab panels
 * (.panel + .active, [hidden]) rather than <details>, so we reveal all
 * of them (plus any <details>, just in case) before scanning.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Freeze every animation and transition at its settled value, BEFORE any theme
 * toggling. Tabs, buttons and the toggle itself carry `transition: color /
 * background / border-color 0.2s`, so scanning straight after a theme flip
 * samples a mid-transition blend and reports a colour that exists in neither
 * palette — that produced a phantom `color-contrast` failure on `#tab-1` which
 * vanished entirely once the page was allowed to settle. Zeroing the durations
 * makes elements land instantly on the exact colours a user sees when the flip
 * completes: it changes no computed colour, so it hides no real violation, it
 * only removes the sampling race.
 */
async function freezeMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{
      animation-duration:0s!important;animation-delay:0s!important;
      transition-duration:0s!important;transition-delay:0s!important;}`,
  });
}

async function revealAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Expand any native disclosure widgets.
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
    // The .panel.active reveal animation starts from opacity:0. Neutralize it
    // so panels are scanned in their settled, fully-opaque state (what a user
    // sees after the fade completes) rather than mid-transition.
    const style = document.createElement('style');
    style.textContent = '.panel, .panel.active { animation: none !important; opacity: 1 !important; }';
    document.head.appendChild(style);
    // Reveal all class-toggled tab panels so hidden content is scanned.
    for (const panel of document.querySelectorAll('.panel')) {
      panel.classList.add('active');
      panel.removeAttribute('hidden');
    }
  });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await freezeMotion(page);
  await revealAll(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await freezeMotion(page);
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await revealAll(page);
  await scan(page);
});
