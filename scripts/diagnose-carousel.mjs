import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import fs from 'fs';
import path from 'path';

async function diagnose() {
    console.log('--- Carousel Upload Diagnostics (Version 2) ---');

    // Load .env.local
    const envFile = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envFile)) {
        console.log('Found .env.local');
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

    const region = process.env.AWS_REGION || process.env.CI_AWS_REGION || 'ap-northeast-1';
    const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.CI_AWS_S3_BUCKET_NAME;
    const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.CI_AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.CI_AWS_SECRET_ACCESS_KEY;
    const carouselTable = process.env.DYNAMODB_TABLE_CAROUSEL || 'jvtutorcorner-carousel';

    console.log(`Region: ${region}`);
    console.log(`Bucket: ${bucket || 'MISSING'}`);

    if (accessKey && secretKey) {
        const s3Client = new S3Client({
            region,
            credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
        });

        try {
            const buckets = await s3Client.send(new ListBucketsCommand({}));
            console.log('✅ S3 ListBuckets: SUCCESS');
            const bucketNames = buckets.Buckets.map(b => b.Name);
            console.log('Available Buckets:', bucketNames);

            if (bucket) {
                if (bucketNames.includes(bucket)) {
                    console.log(`✅ Bucket '${bucket}' is in your bucket list`);
                    try {
                        await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
                        console.log(`✅ Bucket '${bucket}' HeadBucket: SUCCESS (accessible)`);
                    } catch (err) {
                        console.error(`❌ Bucket '${bucket}' HeadBucket: FAILED`, err.message);
                    }
                } else {
                    console.error(`❌ Bucket '${bucket}' NOT FOUND in your bucket list`);
                }
            }
        } catch (err) {
            console.error('❌ S3 Connectivity: FAILED', err.message);
        }

        const ddbClient = new DynamoDBClient({
            region,
            credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
        });

        try {
            await ddbClient.send(new DescribeTableCommand({ TableName: carouselTable }));
            console.log(`✅ DynamoDB table '${carouselTable}' found`);
        } catch (err) {
            console.log(`❌ DynamoDB table '${carouselTable}': ${err.name} - ${err.message}`);
        }
    } else {
        console.log('Missing AWS credentials.');
    }
}

diagnose().catch(console.error);
