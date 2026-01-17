import fs from 'fs/promises';
import path from 'path';

export type DetectedProduct = { name: string; quantity: number; pointsPerItem: number };

/**
 * Try to run YOLO detection if environment is prepared (onnxruntime + model file).
 * Fallback to a mock detector if not available.
 *
 * To enable real YOLO detection:
 * - Install `onnxruntime-node` in your project: `npm install onnxruntime-node`
 * - Place a compatible ONNX model at `./models/yolo.onnx` (or update path below).
 */
export async function detectProducts(buffer: Buffer): Promise<{ products: DetectedProduct[]; info?: string }>{
  const modelPath = path.join(process.cwd(), 'models', 'yolo.onnx');

  // If model file is missing, fallback to mock
  try {
    await fs.access(modelPath);
  } catch (e) {
    // mock results
    const mock = [
      { name: '飲料瓶', quantity: 2, pointsPerItem: 10 },
      { name: '紙箱', quantity: 1, pointsPerItem: 20 },
    ];
    return { products: mock, info: 'mock: model not found; place an ONNX model at ./models/yolo.onnx to enable real detection' };
  }

  // Try to load onnxruntime dynamically to avoid import errors when not installed
  try {
    if (typeof window !== 'undefined') {
      // ONNX runtime only runs on Node — in browser we fallback
      throw new Error('onnxruntime not available in browser');
    }
    const modName = 'onnxruntime-node';
    // dynamic import using a variable to avoid bundlers trying to resolve it at build time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ort = await import(modName).then((m) => (m as any).default ?? m);

    // Very small example: user must implement a proper preprocessing matching the model
    // This code demonstrates the flow but may require adjustments per model (input shape, normalization, postprocessing)

    const session = await ort.InferenceSession.create(modelPath);

    // NOTE: full preprocessing (resize, normalize, pad) should be done here.
    // For brevity we skip actual image preprocessing and return mock result with info.
    // Implementers: decode `buffer` into image, resize to model input, convert to tensor, run session.run({ inputName: tensor })

    const info = 'onnxruntime loaded, model present — implement preprocessing & postprocessing for your YOLO model';
    const mockResult = [
      { name: '飲料瓶', quantity: 2, pointsPerItem: 10 },
    ];
    return { products: mockResult, info };
  } catch (e: any) {
    const mock = [
      { name: '飲料瓶', quantity: 2, pointsPerItem: 10 },
      { name: '紙箱', quantity: 1, pointsPerItem: 20 },
    ];
    return { products: mock, info: 'mock: onnxruntime not available or failed to run: ' + (e?.message || String(e)) };
  }
}
