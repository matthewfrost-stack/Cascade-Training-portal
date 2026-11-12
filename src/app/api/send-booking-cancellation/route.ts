import { NextRequest, NextResponse } from 'next/server';
import { getEmailSendOptionsFromHeaders, sendBookingCancellationEmail } from '@/lib/email';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

type TrainingEventWithCourse = {
  event_date: string;
  courses: { name?: string | null } | null;
};

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler']);
    if ('error' in authz) return authz.error;

    const { staffId, eventId, reason } = await request.json();
    console.log('Booking cancellation request:', { staffId, eventId, reason });

    const supabase = createServiceClient();

    // Get staff details
    const { data: staff } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', staffId)
      .single();

    if (!staff?.email) {
      console.error('Staff email not found for staffId:', staffId);
      return NextResponse.json({ error: 'Staff email not found' }, { status: 404 });
    }

    console.log('Staff found:', { email: staff.email, name: staff.full_name });

    // Get event details
    const { data: event } = await supabase
      .from('training_events')
      .select('event_date, courses(name)')
      .eq('id', eventId)
      .single<TrainingEventWithCourse>();

    if (!event) {
      console.error('Event not found for eventId:', eventId);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    console.log('Event found:', { date: event.event_date, course: event.courses?.name });

    const emailOptions = getEmailSendOptionsFromHeaders(
      request.headers.get('x-email-test-mode'),
      request.headers.get('x-test-email-address')
    );

    // Send email
    console.log('Sending cancellation email to:', staff.email);
    const success = await sendBookingCancellationEmail(
      staff.email,
      staff.full_name || 'Staff Member',
      event.courses?.name || 'Unknown Course',
      event.event_date,
      reason,
      emailOptions
    );

    console.log('Email send result:', success);

    if (!success) {
      console.error('Cancellation email failed to send');
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Cancellation email sent' });
  } catch (error) {
    console.error('Email API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
