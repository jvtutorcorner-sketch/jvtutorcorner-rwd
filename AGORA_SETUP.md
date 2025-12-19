# Agora Credentials Setup

This guide explains how to securely configure Agora RTC credentials for the JV Tutor Corner application.

## Overview

The application uses Agora RTC for video conferencing. Credentials are stored securely using AWS Systems Manager Parameter Store to avoid exposing them in code or deployment configurations.

## Local Development

For local development, create a `.env.local` file in the project root:

```bash
# Agora RTC
AGORA_APP_ID=your_32_character_app_id
AGORA_APP_CERTIFICATE=your_32_character_app_certificate
```

## Production Deployment

For production deployment on Amplify, follow these steps:

### Current Setup (Temporary - Direct Environment Variables)

**⚠️ TEMPORARY FIX**: Credentials are currently set directly in `amplify.yml` for immediate functionality. This is less secure than using SSM Parameter Store.

### Recommended Secure Setup (Future Implementation)

To implement secure credential management:

#### 1. Store Credentials in AWS Systems Manager

Run the setup script to securely store your Agora credentials:

```bash
npm run setup-agora
```

This script will:
- Read credentials from your `.env.local` file
- Store them as encrypted parameters in AWS Systems Manager Parameter Store
- Create parameters at:
  - `/jvtutorcorner/agora/app_id`
  - `/jvtutorcorner/agora/app_certificate`

#### 2. Configure Amplify Environment Variables

In the AWS Amplify Console:

1. Go to your app
2. Navigate to **App settings** > **Environment variables**
3. Update the following variables:
   - `AWS_REGION` = `us-east-1` (or your preferred region)
   - `AGORA_APP_ID` = `USE_SSM` (triggers SSM fetch)
   - `AGORA_APP_CERTIFICATE` = `USE_SSM` (triggers SSM fetch)

#### 3. Configure IAM Permissions

Ensure your Amplify service role has permissions to read SSM parameters:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:YOUR_ACCOUNT_ID:parameter/jvtutorcorner/agora/*"
      ]
    }
  ]
}
```

### 3. IAM Permissions

Ensure your Amplify service role has permissions to read from Systems Manager:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter"
      ],
      "Resource": [
        "arn:aws:ssm:*:*:parameter/jvtutorcorner/agora/*"
      ]
    }
  ]
}
```

## How It Works

1. **Local Development**: Credentials are read from environment variables
2. **Production**: The API routes check for environment variables first, then fall back to fetching from AWS Systems Manager Parameter Store
3. **Caching**: Credentials are cached for 5 minutes to reduce API calls
4. **Security**: Credentials are never logged or exposed in error messages

## Troubleshooting

### "Video conferencing service is temporarily unavailable" Error

If you encounter this error:

1. **Check Environment Variables**: Ensure `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` are set in Amplify
2. **Verify Credentials**: Credentials should be exactly 32 characters each
3. **Check AWS Permissions**: For SSM setup, ensure Amplify has SSM read permissions
4. **Monitor Logs**: Check Amplify build logs for detailed error messages

### Current Status

- ✅ Local development: Working (uses `.env.local`)
- ✅ Production: Working (temporary direct env vars in `amplify.yml`)
- 🔄 Future: Will migrate to secure SSM Parameter Store

### Legacy Issues

- **"AGORA_APP_ID or AGORA_APP_CERTIFICATE not set"**: Check that SSM parameters exist and IAM permissions are correct
- **"Video conferencing service is temporarily unavailable"**: SSM service may be unavailable or credentials malformed
- **Permission errors**: Verify IAM role has `ssm:GetParameter` permission for the parameter paths

## Security Notes

- Agora APP_ID is not considered sensitive (it's used client-side)
- APP_CERTIFICATE is sensitive and should never be exposed
- All credentials are encrypted in transit and at rest in AWS Systems Manager
- The application never logs or exposes credentials in responses