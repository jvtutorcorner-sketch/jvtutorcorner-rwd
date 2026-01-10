import { NextResponse, NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { detectProducts } from '@/lib/detection';

async function saveUploadedImage(buffer: Buffer, email: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), '.uploads');
  try {
    await fs.mkdir(uploadDir, { recursive: true });
  } catch {}

  const filename = `${email}-${Date.now()}.jpg`;
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, buffer);

  return filepath;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const email = formData.get('email') as string | null;

    if (!imageFile) {
      return NextResponse.json({ error: '未提供圖片' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: '未提供 email' }, { status: 400 });
    }

    // 讀取圖片檔案
    const buffer = Buffer.from(await imageFile.arrayBuffer());

    // 儲存上傳的圖片（可選）
    await saveUploadedImage(buffer, email);

    // 使用可選的 YOLO/ONNX 偵測器（如果可用），否則回退到 mock
    const detection = await detectProducts(buffer);
    const detectedProducts = detection.products;

    // 計算總點數
    const totalPoints = detectedProducts.reduce(
      (sum, p) => sum + p.quantity * p.pointsPerItem,
      0,
    );

    return NextResponse.json({
      success: true,
      products: detectedProducts,
      totalPoints,
      info: detection.info,
    });
  } catch (err: any) {
    console.error('[scan-product] error:', err);
    return NextResponse.json(
      { error: '掃描失敗：' + (err?.message || '未知錯誤') },
      { status: 500 },
    );
  }
}
