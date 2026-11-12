import { NextResponse } from 'next/server';
import { sendEmail, getEmailSendOptionsFromHeaders, escapeHtml } from '@/lib/email';
import { requireRole } from '@/lib/apiAuth';

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

async function handleRequest(req: Request) {
  const auth = await requireRole(['admin']);
  if ('error' in auth) return auth.error;

  try {
    const { service } = auth;

    const { data: settings } = await service
      .from('feedback_automation_settings')
      .select('*')
      .single();

    const minutesBeforeEnd = Number(settings?.minutes_before_end ?? 30);

    const now = new Date();
    const targetTime = new Date(now.getTime() + minutesBeforeEnd * 60000);
    const windowStart = new Date(targetTime.getTime() - 5 * 60000).toTimeString().split(' ')[0];
    const windowEnd = new Date(targetTime.getTime() + 5 * 60000).toTimeString().split(' ')[0];
    const todayStr = now.toISOString().split('T')[0];

    const { data: events } = await service
      .from('training_events')
      .select('*, courses(name)')
      .eq('event_date', todayStr)
      .is('feedback_sent_at', null)
      .gte('end_time', windowStart)
      .lte('end_time', windowEnd);

    const eventsToNotify = events || [];
    if (eventsToNotify.length === 0) {
      return NextResponse.json({ message: 'No events found to notify', count: 0 });
    }

    const emailOptions = getEmailSendOptionsFromHeaders(
      req.headers.get('x-email-test-mode'),
      req.headers.get('x-test-email-address')
    );

    let totalSent = 0;
    for (const event of eventsToNotify) {
      const { data: bookings } = await service
        .from('bookings')
        .select('*, profiles(email, full_name)')
        .eq('event_id', event.id)
        .not('attended_at', 'is', null);

      if (!bookings || bookings.length === 0) continue;

      const courseName = event.courses?.name || 'Training Course';
      const eventDate = event.event_date;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://training-portal.vercel.app';

      for (const booking of bookings) {
        const staffEmail = booking.profiles?.email;
        const staffName = booking.profiles?.full_name || 'Staff Member';
        if (!staffEmail) continue;

        const feedbackLink = `${baseUrl}/feedback?event=${event.id}&course=${encodeURIComponent(courseName)}&date=${eventDate}`;

        const safeStaffName = escapeHtml(staffName);
        const safeCourseName = escapeHtml(courseName);
        const safeFeedbackLink = escapeHtml(feedbackLink);

        const subject = (settings?.email_subject || 'Feedback for {{course_name}}').replace(/{{course_name}}/g, courseName);
        const body = (settings?.email_body || 'Hi {{staff_name}},\n\n...')
          .replace(/{{staff_name}}/g, safeStaffName)
          .replace(/{{course_name}}/g, safeCourseName)
          .replace(/{{feedback_link}}/g, safeFeedbackLink);

        const html = `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #dbeafe; border-radius: 10px; background-color: #f8fafc;">
            ${body.replace(/\n/g, '<br>')}
            <div style="margin: 25px 0;">
              <a href="${safeFeedbackLink}" style="background-color: #ec4899; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Submit Feedback
              </a>
            </div>
            <p style="font-size: 11px; color: #64748b; margin-top: 20px;">
              Training Portal
            </p>
          </div>
        `;

        const success = await sendEmail(staffEmail, subject, html, emailOptions);
        if (success) totalSent++;
      }

      await service
        .from('training_events')
        .update({ feedback_sent_at: new Date().toISOString() })
        .eq('id', event.id);
    }

    return NextResponse.json({
      message: `Successfully processed ${eventsToNotify.length} events`,
      count: totalSent,
      minutesBeforeEnd,
    });
  } catch (err: unknown) {
    console.error('Manual feedback email trigger error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

