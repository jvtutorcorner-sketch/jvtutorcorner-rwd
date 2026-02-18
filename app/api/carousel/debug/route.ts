import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import resolveDataFile from '@/lib/localData';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dataFilePath = await resolveDataFile('carousel.json');
    const localDataPath = path.join(process.cwd(), '.local_data', 'carousel.json');
    const dataPath = path.join(process.cwd(), 'data', 'carousel.json');

    const results = {
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
      resolvedPath: dataFilePath,
      paths: {
        resolvedFile: {
          path: dataFilePath,
          exists: fs.existsSync(dataFilePath),
          content: fs.existsSync(dataFilePath) ? JSON.parse(fs.readFileSync(dataFilePath, 'utf8')) : null,
        },
        localDataFile: {
          path: localDataPath,
          exists: fs.existsSync(localDataPath),
          content: fs.existsSync(localDataPath) ? JSON.parse(fs.readFileSync(localDataPath, 'utf8')) : null,
        },
        dataFile: {
          path: dataPath,
          exists: fs.existsSync(dataPath),
          content: fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : null,
        },
      },
      env: {
        DYNAMODB_TABLE_CAROUSEL: process.env.DYNAMODB_TABLE_CAROUSEL,
        CI_AWS_REGION: process.env.CI_AWS_REGION,
        AWS_REGION: process.env.AWS_REGION,
        hasCiAccessKey: !!process.env.CI_AWS_ACCESS_KEY_ID,
        hasAwsAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      },
    };

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to debug carousel',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
