import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

async function establish(page: Page) {
  await page.goto('.');
  await page.locator('#tab-2').click();
  await page.locator('#keygen-btn').click();
  await expect(page.locator('#keygen-output .output-section')).toBeVisible();
  await page.locator('#tab-3').click();
  // The reduced simulation explicitly has a nonzero DFR. Seek a genuine
  // nominal success; never fabricate a key or bypass a decoder failure.
  for (let trial = 0; trial < 5; trial++) {
    await page.locator('#encap-btn').click();
    await expect(page.locator('#decap-btn')).toBeEnabled();
    await page.locator('#decap-btn').click();
    await expect(page.locator('#decap-btn')).toBeEnabled();
    if (await page.locator('#kem-match .match-success').isVisible()) break;
  }
  await expect(page.locator('#kem-match .match-success')).toBeVisible();
  await expect(page.locator('#aes-section')).toBeVisible();
  await page.locator('#aes-plaintext').fill('verified current KEM');
  await page.locator('#aes-encrypt-btn').click();
  await expect(page.locator('#aes-output .decrypted-text')).toContainText('verified current KEM');
}

async function unavailable(page: Page) {
  await expect(page.locator('#aes-prereq')).toBeVisible();
  await expect(page.locator('#aes-section')).toBeHidden();
  await expect(page.locator('#aes-encrypt-btn')).toBeDisabled();
  await expect(page.locator('#aes-output')).toBeEmpty();
}

for (const width of [1366, 390]) {
  test(`new failed KEM invalidates the prior AES success at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await establish(page);
    await page.locator('#encap-weight').fill('40');
    await page.locator('#encap-weight').dispatchEvent('input');
    await page.locator('#encap-btn').click();
    await expect(page.locator('#decap-btn')).toBeEnabled();
    await unavailable(page);
    await page.locator('#decap-btn').click();
    await expect(page.locator('#kem-match .match-failure')).toBeVisible();
    await unavailable(page);
    // A programmatic input event cannot bypass the disabled-button guard.
    await page.locator('#aes-plaintext').evaluate(input => {
      (input as HTMLInputElement).value = 'must not use the old key';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await expect(page.locator('#aes-output')).toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('starting a new keypair invalidates ciphertext, decoder and AES state', async ({ page }) => {
  await establish(page);
  await page.locator('#tab-2').click();
  await page.locator('#keygen-btn').click();
  await expect(page.locator('#keygen-output .output-section')).toBeVisible();
  await page.locator('#tab-3').click();
  await expect(page.locator('#encap-output')).toBeEmpty();
  await expect(page.locator('#decap-output')).toBeEmpty();
  await expect(page.locator('#kem-match')).toBeHidden();
  await expect(page.locator('#decap-btn')).toBeDisabled();
  await unavailable(page);
});

test('an old asynchronous AES result cannot repaint after a new encapsulation', async ({ page }) => {
  await establish(page);
  await page.evaluate(() => {
    const original = crypto.subtle.encrypt.bind(crypto.subtle);
    const fixture = { entered: false, release: () => {} };
    Object.assign(window, { kemAesFixture: fixture });
    crypto.subtle.encrypt = async (...args: Parameters<SubtleCrypto['encrypt']>) => {
      fixture.entered = true;
      await new Promise<void>(resolve => { fixture.release = resolve; });
      return original(...args);
    };
  });
  await page.locator('#aes-plaintext').fill('stale pending result');
  await page.locator('#aes-encrypt-btn').click();
  await page.waitForFunction(() => (window as unknown as { kemAesFixture: { entered: boolean } }).kemAesFixture.entered);
  await page.locator('#encap-btn').click();
  await expect(page.locator('#decap-btn')).toBeEnabled();
  await page.evaluate(() => (window as unknown as { kemAesFixture: { release(): void } }).kemAesFixture.release());
  await expect(page.locator('#aes-encrypt-btn')).toHaveText('Encrypt');
  await unavailable(page);
});
