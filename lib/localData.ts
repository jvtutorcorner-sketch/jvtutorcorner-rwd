import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function tryMakeDir(dir: string) {
  try {
    await fs.mkdir(dir, { recursive: true });
    // try writing a tiny temp file to ensure writable
    const testFile = path.join(dir, '.writable_test');
    await fs.writeFile(testFile, 'ok', 'utf8');
    await fs.unlink(testFile);
    return true;
  } catch (e: any) {
    return false;
  }
}

export async function resolveDataFile(filename: string) {
  const candidates: string[] = [];
  if (process.env.LOCAL_DATA_DIR) candidates.push(path.resolve(process.env.LOCAL_DATA_DIR));
  // prefer project-local .local_data
  candidates.push(path.resolve(process.cwd(), '.local_data'));
  // fallback to OS temp
  candidates.push(path.join(os.tmpdir(), 'jvtutorcorner', '.local_data'));

  for (const dir of candidates) {
    if (await tryMakeDir(dir)) {
      return path.join(dir, filename);
    }
  }

  // last resort: return project-local path (may fail on write)
  return path.resolve(process.cwd(), '.local_data', filename);
}

export default resolveDataFile;
