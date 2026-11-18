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
  test('/api/feedback/results is protected', async ({ request }) => {
    const res = await request.get('/api/feedback/results');
    expect([401, 403]).toContain(res.status());
  });

  test('/api/feedback is protected', async ({ request }) => {
    const res = await request.get('/api/feedback');
    expect([401, 403]).toContain(res.status());
  });

  test('/api/automations/feedback-emails is protected', async ({ request }) => {
    const res = await request.post('/api/automations/feedback-emails', { data: { eventId: '00000000-0000-0000-0000-000000000000' } });
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

test.describe('password reset journey', () => {
  test('login page links to forgotten password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgotten your password?' }).click();
    await page.waitForURL('**/auth/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgotten your password?' })).toBeVisible();
  });

  test('forgot-password gives the same reply for any valid address', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Email address').fill('nobody@example.invalid');
    await page.getByRole('button', { name: 'Email me a reset link' }).click();
    await expect(page.getByText('If nobody@example.invalid belongs to a Cascade Portal account')).toBeVisible();
  });

  test('forgot-password API rejects an invalid address', async ({ request }) => {
    const res = await request.post('/api/auth/forgot-password', { data: { email: 'not-an-email' } });
    expect(res.status()).toBe(400);
  });

  test('confirm page without a token offers a new link', async ({ page }) => {
    await page.goto('/auth/confirm');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new password email' })).toBeVisible();
  });

  test('confirm page waits for a click before using the token', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=not-a-real-token&type=recovery');
    await expect(page.getByRole('button', { name: 'Set my password' })).toBeVisible();
    await page.getByRole('button', { name: 'Set my password' }).click();
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });

  test('set-password without a session explains what to do', async ({ page }) => {
    await page.goto('/auth/set-password');
    await expect(page.getByText('This page needs a valid password link.')).toBeVisible();
  });

  test('old-style emailed links land on the forgot-password page', async ({ page }) => {
    await page.goto('/auth/callback');
    await page.waitForURL('**/auth/forgot-password?expired=1');
    await expect(page.getByText('That password link has expired')).toBeVisible();
  });
});
