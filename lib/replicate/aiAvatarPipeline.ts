// lib/replicate/aiAvatarPipeline.ts
import Replicate from 'replicate';

export { MAX_SCRIPT_LENGTH } from './aiAvatarConstants';

// 文字配音（TTS）模型，支援中文
export const TTS_MODEL = 'minimax/speech-02-turbo';
// 大頭照 + 配音 -> 口型同步影片
export const LIPSYNC_MODEL = 'lucataco/sadtalker';

let client: Replicate | null = null;

function getClient(): Replicate {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN 未設定，請先在 .env.local 加入此環境變數');
  }
  if (!client) {
    client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }
  return client;
}

export interface PredictionResult {
  id: string;
  status: string;
  output: unknown;
  error: unknown;
}

function toResult(p: { id: string; status: string; output?: unknown; error?: unknown }): PredictionResult {
  return { id: p.id, status: p.status, output: p.output, error: p.error };
}

export async function createTtsPrediction(script: string): Promise<PredictionResult> {
  const prediction = await getClient().predictions.create({
    model: TTS_MODEL,
    input: { text: script },
  });
  return toResult(prediction);
}

export async function createLipsyncPrediction(photoDataUrl: string, audioUrl: string): Promise<PredictionResult> {
  const prediction = await getClient().predictions.create({
    model: LIPSYNC_MODEL,
    input: { source_image: photoDataUrl, driven_audio: audioUrl },
  });
  return toResult(prediction);
}

export async function getPrediction(id: string): Promise<PredictionResult> {
  const prediction = await getClient().predictions.get(id);
  return toResult(prediction);
}

// TTS/口型同步模型的輸出可能是字串 URL，也可能是包一層陣列，統一取出可用的檔案網址
export function extractAudioUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  return null;
}

export function extractVideoUrl(output: unknown): string | null {
  return extractAudioUrl(output);
}
