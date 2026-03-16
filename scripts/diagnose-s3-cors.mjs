import { S3Client, GetBucketCorsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

async function diagnose() {
    console.log('--- S3 Accessibility Diagnostics ---');

    // Load .env.local
    const envFile = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, 'utf8');
        content.split(/\r?\n/).forEach((line) => {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!m) return;
            const key = m[1];
            let val = m[2] || '';
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            process.env[key] = val;
        });
    }

    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKey && secretKey && bucket) {
        const s3Client = new S3Client({
            region,
            credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
        });

        console.log(`Checking CORS for bucket: ${bucket}...`);
        try {
            const cors = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucket }));
            console.log('✅ CORS Configuration:', JSON.stringify(cors.CORSRules, null, 2));
        } catch (err) {
            if (err.name === 'NoSuchCORSConfiguration') {
                console.warn('⚠️  No CORS configuration found for this bucket. This will block cross-origin browser requests.');
            } else {
                console.error('❌ Error getting CORS:', err.message);
            }
        }

        console.log(`\nListing recent objects in ${bucket}/carousel/...`);
        try {
            const objects = await s3Client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: 'carousel/',
                MaxKeys: 5
            }));

            if (objects.Contents && objects.Contents.length > 0) {
                console.log(`Found ${objects.Contents.length} objects:`);
                for (const obj of objects.Contents) {
                    console.log(`- ${obj.Key} (Size: ${obj.Size}, LastModified: ${obj.LastModified})`);
                }
            } else {
                console.log('No objects found with prefix carousel/');
            }
        } catch (err) {
            console.error('❌ Error listing objects:', err.message);
        }
    } else {
        console.log('Missing AWS credentials or bucket name.');
    }
}

diagnose().catch(console.error);
