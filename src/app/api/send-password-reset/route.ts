import { NextRequest, NextResponse } from 'next/server';
import { getEmailSendOptionsFromHeaders, sendPasswordResetEmail } from '@/lib/email';
import { createServiceClient, requireRole } from '@/lib/apiAuth';
import { createPasswordSetupLink } from '@/lib/passwordLinks';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const { email, staffName } = await request.json();
    const emailOptions = getEmailSendOptionsFromHeaders(
      request.headers.get('x-email-test-mode'),
      request.headers.get('x-test-email-address')
    );

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Initialize Supabase with service role key for backend operations
    const supabase = createServiceClient();

    // One-time link to /auth/confirm, which signs the person in and takes
    // them to the "choose a new password" form.
    const linkResult = await createPasswordSetupLink(supabase, email);
    if (linkResult.error !== undefined) {
      console.error('Password link generation error:', linkResult.error);
      return NextResponse.json({ error: linkResult.error }, { status: 500 });
    }
    const resetLink = linkResult.link;

    // Send professional email with link
    const success = await sendPasswordResetEmail(
      email,
      staffName || 'Staff Member',
      resetLink,
      emailOptions,
      'reset'
    );

    if (!success) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Password setup link sent to ${email}` 
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
