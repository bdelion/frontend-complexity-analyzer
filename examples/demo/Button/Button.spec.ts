import { test, expect } from '@playwright/test';

test('parcours synthétique', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button')).toBeFocused();
});
