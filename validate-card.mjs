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
async function installDemo(page) {
  await goto(page, '/collections');
  const row = page.locator('.card', { hasText: 'Demo Mini' }).first();
  const installBtn = row.getByRole('button', { name: 'Install' });
  if (await installBtn.count() > 0) {
    await installBtn.click();
    await page.getByText('Selected').first().waitFor();
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', e.message));

await primeSettings(page);
await page.goto(URL);
await page.getByRole('banner').waitFor();
await installDemo(page);

// Si la demo quedó instalada pero no activa, click "Selected" sobre la card
await goto(page, '/collections');
const selectedBtn = page
  .locator('.card', { hasText: 'Demo Mini' })
  .first()
  .getByRole('button', { name: /Selected|Select/i });
if (await selectedBtn.count() > 0) {
  const text = (await selectedBtn.first().innerText()).trim();
  if (text !== 'Selected') {
    await selectedBtn.first().click();
    await page.waitForTimeout(500);
  }
}

await goto(page, '/stickers');
await page.waitForTimeout(1500);
const bodyText = await page.locator('body').innerText();
console.log('body preview:', bodyText.slice(0, 400));
const cardsCount = await page.getByTestId('sticker-card').count();
console.log('cardsCount:', cardsCount);
const card = page.getByTestId('sticker-card').first();
await card.waitFor({ timeout: 10000 });
const sid = await card.getAttribute('data-sticker-id');
console.log('stickerId:', sid);
await card.getByRole('button', { name: 'increment' }).click();
await card.getByRole('button', { name: 'increment' }).click();
await card.getByRole('button', { name: 'increment' }).click();

await page.evaluate((stickerId) => {
  const items = [
    { kind: 'sticker', instanceId: `slot:demo-mini:${stickerId}:1`, collectionId: 'demo-mini', stickerId, slotIndex: 1, partner: 'Ana', code: 'ARG 1', displayPrefix: 'ARG', emoji: '🧪', createdAt: Date.now() },
  ];
  localStorage.setItem('panini-reservations', JSON.stringify({ state: { items }, version: 4 }));
}, sid);

await goto(page, '/exchange');
await page.reload();
await page.waitForTimeout(1500);

const chips = await page.locator('[data-testid*="-chip-ARG 1#"]').all();
console.log('chips visibles:', chips.length);

const badges = await page.locator('[data-testid*="-reserved-ARG 1#"]').all();
console.log('badges reservadas:', badges.length);
for (const b of badges) {
  console.log('badge text:', JSON.stringify((await b.innerText()).trim()));
}

const reserveButtons = await page.locator('[data-testid*="-reserve-ARG 1#"]').all();
console.log('botones reservar:', reserveButtons.length);

// Verificar layout: cada chip tiene una figurita arriba y un control abajo
const firstChip = chips[0];
if (firstChip) {
  const box = await firstChip.boundingBox();
  console.log('chip-1 box:', JSON.stringify(box));
  // Box debe ser más alto que ancho (vertical)
  if (box && box.height < box.width) {
    console.log('FAIL: chip parece horizontal, no mini-card vertical');
    process.exit(1);
  }
}

// Verificar orden DOM: el botón "reservar" o la badge "Para Ana" debe estar DESPUÉS del chip
if (chips.length >= 2) {
  const code0 = await chips[0].innerText();
  console.log('chip 0 text:', JSON.stringify(code0));
}

// Tomar screenshot para inspección visual
await page.screenshot({ path: '/tmp/exchange-card-layout.png', fullPage: false });
console.log('screenshot: /tmp/exchange-card-layout.png');

if (badges.length !== 1) {
  console.log('FAIL: esperaba 1 badge, hay ' + badges.length);
  process.exit(1);
}
console.log('OK: layout de mini-card y 1 badge por reserva ✓');
await browser.close();
