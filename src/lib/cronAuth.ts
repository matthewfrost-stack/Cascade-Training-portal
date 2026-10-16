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

export function isAuthorizedCronHeader(header: string | null | undefined): boolean {
  if (!header) return false;
  const secret = header.startsWith('Bearer ') ? header.slice(7) : header;
  const secrets = getCronSecrets();
  return secrets.includes(secret);
}

export function hasAnyCronSecretConfigured(): boolean {
  return getCronSecrets().length > 0;
}
