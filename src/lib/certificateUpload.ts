'use client';

import { supabase } from '@/lib/supabase';
import type { TrackedQualification } from '@/lib/qualificationAccess';

async function json(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

/** Uploads a certificate straight to the private store (via a one-time link) and records it. Returns the saved file name. */
export async function uploadCertificate(profileId: string, qualification: TrackedQualification, file: File): Promise<string> {
  const contentType = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.(heic|heif)$/i.test(file.name) ? 'image/heic' : '');
  const start = await json(await fetch('/api/qualification-certificates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, qualification, fileName: file.name, contentType, size: file.size }),
  }));
  const { error } = await supabase.storage.from(start.bucket).uploadToSignedUrl(start.path, start.token, file, { contentType });
  if (error) throw new Error('The upload failed. Please try again.');
  const done = await json(await fetch('/api/qualification-certificates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, qualification, path: start.path, fileName: file.name }),
  }));
  return done.certificateName as string;
}

/** Opens the certificate in a new tab (the link only works for 2 minutes). */
export async function openCertificate(profileId: string, qualification: TrackedQualification) {
  const tab = window.open('', '_blank'); // open first so pop-up blockers allow it
  try {
    const { url } = await json(await fetch(`/api/qualification-certificates?profileId=${profileId}&qualification=${qualification}`));
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    alert(e instanceof Error ? e.message : 'Could not open the certificate.');
  }
}
