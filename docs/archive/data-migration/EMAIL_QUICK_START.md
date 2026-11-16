# Email Notifications – Quick Start

This app sends emails via `nodemailer` using either:
- SMTP (`SMTP_URL` or `SMTP_HOST`/`SMTP_PORT` + credentials), or
- Gmail App Password (`GMAIL_USER` + `GMAIL_APP_PASSWORD`) as a fallback.

Email triggers are already wired in the UI:
- Booking staff → confirmation email
- Removing staff / cancelling event → cancellation email
- Scheduling a course → bulk notification to all staff

## 1) Configure email credentials

Add one of these to `.env.local`:

### Option A (recommended): SMTP URL
```env
SMTP_URL=smtps://USER:PASS@smtp.your-provider.com:465
```

### Option B: SMTP host/port
```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASS=your-pass
```

### Option C: Gmail App Password (dev / small usage)
```env
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Also set a From address/name:
```env
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Training Team
```

Restart `npm run dev` after editing `.env.local`.

## 2) Enable safe testing (recommended)

In the app: **Dashboard → Notifications**:
- enable **Email test mode**
- set a **test email address**

When enabled, the UI sends headers so emails are delivered only to your test inbox.

## 3) (Optional) Enable email logging in Supabase

There is an `email_logs` table migration at `supabase/migrations/20260220000001_create_email_logs.sql`.

To write send-attempt logs, set:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then you can view recent activity in **Dashboard → Notifications** (or via `GET /api/email-logs`).

## 4) Verify end-to-end

With test mode enabled:
- book a staff member onto a course (confirmation email)
- remove a staff member (cancellation email)
- schedule a new course (bulk notification email)
