import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/apiAuth';
import { sendEmail, getEmailSendOptionsFromHeaders } from '@/lib/email';

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

async function handleRequest(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Auth: accept either a valid CRON_SECRET (for scheduled jobs) or an admin session.
    const hasCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
    if (!hasCronSecret) {
      // Fall back to checking a Supabase admin session.
      const authz = await requireRole(['admin']);
      if ('error' in authz) {
        return authz.error;
      }
    }

    let eventId: string | null = null;
    try {
      if (req.method === 'POST') {
        const body = (await req.json()) as { eventId?: string };
        eventId = body.eventId ?? null;
      }
    } catch {
      // No body or invalid JSON — eventId stays null.
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Get Automation Settings
    const { data: settings } = await supabase
      .from('feedback_automation_settings')
      .select('*')
      .single();

    if (!settings && !eventId) {
      return NextResponse.json({ error: 'Automation settings not found' }, { status: 404 });
    }

    // 2. Identify Events to notify
    let eventsToNotify = [];
    if (eventId) {
      // Manual override for specific event
      const { data: event } = await supabase
        .from('training_events')
        .select('*, courses(name)')
        .eq('id', eventId)
        .single();
      if (event) eventsToNotify = [event];
    } else {
      // Automatic check based on time (if enabled)
      if (!settings.is_enabled) {
        return NextResponse.json({ message: 'Automation is disabled' });
      }

      // Logic: end_time is approximately now + minutes_before_end
      // Since end_time is a TIME string (HH:MM:SS), we need to compare with current time
      const now = new Date();
      const targetTime = new Date(now.getTime() + (settings.minutes_before_end * 60000));
      const targetTimeStr = targetTime.toTimeString().split(' ')[0]; // HH:MM:SS
      
      // We'll look for events ending in a 10-minute window around the target time
      // to account for various run frequencies.
      const windowStart = new Date(targetTime.getTime() - (5 * 60000)).toTimeString().split(' ')[0];
      const windowEnd = new Date(targetTime.getTime() + (5 * 60000)).toTimeString().split(' ')[0];
      const todayStr = now.toISOString().split('T')[0];

      const { data: events } = await supabase
        .from('training_events')
        .select('*, courses(name)')
        .eq('event_date', todayStr)
        .is('feedback_sent_at', null)
        .gte('end_time', windowStart)
        .lte('end_time', windowEnd);
      
      eventsToNotify = events || [];
    }

    if (eventsToNotify.length === 0) {
      return NextResponse.json({ message: 'No events found to notify', count: 0 });
    }

    let totalSent = 0;
    const emailOptions = getEmailSendOptionsFromHeaders(
      req.headers.get('x-email-test-mode'),
      req.headers.get('x-test-email-address')
    );

    for (const event of eventsToNotify) {
      // 3. Get Participants - ONLY those marked as present
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*, profiles(email, name)')
        .eq('event_id', event.id)
        .not('attended_at', 'is', null);

      if (!bookings || bookings.length === 0) continue;

      const courseName = event.courses?.name || 'Training Course';
      const eventDate = event.event_date;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://training-portal.vercel.app'; // Fallback
      
      for (const booking of bookings) {
        const staffEmail = booking.profiles?.email;
        const staffName = booking.profiles?.name || 'Staff Member';

        if (!staffEmail) continue;

        // 4. Construct Feedback Link
        const feedbackLink = `${baseUrl}/feedback?event=${event.id}&course=${encodeURIComponent(courseName)}&date=${eventDate}`;

        // 5. Build Email Content from template
        const subject = (settings?.email_subject || 'Feedback for {{course_name}}')
          .replace(/{{course_name}}/g, courseName);
        
        const body = (settings?.email_body || 'Hi {{staff_name}},\n\n...')
          .replace(/{{staff_name}}/g, staffName)
          .replace(/{{course_name}}/g, courseName)
          .replace(/{{feedback_link}}/g, feedbackLink);

        // Convert newlines to <br> for HTML email
        const html = `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #dbeafe; border-radius: 10px; background-color: #f8fafc;">
            ${body.replace(/\n/g, '<br>')}
            <div style="margin: 25px 0;">
              <a href="${feedbackLink}" style="background-color: #ec4899; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
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

      // 6. Mark as sent
      await supabase
        .from('training_events')
        .update({ feedback_sent_at: new Date().toISOString() })
        .eq('id', event.id);
    }

    return NextResponse.json({ 
      message: `Successfully processed ${eventsToNotify.length} events`, 
      count: totalSent 
    });

  } catch (err: any) {
    console.error('Automation error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
