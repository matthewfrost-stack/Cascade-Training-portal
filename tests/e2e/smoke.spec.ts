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
  expect(response.headers()['strict-transport-security']).toContain('max-age=');
  expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
  const csp = response.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
});

test('login page loads without CSP violations or script errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(text)) problems.push(text);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Cascade Portal' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
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

  // Pages Router route: not covered by requireRole(), checks the session itself.
  test('/api/matrix-headers is protected', async ({ request }) => {
    const res = await request.get('/api/matrix-headers');
    expect(res.status()).toBe(401);
  });

  test('cron endpoints reject a wrong secret', async ({ request }) => {
    const res = await request.get('/api/atlas/sync', { headers: { Authorization: 'Bearer wrong-secret' } });
    expect([401, 403]).toContain(res.status());
  });
});

