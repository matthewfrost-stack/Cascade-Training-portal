import { NextRequest, NextResponse } from 'next/server';
import { currentSchema, requireRole } from '@/lib/apiAuth';
import { CERTIFICATE_BUCKET, canManagePerson, isTrackedQualification } from '@/lib/qualificationAccess';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const NOT_READY = 'Certificate uploads need the database update first. Run the migration 20261118210000_qualification_evidence.sql in the Supabase SQL Editor.';

/**
 * Certificates for the qualification trackers, kept in a private store.
 *   POST  { profileId, qualification, fileName, contentType, size } -> one-time upload link
 *         (the browser uploads straight to storage: Vercel caps request bodies at ~4.5 MB)
 *   PATCH { profileId, qualification, path, fileName }                -> record the uploaded file
 *   GET   ?profileId=…&qualification=…                               -> a link valid for 2 minutes
 * Only people who can see that person (same homes) can do any of these.
 */
type Body = { profileId?: unknown; qualification?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown; path?: unknown };

async function checkAccess(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return { response: authz.error } as const;
  const body = ((await request.json().catch(() => null)) || {}) as Body;
  const profileId = String(body.profileId || '');
  const qualification = body.qualification;
  if (!UUID.test(profileId) || !isTrackedQualification(qualification)) {
    return { response: NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) } as const;
  }
  if (!(await canManagePerson(authz.service, { userId: authz.userId, role: authz.role }, profileId, qualification))) {
    return { response: NextResponse.json({ error: 'You can only add certificates for people at your homes.' }, { status: 403 }) } as const;
  }
  return { authz, body, profileId, qualification, folder: `${currentSchema()}/${profileId}/${qualification}/` } as const;
}

export async function POST(request: NextRequest) {
  const checked = await checkAccess(request);
  if ('response' in checked) return checked.response;
  const { authz, body, folder } = checked;

  const ext = TYPES[String(body.contentType || '')];
  if (!ext) return NextResponse.json({ error: 'Upload a PDF or a photo (JPG, PNG, HEIC).' }, { status: 400 });
  if (!(Number(body.size) > 0)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  if (Number(body.size) > MAX_BYTES) return NextResponse.json({ error: 'The file is too big (10 MB max).' }, { status: 400 });

  const path = `${folder}${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { data, error } = await authz.service.storage.from(CERTIFICATE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Certificate upload link failed:', error);
    const missingBucket = /bucket not found|not found/i.test(error?.message || '');
    return NextResponse.json({ error: missingBucket ? NOT_READY : 'Could not start the upload.' }, { status: missingBucket ? 503 : 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token, bucket: CERTIFICATE_BUCKET });
}

export async function PATCH(request: NextRequest) {
  const checked = await checkAccess(request);
  if ('response' in checked) return checked.response;
  const { authz, body, profileId, qualification, folder } = checked;
  const { service, userId } = authz;

  // Only a file uploaded into this person's own folder can be recorded.
  const path = String(body.path || '');
  if (!path.startsWith(folder) || path.includes('..')) return NextResponse.json({ error: 'Invalid file.' }, { status: 400 });
  const fileName = path.slice(folder.length);
  const { data: listed } = await service.storage.from(CERTIFICATE_BUCKET).list(folder.slice(0, -1), { search: fileName });
  if (!listed?.some((f) => f.name === fileName)) return NextResponse.json({ error: 'The upload did not finish. Please try again.' }, { status: 400 });

  const { data: existing, error: readError } = await service
    .from('staff_qualifications')
    .select('id, certificate_path')
    .eq('profile_id', profileId)
    .eq('qualification', qualification)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: /certificate_path/.test(readError.message || '') ? NOT_READY : 'Could not save the certificate.' }, { status: 503 });

  const ext = fileName.split('.').pop() || 'pdf';
  const name = String(body.fileName || '').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || `certificate.${ext}`;
  const values = { certificate_path: path, certificate_name: name, updated_by: userId, updated_at: new Date().toISOString() };
  const { error: saveError } = existing
    ? await service.from('staff_qualifications').update(values).eq('id', existing.id)
    : await service.from('staff_qualifications').insert({ profile_id: profileId, qualification, ...values });
  if (saveError) {
    await service.storage.from(CERTIFICATE_BUCKET).remove([path]);
    console.error('Certificate record failed:', saveError);
    return NextResponse.json({ error: 'Could not save the certificate.' }, { status: 500 });
  }
  // The old file is no longer needed once the new one is recorded.
  if (existing?.certificate_path && existing.certificate_path !== path) {
    await service.storage.from(CERTIFICATE_BUCKET).remove([existing.certificate_path]);
  }
  return NextResponse.json({ ok: true, certificateName: name });
}

export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const params = new URL(request.url).searchParams;
  const profileId = params.get('profileId') || '';
  const qualification = params.get('qualification');
  if (!UUID.test(profileId) || !isTrackedQualification(qualification)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!(await canManagePerson(service, { userId, role }, profileId, qualification))) {
    return NextResponse.json({ error: 'You can only see certificates for people at your homes.' }, { status: 403 });
  }

  const { data } = await service
    .from('staff_qualifications')
    .select('certificate_path')
    .eq('profile_id', profileId)
    .eq('qualification', qualification)
    .maybeSingle();
  if (!data?.certificate_path) return NextResponse.json({ error: 'No certificate on file.' }, { status: 404 });

  const { data: signed, error } = await service.storage.from(CERTIFICATE_BUCKET).createSignedUrl(data.certificate_path, 120);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: 'Could not open the certificate.' }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl });
}
