import { chromium } from 'playwright';
const URL = 'http://localhost:5173';

async function primeSettings(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'panini-settings',
      JSON.stringify({ state: { theme: 'light', language: 'es', haptics: false, stickerView: 'grid', activeCollectionId: null, showImages: true, defaultCollectionSeeded: true }, version: 1 })
    );
  });
}
async function goto(page, hash = '/') { await page.goto(`${URL}/#${hash}`); await page.getByRole('banner').waitFor(); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await primeSettings(page);
await page.goto(URL);
await page.getByRole('banner').waitFor();
await goto(page, '/collections');
await page.waitForTimeout(1000);
const wcRow = page.locator('.card', { hasText: 'FIFA World Cup 2026' }).first();
const wcBtn = wcRow.getByRole('button', { name: /Install|Instalar/i });
if (await wcBtn.count() > 0) {
  await wcBtn.first().click();
  await page.getByText(/Selected|Seleccionado/i).first().waitFor({ timeout: 10000 }).catch(() => {});
}
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('panini-settings') || '{}');
  if (s?.state) s.state.activeCollectionId = 'worldcup-2026';
  localStorage.setItem('panini-settings', JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(1000);
await goto(page, '/stickers');
const cards = await page.getByTestId('sticker-card').all();
for (let i = 0; i < 8 && i < cards.length; i++) {
  const inc = cards[i].getByRole('button', { name: 'increment' });
  await inc.click();
}
await goto(page, '/exchange');
await page.waitForTimeout(1500);
const footer = page.getByTestId('exchange-actions-footer');
const box = await footer.boundingBox();
console.log('footer box (initial):', JSON.stringify(box));
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(500);
const box2 = await footer.boundingBox();
console.log('footer box (scrolled 500):', JSON.stringify(box2));
await page.screenshot({ path: '/tmp/exchange-sticky.png', fullPage: false });
await browser.close();
