#!/usr/bin/env node
/**
 * 把你自己準備的輪播圖裁成平台首頁輪播圖規格（1200x628，@2x 輸出 2400x1256）。
 *
 * 用法：
 *   1) 把原始圖片放進  carousel-source/                （檔名建議用英文/數字，會被拿來命名輸出檔）
 *   2) 執行：
 *        node scripts/prepare-carousel-images.mjs
 *
 *      每個檔案各自視為「一張輪播圖」→ 裁成 1200x628（cover，置中裁切）
 *
 *   若你的原始檔其實是「一張大圖裡面切好格子的好幾張輪播圖」（例如 2x3 的分鏡稿），
 *   加上 --grid <列x欄> 讓腳本先切格再各自裁成 1200x628：
 *        node scripts/prepare-carousel-images.mjs --grid 2x3
 *
 *   若切好格子的每一格「原生比例」比 1200x628 窄很多（常見於九宮格分鏡稿），
 *   預設的 cover 裁切會吃掉不少內容。加上 --fit contain 改成「完整保留、不裁切」，
 *   改用等比縮放＋四周補色（自動取樣每張圖自己的邊緣底色來補，盡量無縫）：
 *        node scripts/prepare-carousel-images.mjs --grid 3x2 --rows 342,302,262 --fit contain
 *
 *   輸出位置： carousel-shots/ready/
 *   輸出格式：JPEG，quality 90，超過 5MB 會自動降 quality 重壓（比照 app/carousel/page.tsx 上傳邏輯）。
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'carousel-source');
const OUT_DIR = path.join(ROOT, 'carousel-shots', 'ready');

const TARGET_W = 1200;
const TARGET_H = 628;
const SCALE = 2; // 輸出 @2x，供高解析度螢幕使用
const MAX_BYTES = 5 * 1024 * 1024;

const IMG_EXT = /\.(png|jpe?g|webp|gif|tiff?)$/i;

const VALID_POSITIONS = new Set([
  'attention', 'center', 'centre', 'top', 'bottom', 'left', 'right',
  'left top', 'right top', 'left bottom', 'right bottom',
]);

function parsePxList(raw, flagName) {
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    console.error(`❌ ${flagName} 需為以逗號分隔的正整數像素值，例如 342,302,262`);
    process.exit(1);
  }
  return parts;
}

function parseArgs(argv) {
  const out = { grid: null, position: 'attention', rowPx: null, colPx: null, fit: 'cover' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--grid') {
      const m = /^(\d+)x(\d+)$/i.exec(argv[i + 1] || '');
      if (!m) {
        console.error('❌ --grid 格式需為 <列>x<欄>，例如 --grid 3x2');
        process.exit(1);
      }
      out.grid = { rows: Number(m[1]), cols: Number(m[2]) };
      i++;
    } else if (argv[i] === '--position') {
      const v = (argv[i + 1] || '').toLowerCase();
      if (!VALID_POSITIONS.has(v)) {
        console.error(`❌ --position 需為以下其中之一：${[...VALID_POSITIONS].join(', ')}`);
        process.exit(1);
      }
      out.position = v;
      i++;
    } else if (argv[i] === '--rows') {
      out.rowPx = parsePxList(argv[i + 1] || '', '--rows');
      i++;
    } else if (argv[i] === '--cols') {
      out.colPx = parsePxList(argv[i + 1] || '', '--cols');
      i++;
    } else if (argv[i] === '--fit') {
      const v = (argv[i + 1] || '').toLowerCase();
      if (v !== 'cover' && v !== 'contain') {
        console.error('❌ --fit 需為 cover（裁切填滿，預設）或 contain（完整保留＋補色留白）');
        process.exit(1);
      }
      out.fit = v;
      i++;
    }
  }
  return out;
}

/** 把「每列/每欄的像素高度或寬度」轉成累積邊界，例如 [342,302,262] -> [0,342,644,906] */
function cumulativeBoundaries(sizes) {
  const bounds = [0];
  for (const s of sizes) bounds.push(bounds[bounds.length - 1] + s);
  return bounds;
}

/** 沒指定精確像素時，退回等分切格 */
function evenBoundaries(count, total) {
  const step = Math.floor(total / count);
  const bounds = [0];
  for (let i = 1; i <= count; i++) bounds.push(i === count ? total : step * i);
  return bounds;
}

async function encodeUnderLimit(pipeline) {
  let quality = 92;
  let buf = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (buf.length > MAX_BYTES && quality > 40) {
    quality -= 8;
    buf = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return { buf, quality };
}

/**
 * 取樣圖片自己的上緣與下緣平均顏色，當作 contain 模式的補色。
 * letterbox 的留白會直接貼在圖片的上/下緣旁邊，所以用「圖片自己邊緣的顏色」
 * 補上去，接縫最不明顯（比補純白或固定色更貼近原圖）。
 */
async function sampleEdgeBackground(buf) {
  const base = sharp(buf).flatten({ background: '#ffffff' }); // 先攤平掉透明背景，避免 alpha 干擾取色
  const meta = await base.metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const edgeH = Math.max(1, Math.round(h * 0.02));

  const [topStats, bottomStats] = await Promise.all([
    base.clone().extract({ left: 0, top: 0, width: w, height: edgeH }).stats(),
    base.clone().extract({ left: 0, top: Math.max(0, h - edgeH), width: w, height: edgeH }).stats(),
  ]);

  const avg = (i) => Math.round((topStats.channels[i].mean + bottomStats.channels[i].mean) / 2);
  return { r: avg(0), g: avg(1), b: avg(2) };
}

async function writeSlide(image, baseName, position, fit) {
  const w = TARGET_W * SCALE;
  const h = TARGET_H * SCALE;

  // 先把這一張（可能是整檔，也可能是已經 extract 出來的格子）實體化成一份 buffer，
  // 同一份 buffer 拿去取樣補色、也拿去做最終縮放，確保顏色跟內容是同一張圖。
  const srcBuf = await image.png().toBuffer();

  const resizeOpts =
    fit === 'contain'
      ? { fit: 'contain', background: await sampleEdgeBackground(srcBuf) }
      : { fit: 'cover', position };

  const pipeline = sharp(srcBuf).resize(w, h, resizeOpts);
  const { buf, quality } = await encodeUnderLimit(pipeline);
  const outPath = path.join(OUT_DIR, `${baseName}.jpg`);
  fs.writeFileSync(outPath, buf);
  console.log(`✅ ${path.relative(ROOT, outPath)}  (${w}x${h}, q${quality}, ${(buf.length / 1024).toFixed(0)}KB)`);
}

async function main() {
  const { grid, position, rowPx, colPx, fit } = parseArgs(process.argv.slice(2));

  if ((rowPx || colPx) && !grid) {
    console.error('❌ --rows / --cols 需要搭配 --grid 一起使用（用來知道總共幾列幾欄）');
    process.exit(1);
  }

  if (!fs.existsSync(SRC_DIR)) fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => IMG_EXT.test(f))
    .sort();

  if (files.length === 0) {
    console.log(`📂 carousel-source/ 目前是空的。`);
    console.log(`   把你的輪播圖檔案放進去： ${SRC_DIR}`);
    console.log(`   然後重新執行這支腳本。`);
    return;
  }

  console.log(`📥 讀到 ${files.length} 個檔案：${files.join(', ')}`);
  if (grid) console.log(`🔪 每張都會依 ${grid.rows}x${grid.cols} 切格`);
  if (fit === 'contain') {
    console.log(`🖼️  模式：contain（完整保留內容，四周自動補同色留白，不裁切）`);
  } else {
    console.log(`✂️  模式：cover（裁切填滿），裁切基準點：${position}`);
  }
  console.log('');

  let slideIndex = 1;

  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const baseName = path.basename(file, path.extname(file));
    const img = sharp(srcPath);
    const meta = await img.metadata();

    if (!grid) {
      const outName = String(slideIndex).padStart(2, '0') + '-' + baseName.replace(/[^a-zA-Z0-9-]+/g, '-');
      await writeSlide(sharp(srcPath), outName, position, fit);
      slideIndex++;
      continue;
    }

    const { rows, cols } = grid;
    if (!meta.width || !meta.height) {
      console.error(`⚠️  無法讀取 ${file} 的尺寸，略過`);
      continue;
    }
    if (rowPx && rowPx.length !== rows) {
      console.error(`❌ --rows 給了 ${rowPx.length} 個值，但 --grid 說有 ${rows} 列，數量要一致`);
      process.exit(1);
    }
    if (colPx && colPx.length !== cols) {
      console.error(`❌ --cols 給了 ${colPx.length} 個值，但 --grid 說有 ${cols} 欄，數量要一致`);
      process.exit(1);
    }
    const rowBounds = rowPx ? cumulativeBoundaries(rowPx) : evenBoundaries(rows, meta.height);
    const colBounds = colPx ? cumulativeBoundaries(colPx) : evenBoundaries(cols, meta.width);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const left = colBounds[c];
        const top = rowBounds[r];
        const width = colBounds[c + 1] - left;
        const height = rowBounds[r + 1] - top;
        const panel = sharp(srcPath).extract({ left, top, width, height });
        const outName =
          String(slideIndex).padStart(2, '0') + '-' + baseName.replace(/[^a-zA-Z0-9-]+/g, '-') + `-r${r + 1}c${c + 1}`;
        await writeSlide(panel, outName, position, fit);
        slideIndex++;
      }
    }
  }

  console.log('');
  console.log(`🎉 完成，共輸出 ${slideIndex - 1} 張，位於 carousel-shots/ready/`);
  console.log(`   接著登入管理員帳號 → /carousel → 依想要的順序依序上傳即可。`);
}

main().catch((err) => {
  console.error('❌ 執行失敗：', err);
  process.exit(1);
});
