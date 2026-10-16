import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

// Create email transporter
const getTransporter = async () => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword || !smtpFrom) {
    throw new Error('SMTP configuration missing');
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: smtpPort === '465',
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });
};

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['scheduler', 'admin']);
    if ('error' in authz) return authz.error;

    const body: EmailRequest = await request.json();
    const { to, subject, html, cc, bcc } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: 'to, subject, and html are required' },
        { status: 400 }
      );
    }

    const transporter = await getTransporter();
    const smtpFrom = process.env.SMTP_FROM!;

    const info = await transporter.sendMail({
      from: smtpFrom,
      to,
      cc,
      bcc,
      subject,
      html,
    });

    // Log email send
    try {
      await authz.service
        .from('email_logs')
        .insert({
          sent_by: authz.userId,
          recipient: to,
          subject,
          status: 'sent',
          message_id: info.messageId,
        });
    } catch (err: unknown) {
      console.warn('Could not log email:', err);
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Email send error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
