import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { debugLog } from '@/lib/debug';

export interface EmailSendOptions {
  testMode?: boolean;
  testEmailAddress?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  errorText?: string;
}

type RecipientMode = 'to' | 'bcc';

// Initialize transporter based on authentication method
function createTransporter() {
  const hasSmtpUrl = !!process.env.SMTP_URL;
  const hasSmtpConfig = !!process.env.SMTP_HOST && !!process.env.SMTP_PORT;

  if (hasSmtpUrl) {
    return nodemailer.createTransport(process.env.SMTP_URL);
  }

  if (hasSmtpConfig) {
    const smtpPort = Number(process.env.SMTP_PORT || '587');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS?.replace(/\s/g, ''),
          }
        : undefined,
    });
  }

  // Fallback to App Password authentication
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''),
    },
  });
}

const transporter = createTransporter();

const SENDER_EMAIL =
  process.env.EMAIL_FROM ||
  process.env.SMTP_USER ||
  process.env.GMAIL_USER ||
  'noreply@example.com';
const SENDER_NAME = process.env.EMAIL_FROM_NAME || 'Training Team';
const EMAIL_TEST_MODE = ['true', '1', 'yes', 'on'].includes(
  (process.env.EMAIL_TEST_MODE || process.env.NEXT_PUBLIC_EMAIL_TEST_MODE || '').toLowerCase()
);
const TEST_EMAIL_ADDRESS =
  process.env.TEST_EMAIL_ADDRESS ||
  process.env.NEXT_PUBLIC_TEST_EMAIL_ADDRESS ||
  process.env.GMAIL_USER ||
  '';

function getEmailProviderLabel() {
  if (process.env.SMTP_URL || process.env.SMTP_HOST) return 'smtp';
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail_app_password';
  return 'unknown';
}

export interface EmailSendDetailedResult {
  success: boolean;
  provider: string;
  testMode: boolean;
  messageId?: string;
  errorText?: string;
  originalRecipients: string[];
  deliveredRecipients: string[];
}

async function logEmailSend(entry: {
  subject: string;
  status: 'sent' | 'failed';
  testMode: boolean;
  messageId?: string;
  errorText?: string;
  originalRecipients: string[];
  deliveredRecipients: string[];
}) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return;

    // Vercel automatically sets NEXT_PUBLIC_VERCEL_ENV to 'production', 'preview', or 'development'
    // Use 'dev' schema for preview/development, 'public' schema for production
    const isDev = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production';
    const schema = isDev ? 'dev' : 'public';

    const supabase = createClient(url, serviceRoleKey, {
      db: { 
        schema 
      }
    });
    await supabase.from('email_logs').insert({
      subject: entry.subject,
      status: entry.status,
      test_mode: entry.testMode,
      provider: getEmailProviderLabel(),
      message_id: entry.messageId || null,
      error_text: entry.errorText || null,
      original_recipients: entry.originalRecipients,
      delivered_recipients: entry.deliveredRecipients,
    });
  } catch (error) {
    console.error('Failed to write email log:', error);
  }
}

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleDateString('en-GB');
  } catch {
    return date;
  }
}

export function formatTime(time?: string | null) {
  if (!time) return '';

  const [hours = '', minutes = ''] = time.split(':');
  if (!hours || !minutes) return time;

  const parsedHours = Number(hours);
  if (Number.isNaN(parsedHours)) return time;

  const suffix = parsedHours >= 12 ? 'PM' : 'AM';
  const twelveHour = parsedHours % 12 || 12;
  return `${twelveHour}:${minutes} ${suffix}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTruthyFlag(value?: string) {
  if (!value) return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

function resolveRecipients(to: string[], options?: EmailSendOptions) {
  const clean = [...new Set(to.map((e) => e?.trim()).filter(Boolean))];
  const testModeEnabled = typeof options?.testMode === 'boolean' ? options.testMode : EMAIL_TEST_MODE;
  const testAddress = options?.testEmailAddress?.trim() || TEST_EMAIL_ADDRESS;

  if (testModeEnabled) {
    if (!testAddress) {
      console.error('Email test mode is enabled but no test email address is configured');
      return { recipients: [] as string[], testMode: true };
    }
    return { recipients: [testAddress], testMode: true };
  }

  return { recipients: clean, testMode: false };
}

export function getEmailSendOptionsFromHeaders(headerValue: string | null, emailHeaderValue: string | null): EmailSendOptions | undefined {
  const hasModeHeader = headerValue !== null;
  const hasEmailHeader = emailHeaderValue !== null;
  if (!hasModeHeader && !hasEmailHeader) return undefined;

  return {
    testMode: hasModeHeader ? isTruthyFlag(headerValue || undefined) : undefined,
    testEmailAddress: emailHeaderValue || undefined,
  };
}

async function sendEmail(to: string, subject: string, html: string, options?: EmailSendOptions): Promise<boolean> {
  return sendBulkEmail([to], subject, html, options);
}

async function sendRawEmail(recipients: string[], subject: string, html: string, mode: RecipientMode = 'to'): Promise<SendResult> {
  try {
    const hasSmtp = !!process.env.SMTP_URL || (!!process.env.SMTP_HOST && !!process.env.SMTP_PORT);
    const hasAppPassword = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

    if (!hasSmtp && !hasAppPassword) {
      console.error('Email credentials not configured (SMTP or Gmail app password required)');
      return {
        success: false,
        errorText: 'Email credentials not configured (SMTP or Gmail app password required)',
      };
    }

    const info = await transporter.sendMail({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: mode === 'to' ? recipients.join(',') : SENDER_EMAIL,
      bcc: mode === 'bcc' ? recipients.join(',') : undefined,
      subject,
      html,
    });

    debugLog('Email sent successfully:', { id: info.messageId, recipients, mode });
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('Email send error:', error);
    return {
      success: false,
      errorText: error instanceof Error ? error.message : String(error),
    };
  }
}

export type PasswordEmailKind = 'reset' | 'welcome';

export const PASSWORD_RESET_SUBJECT = 'Reset your Cascade Portal password';
export const PASSWORD_WELCOME_SUBJECT = 'Set up your Cascade Portal account';

/**
 * Formal "set your password" email. `kind` picks the wording: 'reset' for an
 * existing account, 'welcome' for a newly created one. Table-based layout
 * with inline styles so it renders consistently in Outlook as well as Gmail.
 */
export async function sendPasswordResetEmail(
  staffEmail: string,
  staffName: string,
  resetLink: string,
  options?: EmailSendOptions,
  kind: PasswordEmailKind = 'reset'
) {
  const safeStaffName = escapeHtml((staffName || '').trim() || 'colleague');
  const safeResetLink = escapeHtml(resetLink);
  const isWelcome = kind === 'welcome';
  const subject = isWelcome ? PASSWORD_WELCOME_SUBJECT : PASSWORD_RESET_SUBJECT;
  const heading = isWelcome ? 'Set up your account' : 'Reset your password';
  const intro = isWelcome
    ? 'An account has been created for you on the Cascade Portal, where you can view your training record and book onto courses. Please choose a password to complete your account set-up.'
    : 'We have received a request to reset the password for your Cascade Portal account. To choose a new password, please use the button below.';
  const buttonText = isWelcome ? 'Set up my password' : 'Reset my password';
  const notRequested = isWelcome
    ? 'If you were not expecting this email, please contact the Training Team.'
    : 'If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.';

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="background-color:#1e3a5f;padding:20px 32px;border-radius:8px 8px 0 0;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">Cascade Portal</p>
            <p style="margin:4px 0 0 0;color:#cbd5e1;font-size:13px;">Training Team</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
            <h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;">${heading}</h1>
            <p style="margin:0 0 16px 0;">Dear ${safeStaffName},</p>
            <p style="margin:0 0 16px 0;">${intro}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr>
                <td style="background-color:#1d4ed8;border-radius:6px;">
                  <a href="${safeResetLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;">${buttonText}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;font-weight:bold;">What happens next</p>
            <ol style="margin:0 0 16px 20px;padding:0;">
              <li>Select the button above. A Cascade Portal page will open.</li>
              <li>Select <strong>Set my password</strong> on that page.</li>
              <li>Enter your new password twice. You will then be signed in.</li>
            </ol>
            <p style="margin:0 0 16px 0;">For your security, this link can only be used once and expires after a short time. If it has expired, select <strong>Forgotten your password?</strong> on the Cascade Portal sign-in page to receive a new one.</p>
            <p style="margin:0 0 16px 0;">${notRequested}</p>
            <p style="margin:24px 0 0 0;">Kind regards,<br>Training Team</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
            <p style="margin:0 0 6px 0;">If the button does not work, copy this address into your web browser:</p>
            <p style="margin:0 0 12px 0;word-break:break-all;color:#374151;">${safeResetLink}</p>
            <p style="margin:0;">This is an automated message from the Cascade Portal. Please do not share this email or its link with anyone.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
  `;

  return await sendEmail(staffEmail, subject, html, options);
}

export async function sendBookingEmail(
  staffEmail: string,
  staffName: string,
  courseName: string,
  date: string,
  startTime?: string | null,
  endTime?: string | null,
  options?: EmailSendOptions
) {
  const safeStaffName = escapeHtml(staffName || 'Staff Member');
  const safeCourseName = escapeHtml(courseName || 'Unknown Course');
  const safeDate = escapeHtml(formatDate(date));
  const formattedStartTime = formatTime(startTime);
  const formattedEndTime = formatTime(endTime);
  const safeTimeRange = escapeHtml(
    formattedStartTime && formattedEndTime
      ? `${formattedStartTime} - ${formattedEndTime}`
      : formattedStartTime || formattedEndTime
  );
  const subject = `Course Booking Confirmed: ${courseName || 'Unknown Course'}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #dbeafe; border-radius: 10px; background-color: #f8fafc;">
      <h2 style="color: #0284c7; margin: 0 0 16px 0;">Booking Confirmed</h2>
      <p>Hi <strong>${safeStaffName}</strong>,</p>
      <p>You have been booked onto:</p>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 12px 0;">
        <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${safeCourseName}</p>
        <p style="margin: 0 0 6px 0;"><strong>Date:</strong> ${safeDate}</p>
        ${safeTimeRange ? `<p style="margin: 0;"><strong>Time:</strong> ${safeTimeRange}</p>` : ''}
      </div>
      <p style="font-size: 12px; color: #64748b;">Training Portal</p>
    </div>
  `;

  return await sendEmail(staffEmail, subject, html, options);
}

export async function sendBookingCancellationEmail(staffEmail: string, staffName: string, courseName: string, date: string, reason?: string, options?: EmailSendOptions) {
  const safeStaffName = escapeHtml(staffName || 'Staff Member');
  const safeCourseName = escapeHtml(courseName || 'Unknown Course');
  const safeDate = escapeHtml(formatDate(date));
  const safeReason = reason ? escapeHtml(reason) : '';
  const subject = `Course Booking Cancelled: ${courseName || 'Unknown Course'}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fee2e2; border-radius: 10px; background-color: #fff7ed;">
      <h2 style="color: #dc2626; margin: 0 0 16px 0;">Booking Cancelled</h2>
      <p>Hi <strong>${safeStaffName}</strong>,</p>
      <p>Your booking has been removed for:</p>
      <div style="background: #ffffff; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px; margin: 12px 0;">
        <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${safeCourseName}</p>
        <p style="margin: 0 0 6px 0;"><strong>Date:</strong> ${safeDate}</p>
        ${safeReason ? `<p style="margin: 0;"><strong>Reason:</strong> ${safeReason}</p>` : ''}
      </div>
      <p style="font-size: 12px; color: #64748b;">Training Portal</p>
    </div>
  `;

  return await sendEmail(staffEmail, subject, html, options);
}

export async function sendBulkEmail(emails: string[], subject: string, htmlContent: string, options?: EmailSendOptions) {
  const originalRecipients = [...new Set(emails.map((e) => e?.trim()).filter(Boolean))];
  const { recipients, testMode } = resolveRecipients(emails, options);

  if (recipients.length === 0) {
    console.error('No valid recipients found for sendBulkEmail');
    await logEmailSend({
      subject,
      status: 'failed',
      testMode,
      errorText: 'No valid recipients found for sendBulkEmail',
      originalRecipients,
      deliveredRecipients: [],
    });
    return false;
  }

  const finalSubject = testMode ? `[TEST] ${subject}` : subject;
  const wrappedHtml = testMode
    ? `
      <div style="font-family: sans-serif; margin-bottom: 12px; padding: 12px; border: 1px dashed #f59e0b; border-radius: 8px; background: #fffbeb;">
        <strong>TEST MODE:</strong> Original recipients were suppressed.
      </div>
      ${htmlContent}
    `
    : htmlContent;

  const mode: RecipientMode = recipients.length > 1 ? 'bcc' : 'to';
  const result = await sendRawEmail(recipients, finalSubject, wrappedHtml, mode);

  await logEmailSend({
    subject: finalSubject,
    status: result.success ? 'sent' : 'failed',
    testMode,
    messageId: result.messageId,
    errorText: result.errorText,
    originalRecipients,
    deliveredRecipients: recipients,
  });

  return result.success;
}

export async function sendBulkEmailDetailed(
  emails: string[],
  subject: string,
  htmlContent: string,
  options?: EmailSendOptions
): Promise<EmailSendDetailedResult> {
  const originalRecipients = [...new Set(emails.map((e) => e?.trim()).filter(Boolean))];
  const { recipients, testMode } = resolveRecipients(emails, options);
  const provider = getEmailProviderLabel();

  if (recipients.length === 0) {
    const errorText = 'No valid recipients found for sendBulkEmailDetailed';
    await logEmailSend({
      subject,
      status: 'failed',
      testMode,
      errorText,
      originalRecipients,
      deliveredRecipients: [],
    });
    return {
      success: false,
      provider,
      testMode,
      errorText,
      originalRecipients,
      deliveredRecipients: [],
    };
  }

  const finalSubject = testMode ? `[TEST] ${subject}` : subject;
  const wrappedHtml = testMode
    ? `
      <div style="font-family: sans-serif; margin-bottom: 12px; padding: 12px; border: 1px dashed #f59e0b; border-radius: 8px; background: #fffbeb;">
        <strong>TEST MODE:</strong> Original recipients were suppressed.
      </div>
      ${htmlContent}
    `
    : htmlContent;

  const mode: RecipientMode = recipients.length > 1 ? 'bcc' : 'to';
  const result = await sendRawEmail(recipients, finalSubject, wrappedHtml, mode);

  await logEmailSend({
    subject: finalSubject,
    status: result.success ? 'sent' : 'failed',
    testMode,
    messageId: result.messageId,
    errorText: result.errorText,
    originalRecipients,
    deliveredRecipients: recipients,
  });

  return {
    success: result.success,
    provider,
    testMode,
    messageId: result.messageId,
    errorText: result.errorText,
    originalRecipients,
    deliveredRecipients: recipients,
  };
}

export { sendEmail };
