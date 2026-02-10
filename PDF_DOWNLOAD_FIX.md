# PDF Download 404 Fix

## Problem Identified

The "PDF file download failed: 404" error on `/classroom/test` was caused by:
1. **Local file write was disabled**: The code had `fs.writeFileSync()` commented out
2. **S3 upload could silently fail**: If S3 was misconfigured or had credentials issues, the code would fall back to local storage
3. **Metadata saved without file**: The metadata was saved to DynamoDB pointing to a local file that was never actually written to disk
4. **Get request failed**: When requesting the file, it tried to read from a non-existent local path, resulting in 404

## Changes Made

### 1. POST Route (`app/api/whiteboard/pdf/route.ts`)
- ✅ Added detailed S3 configuration logging
- ✅ Added explicit S3 upload error logging with error codes
- ✅ **Re-enabled local file writing** (`fs.writeFileSync()`)
- ✅ Added error handling if local write fails
- ✅ More detailed log messages to distinguish between S3 vs local storage paths

### 2. GET Route (`app/api/whiteboard/pdf/route.ts`)
- ✅ Added detailed logging for file retrieval attempts
- ✅ Clear indication of whether file is from S3 or local storage
- ✅ Better error messages when files are not found

### 3. ClientClassroom Component (`app/classroom/ClientClassroom.tsx`)
- ✅ Added logging to show the `sessionReadyKey` being used for PDF retrieval
- ✅ Shows course ID and route path for debugging context

## How to Verify the Fix

### Step 1: Monitor Server Logs
When you upload a PDF from `/classroom/wait`, watch the Terminal output for:

```
[PDF POST] S3 Configuration check: {
  hasAccessKey: true,
  hasCiAccessKey: false,
  hasBucket: true,
  useS3: true,
  bucket: 'jvtutorcornerimages'
}

[PDF POST] Attempting S3 upload. Key: whiteboard/session_classroom_session_ready_c1.pdf

[PDF POST] ✓ PDF upload to S3 success: { key: '...', url: '...' }
```

Or if S3 fails:
```
[PDF POST] ✗ S3 upload failed: { error: 'network error', code: 'ECONNREFUSED' }
[PDF POST] Falling back to local storage
[PDF POST] ✓ PDF written to local storage: { localPath: '...', size: 1024 }
```

### Step 2: Verify Metadata Save
```
[PDF POST] Saving PDF state: {
  name: 'your-file.pdf',
  s3Key: 'whiteboard/session_...',
  url: '<upload_url>',
  ...
}

[PDF POST] ✓ Saved whiteboard state with PDF metadata for uuid: classroom_session_ready_...
```

### Step 3: Check GET Request
When navigating to `/classroom/test`, check for:

```
[ClientClassroom] === PDF FETCH START ===
[ClientClassroom] Session Key: classroom_session_ready_c1
[ClientClassroom] Course ID: c1
[ClientClassroom] Is Test Path: true

[ClientClassroom] Checking for PDF metadata...
[PDF GET] Querying DynamoDB for uuid: classroom_session_ready_c1
[PDF GET] ✓ PDF found on attempt 1/5

[PDF GET] Attempting to serve PDF bytes: {
  s3Key: 'whiteboard/session_classroom_session_ready_c1.pdf',
  url: '<url>',
  isLocalFile: false,
  isS3: true
}

[PDF GET] Attempting to retrieve from S3: { s3Key: '...', bucket: 'jvtutorcornerimages' }
[PDF GET] ✓ Retrieved PDF from S3, size: 102400
```

### Step 4: Test Complete Flow
1. ✅ Open `/classroom/wait?courseId=c1`
2. ✅ Log in as teacher
3. ✅ Upload a PDF file
4. ✅ Check server terminal for `[PDF POST]` logs (verify S3 or local storage success)
5. ✅ Navigate to `/classroom/test?courseId=c1`
6. ✅ Check server terminal for `[PDF GET]` logs (verify file retrieval success)
7. ✅ Verify PDF content loads without error

## Environment Configuration

The fix depends on these `.env.local` settings being correct:

```env
# AWS Credentials for S3 (Optional but recommended)
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_REGION=ap-northeast-1
AWS_S3_BUCKET_NAME=jvtutorcornerimages

# DynamoDB
WHITEBOARD_TABLE=jvtutorcorner-whiteboard
```

If `AWS_S3_BUCKET_NAME` is not set or credentials are missing, PDFs will be stored locally in `.uploads/whiteboard/`.

## Troubleshooting

### Issue: "Local PDF file not found" error
- The local file write is now **enabled** in the fix
- If you still see this error, check that `.uploads/whiteboard/` directory can be created
- Check file system permissions for the `.uploads` directory

### Issue: S3 upload keeps failing
- Verify AWS credentials are correct in `.env.local`
- Check AWS IAM permissions allow S3 PutObject to the bucket
- Verify the bucket name is correct

### Issue: UUID mismatch between upload and retrieval
- The `sessionReadyKey` should be the same on both `/classroom/wait` and `/classroom/test`
- Verify you're navigating from wait → test using the "Enter Classroom" button
- Check console logs for the `sessionReadyKey` value on both pages

## Notes

- Local file writes will now cause a brief server refresh due to file system changes
- This is the trade-off for having a fallback when S3 is unavailable
- For production, ensure S3 is properly configured so PDFs are stored in cloud storage rather than local files
