import { expect, test, type Page } from '@playwright/test';
import { boot, revealAll, scan } from './gate';

/**
 * WCAG regression gate — the states the page only reaches after you use it.
 *
 * The state gap is where this lab's real defects were. First paint was clean;
 * what was never scanned was the tamper warning that only appears once the
 * error weight is pushed past t (2.93:1 in light theme), and the decrypted
 * plaintext that only exists after a successful decap plus an AES encrypt
 * (4.37:1 on its own success tint). Neither is reachable without driving the
 * flow, so neither had ever been measured.
 *
 * Each state below is driven for real — the buttons are clicked, the decoder
 * genuinely runs — and each scan asserts the content it intends to look at is
 * on the page before axe sees it.
 */

test.describe.configure({ timeout: 180_000 });

/** Panel 2 — generate a keypair; the sparse-vs-dense trapdoor viz appears. */
async function keygen(page: Page): Promise<void> {
  await page.locator('#tab-2').click();
  await page.locator('#keygen-btn').click();
  await expect(page.locator('#keyviz')).toBeVisible();
  await expect(page.locator('#keyviz .kv-grid').first()).toBeVisible();
  await expect(page.locator('#keygen-output .output-section')).toBeVisible();
}

/** Panel 3 — encapsulate then decapsulate at the current error weight. */
async function encapDecap(page: Page): Promise<void> {
  await page.locator('#tab-3').click();
  await page.locator('#encap-btn').click();
  await expect(page.locator('#encap-output .output-section')).toBeVisible();
  await expect(page.locator('#decap-btn')).toBeEnabled();
  await page.locator('#decap-btn').click();
  await expect(page.locator('#decoder-viz-wrap')).toBeVisible();
  // The decoder always runs at least one iteration, so a frame must exist.
  await expect(page.locator('.dv-frame').first()).toBeVisible();
  await expect(page.locator('#decap-output .output-section')).toBeVisible();
  await expect(page.locator('#kem-match')).toBeVisible();
}

for (const theme of ['dark', 'light'] as const) {
  test(`driven states: no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    await boot(page, theme);

    // --- Panel 1: parity result, then the error branch. ---
    await page.locator('#tab-1').click();
    await page.locator('#parity-input').fill('1011');
    await page.locator('#parity-encode-btn').click();
    await expect(page.locator('#parity-output .parity-steps')).toBeVisible();
    await scan(page, `${theme} / parity result`);

    await page.locator('#parity-input').fill('99');
    await page.locator('#parity-encode-btn').click();
    await expect(page.locator('#parity-output .error-text')).toBeVisible();
    await scan(page, `${theme} / parity input error`);

    // --- Panel 2: keygen output plus the trapdoor visualization. ---
    await keygen(page);
    await scan(page, `${theme} / keygen result`);

    // --- Panel 3: a successful KEM round trip and its verdict. ---
    await encapDecap(page);
    await expect(page.locator('#kem-match .match-success')).toBeVisible();
    await scan(page, `${theme} / decap success verdict`);

    // --- The AES section only exists once the secrets matched. ---
    await expect(page.locator('#aes-section')).toBeVisible();
    await page.locator('#aes-plaintext').fill('hello bike');
    await page.locator('#aes-encrypt-btn').click();
    await expect(page.locator('#aes-output .decrypted-text')).toBeVisible();
    await scan(page, `${theme} / aes end-to-end result`);

    await page.locator('#aes-plaintext').fill('');
    await page.locator('#aes-encrypt-btn').click();
    await expect(page.locator('#aes-output .error-text')).toBeVisible();
    await scan(page, `${theme} / aes empty-input error`);

    // --- The failure regime: push the error weight past what the code can
    //     correct and scan the decoding-failure verdict and its warning. ---
    await page.locator('#encap-weight').fill('30');
    await page.locator('#encap-weight').dispatchEvent('input');
    await expect(page.locator('#encap-weight-warn')).toBeVisible();
    await encapDecap(page);
    await expect(page.locator('#kem-match .match-failure')).toBeVisible();
    await scan(page, `${theme} / decoding-failure verdict`);

    // --- DFR lab: run a real batch so the chart, table and live region exist. ---
    await page.locator('#dfr-weight').fill('30');
    await page.locator('#dfr-weight').dispatchEvent('input');
    await page.locator('#dfr-run').click();
    await expect(page.locator('.dfr-table')).toBeVisible({ timeout: 60_000 });
    // Wait for the batch to finish rather than sampling it mid-run: the button
    // re-enables only when the last trial has landed. Generous by design — on a
    // loaded machine 600 real decodes take a while, and the answer to that is a
    // longer wait, not a smaller scan.
    await expect(page.locator('#dfr-run')).toBeEnabled({ timeout: 120_000 });
    await expect(page.locator('.dfr-live')).not.toBeEmpty();
    await scan(page, `${theme} / dfr lab measured curve`);

    // --- Everything above, re-checked at 380px where things start to scroll. ---
    await page.setViewportSize({ width: 380, height: 720 });
    await revealAll(page);
    await expect(page.locator('#kem-match .match-failure')).toBeVisible();
    await scan(page, `${theme} / 380px, fully driven`);
  });
}
