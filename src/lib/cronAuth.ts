import { createHash, timingSafeEqual } from 'node:crypto';

export function getCronSecrets(): string[] {
  const rawList = process.env.CRON_SECRET_LIST ?? '';
  const legacy = [process.env.CRON_SECRET, process.env.CRON_SECRET_DEV, process.env.CRON_SECRET_PREVIEW]
    .filter(Boolean)
    .join(',');
  const combined = [rawList, legacy].filter(Boolean).join(',');
  return combined
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Compare SHA-256 digests in constant time so response timing cannot reveal
// how much of a guessed secret matched. Hashing first gives equal lengths.
function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

export function isAuthorizedCronHeader(header: string | null | undefined): boolean {
  if (!header) return false;
  const secret = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!secret) return false;
  const secrets = getCronSecrets();
  // Check every configured secret (no early exit) to keep timing uniform.
  let matched = false;
  for (const candidate of secrets) {
    if (safeEqual(secret, candidate)) matched = true;
  }
  return matched;
}

export function hasAnyCronSecretConfigured(): boolean {
  return getCronSecrets().length > 0;
}
