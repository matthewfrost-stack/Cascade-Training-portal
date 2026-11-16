import type { createServiceClient } from '@/lib/apiAuth';

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Public address of the portal, used in emailed links.
 *
 * Never derived from the request's Host header: on the public
 * forgot-password route an attacker could otherwise make the email link
 * point at their own site and capture a valid sign-in token.
 */
export function getAppBaseUrl(): string {
  // Preview deploys (the dev branch) link back to their own branch URL so
  // testing a reset never lands on the live site.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return 'http://localhost:3000';
}

/**
 * Builds a one-time "set your password" link for an existing login account.
 *
 * The link opens /auth/confirm, which only uses the token when the person
 * presses "Set my password". Email link scanners (e.g. Outlook Safe Links)
 * open links automatically, and Supabase's own verify link would be used up
 * by that visit before the person ever clicked it.
 */
export async function createPasswordSetupLink(
  service: ServiceClient,
  email: string
): Promise<{ link: string; error?: undefined } | { link?: undefined; error: string }> {
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim().toLowerCase(),
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { error: error?.message || 'Could not create a password link' };
  }

  const params = new URLSearchParams({ token_hash: tokenHash, type: 'recovery' });
  return { link: `${getAppBaseUrl()}/auth/confirm?${params.toString()}` };
}
