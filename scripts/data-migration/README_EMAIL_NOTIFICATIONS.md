# Email Notifications

This app has built-in email notifications for bookings and scheduling. Emails are sent server-side via `nodemailer`, using either SMTP or (as a fallback) a Gmail App Password.

## What emails are sent

- **Booking confirmation**: sent when a staff member is booked onto a course.
- **Booking cancellation**: sent when a staff member is removed, or when an event is cancelled.
- **Course announcement (bulk)**: sent when a new course session is scheduled (to all staff with an email address).
- **Password / magic-link**: admins can send a setup/login link to a staff email.

## Where it lives in the code

- Email templates + send logic: `src/lib/email.ts`
- API routes:
  - `src/app/api/send-booking-confirmation/route.ts`
  - `src/app/api/send-booking-cancellation/route.ts`
  - `src/app/api/send-course-notification/route.ts`
  - `src/app/api/send-password-reset/route.ts`
- UI triggers:
  - `src/app/components/BookingModal.tsx`
  - `src/app/components/ScheduleModal.tsx`
- Test-mode headers (per request): `src/lib/emailTestMode.ts`
- Email logs API (if enabled): `src/app/api/email-logs/route.ts`

## Setup

1) Configure an email transport in `.env.local` (pick one):

SMTP URL:
```env
SMTP_URL=smtps://USER:PASS@smtp.your-provider.com:465
```

SMTP host/port:
```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASS=your-pass
```

Gmail App Password:
```env
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

2) Set the sender identity:
```env
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Training Team
```

3) Restart the dev server after editing `.env.local`.

## Safe testing (recommended)

In the app: **Dashboard → Notifications**:
- enable **Email test mode**
- set a **test email address**

When enabled, the UI adds headers (`x-email-test-mode`, `x-test-email-address`) so sends are suppressed to real recipients and delivered only to your test inbox.

Server-side fallback flags also exist:
```env
EMAIL_TEST_MODE=true
TEST_EMAIL_ADDRESS=your-test-inbox@example.com
```

## Optional: logging email sends

If you apply `supabase/migrations/20260220000001_create_email_logs.sql` and set:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

…then each send attempt is recorded to `public.email_logs` and shown in **Dashboard → Notifications** (via `GET /api/email-logs`).

## Troubleshooting

- **“Email credentials not configured”**: set `SMTP_URL` *or* `SMTP_HOST`/`SMTP_PORT` (+ credentials) *or* `GMAIL_USER` + `GMAIL_APP_PASSWORD`.
- **Nothing arrives**: use test mode and confirm your provider is not blocking relay; check server logs for `Email send error`.
- **Bulk sends**: multiple recipients are sent using BCC by default.
