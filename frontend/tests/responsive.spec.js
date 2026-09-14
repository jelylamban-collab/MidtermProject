import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const API = 'http://127.0.0.1:8010';
const widths = [1440, 1280, 1024, 768, 425, 375, 320];
let admin, customer, concert, venue, ticket, selection;

async function api(request, path, auth, data, method = 'GET') {
  const response = await request.fetch(`${API}${path}`, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth.access_token}` } : {},
    ...(data ? { data } : {}),
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

test.beforeAll(async ({ request }) => {
  admin = await api(request, '/auth/login', null, { email: 'ui-admin@example.com', password: 'ResponsiveTest123!' }, 'POST');
  const email = `responsive-${randomUUID()}@example.com`;
  await api(request, '/auth/register', null, { email, full_name: 'Alexandra Customer With A Long Family Name', password: 'ResponsiveTest123!' }, 'POST');
  customer = await api(request, '/auth/login', null, { email, password: 'ResponsiveTest123!' }, 'POST');
  venue = await api(request, '/admin/venues', admin, {
    name: 'Cebu International Concert and Convention Arena', city: 'South Road Properties, Cebu City', rows: 8, seats_per_row: 12,
    tier_seats: [{ name: 'VVIP', seats: 24 }, { name: 'VIP', seats: 24 }, { name: 'General Admission', seats: 48 }],
  }, 'POST');
  const payload = {
    title: 'World Tour Live in Cebu - A Night of Music', artist: 'TicketRush Ensemble', description: 'An evening of live performances with reserved seating at the Cebu International Concert and Convention Arena.',
    poster_url: '/uploads/2533d1b9c91a42b58591a1ca98e7baa7.webp', category: 'Pop', status: 'On Sale', venue_id: venue.id,
    starts_at: new Date(Date.now() + 90 * 86400000).toISOString(), sale_opens_at: new Date(Date.now() - 86400000).toISOString(), sale_closes_at: new Date(Date.now() + 89 * 86400000).toISOString(),
    tier_prices: { VVIP: 6500, VIP: 3800, 'General Admission': 1800 }, rules: [{ title: 'Entry requirements', text: 'Bring your ticket QR code and a valid ID.' }],
  };
  concert = await api(request, '/admin/concerts', admin, payload, 'POST');
  const seats = (await api(request, `/schedules/${concert.schedule_id}/seats`)).seats;
  await api(request, '/holds', customer, { schedule_id: concert.schedule_id, seat_ids: [seats[0].id] }, 'POST');
  await api(request, '/checkout', customer, { schedule_id: concert.schedule_id, seat_ids: [seats[0].id], idempotency_key: randomUUID(), payment_method: 'Simulated Card' }, 'POST');
  ticket = (await api(request, '/tickets', customer))[0];
  selection = { scheduleId: String(concert.schedule_id), selected: [seats[1].id], seats: [seats[1]], heldAt: Date.now() };
});

async function signIn(page, auth) {
  await page.goto('/login');
  await page.evaluate(({ auth, API, selection }) => {
    if (auth) localStorage.setItem('ticketrush_auth', JSON.stringify({ ...auth, api_url: API }));
    else localStorage.removeItem('ticketrush_auth');
    sessionStorage.setItem('ticketrush_selection', JSON.stringify(selection));
  }, { auth, API, selection });
}

async function inspect(page, name, info) {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main h1')).not.toHaveText(/^Loading$/);
  await expect(page.locator('main')).not.toContainText('Loading...');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  });
  const issues = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`page width ${document.documentElement.scrollWidth} > ${innerWidth}`);
    const selectors = '.page,.field,.data-panel,.ticket-card,.qr-box,.horizontal-bar,.summary-panel,.admin-form,.notification-item,.tier-card,.event-copy,.concert-card,.admin-concert-card,.confirm-dialog';
    for (const node of document.querySelectorAll(selectors)) {
      if (!node.getClientRects().length) continue;
      const r = node.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) issues.push(`${node.className} outside viewport: ${Math.round(r.left)}..${Math.round(r.right)}`);
      if (!node.matches('input, select, textarea') && node.scrollWidth > node.clientWidth + 2 && !['auto', 'scroll'].includes(getComputedStyle(node).overflowX)) issues.push(`${node.className} internal overflow ${node.scrollWidth}/${node.clientWidth}`);
    }
    for (const node of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
      if (!node.getClientRects().length) continue;
      if (!node.labels?.length && !node.getAttribute('aria-label')) issues.push(`unlabelled ${node.tagName}: ${node.placeholder}`);
    }
    return issues;
  });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  expect.soft(issues, name).toEqual([]);
  await expect.soft(page.locator('body')).not.toContainText('[object Object]');
}

async function waitForReadyPage(page) {
  await page.locator('main h1').waitFor();
  await expect(page.locator('main h1')).not.toHaveText(/^Loading$/);
  await expect(page.locator('main')).not.toContainText('Loading...');
}

for (const width of widths) {
  test(`responsive pages ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await signIn(page, null);
    const guest = ['/', '/concerts', `/concerts/schedule/${concert.schedule_id}`, '/about', '/help', '/login', '/register'];
    for (const [index, path] of guest.entries()) {
      await page.goto(path);
      await waitForReadyPage(page);
      await inspect(page, `guest-${index}`, info);
    }
    await signIn(page, customer);
    const customerPages = ['/concerts', `/concerts/schedule/${concert.schedule_id}`, `/seat-selection/${concert.schedule_id}`, `/checkout/${concert.schedule_id}`, '/cart', '/tickets', `/tickets/${ticket.id}`, '/history', '/notifications', '/profile'];
    for (const [index, path] of customerPages.entries()) {
      await page.goto(path);
      await waitForReadyPage(page);
      await inspect(page, `customer-${index}`, info);
    }
    for (const tab of ['Personal', 'Security', 'History', 'Tickets']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await inspect(page, `profile-${tab}`, info);
    }
    await signIn(page, admin);
    const adminPages = ['/admin', '/admin/concerts', `/admin/concerts/view/${concert.schedule_id}`, '/admin/concerts/new', `/admin/concerts/${concert.id}/edit`, '/admin/venues', '/admin/venues/new', `/admin/venues/${venue.id}/edit`, `/admin/venues/${venue.id}/seating`, '/admin/reservations', '/admin/transactions', '/admin/customers', '/admin/archive', '/admin/reports', '/admin/profile'];
    for (const [index, path] of adminPages.entries()) {
      await page.goto(path);
      await waitForReadyPage(page);
      await inspect(page, `admin-${index}`, info);
    }
    await page.goto(`/admin/concerts/${concert.id}/edit`);
    await expect(page.getByLabel('Concert title', { exact: true })).not.toHaveValue('');
    for (const step of ['Venue and Schedule', 'Pricing', 'Policies', 'Review']) {
      await page.getByRole('button', { name: new RegExp(step) }).click();
      await expect(page.locator('[aria-current="step"]')).toContainText(step);
      if (step === 'Pricing') {
        for (const input of await page.getByLabel('Concert Price', { exact: true }).all()) await input.fill('2500');
      }
      await inspect(page, `concert-${step.replaceAll(' ', '-')}`, info);
    }
    expect(errors).toEqual([]);
  });
}

test('mobile menu, modal focus, seat purchase and PDF', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await signIn(page, customer);
  await page.goto(`/seat-selection/${concert.schedule_id}`);
  await page.locator('.seat.available:not(:disabled)').first().click();
  await page.getByRole('button', { name: 'Reserve Seats', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await inspect(page, 'reservation-dialog', info);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Reserve Seats', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/checkout/);
  await page.getByRole('button', { name: 'Confirm Purchase', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page).toHaveURL(/confirmation/);
  await page.goto(`/tickets/${ticket.id}`);
  await page.locator('.qr-box canvas').waitFor();
  const pixels = await page.locator('.qr-box canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return { dark: data.some((value, i) => i % 4 === 0 && value < 50), light: data.some((value, i) => i % 4 === 0 && value > 240) };
  });
  expect(pixels).toEqual({ dark: true, light: true });
  const pdf = await request.get(`${API}/tickets/${ticket.id}/pdf`, { headers: { Authorization: `Bearer ${customer.access_token}` } });
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: info.outputPath('ticket-print.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('.nav-links').getByRole('link', { name: 'Purchase History' }).click();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await signIn(page, admin);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.locator('.admin-sidebar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.admin-sidebar')).toBeHidden();
});
