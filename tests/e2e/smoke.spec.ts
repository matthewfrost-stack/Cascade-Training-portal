import { expect, test } from '@playwright/test';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/admin',
  '/admin/archive',
  '/automation-control',
  '/apps/booking-calendar',
  '/apps/expiry-checker',
  '/apps/training-course-checker',
  '/training-matrix',
  '/feedback',
  '/feedback/results',
];

test('login page renders', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Cascade Portal' })).toBeVisible();
});

test('security headers are present', async ({ request }) => {
  const response = await request.get('/login');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test.describe('unauthenticated redirects', () => {
  for (const path of PROTECTED_ROUTES) {
    test(`${path} redirects to /login`, async ({ page }) => {
      const response = await page.goto(path);
      // Middleware redirects typically return 307/302.
      expect([200, 302, 303, 307, 308]).toContain(response?.status() ?? 0);
      await page.waitForURL('**/login', { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Cascade Portal' })).toBeVisible();
    });
  }
});

test.describe('unauthenticated API protection', () => {
  test('/api/schedule-feedback-emails is protected', async ({ request }) => {
    const res = await request.get('/api/schedule-feedback-emails');
    expect([401, 403]).toContain(res.status());
  });

  test('/api/email-logs is protected', async ({ request }) => {
    const res = await request.get('/api/email-logs');
    expect([401, 403]).toContain(res.status());
  });
});

