# Email and Calendar Testing Skill

Responsible for verifying email sending functionality and calendar course reminder scheduled flows.

## Core Capabilities
1. **Direct Email Testing**: Verify SMTP configuration and direct email delivery.
2. **Calendar Reminder Flow**: Test the creation, scheduling, and processing of course start reminders.

## Test Flows

### 1. Direct Email Test
Use the `app-integrations/test` API to verify SMTP settings.

**Request**:
```bash
POST /api/app-integrations/test
Content-Type: application/json

{
  "type": "SMTP",
  "config": {
    "smtpHost": "smtp.gmail.com",
    "smtpPort": "587",
    "smtpUser": "your-email@gmail.com",
    "smtpPass": "your-app-password"
  },
  "emailTest": {
    "to": "jvtutorcorner@gmail.com",
    "subject": "SMTP Test",
    "html": "<p>Test email from JV Tutor</p>"
  }
}
```

### 2. Calendar Reminder Test Flow
Verify that the system correctly identifies and sends reminders for upcoming courses.

#### Automated Test
Run the following script to perform an end-to-end check:
```bash
npx ts-node scripts/test-reminder-flow.ts
```

#### Manual Verification Steps
1. **Create a Test Reminder**:
   - Go to `/calendar` or use `POST /api/calendar/reminders`.
   - Set the `eventStartTime` to shortly after the current time (e.g., +10 mins).
   - Set `reminderMinutes` to a value greater than the time difference (e.g., 15 mins).
2. **Trigger Processing**:
   - Call `POST /api/cron/process-reminders` with the `CRON_SECRET` in the `Authorization` header.
3. **Check Results**:
   - Verify `emailStatus` is `sent` in the DynamoDB table or at `/calendar/reminders`.
   - Confirm receipt in the target mailbox.

## Troubleshooting
- **Email Status 'pending'**: Ensure current time is past `(eventStartTime - reminderMinutes)`.
- **Email Status 'failed'**: Check `emailError` field in the reminder record for SMTP errors.
- **Unauthorized**: Ensure `CRON_SECRET` in the headers matches the environment variable.
