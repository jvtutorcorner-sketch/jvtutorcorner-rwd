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

async function isProjectRoot(dir: string) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    await fs.access(pkgPath);
    return true;
  } catch (e) {
    return false;
  }
}

export async function resolveDataFile(filename: string) {
  const candidates: string[] = [];
  if (process.env.LOCAL_DATA_DIR) candidates.push(path.resolve(process.env.LOCAL_DATA_DIR));
  
  // Try to find project root by looking for package.json
  let currentDir = process.cwd();
  for (let i = 0; i < 10; i++) { // Navigate up to 10 levels
    if (await isProjectRoot(currentDir)) {
      candidates.push(path.join(currentDir, '.local_data'));
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // Reached system root
    currentDir = parent;
  }
  
  // fallback candidates if package.json not found...
  candidates.push(path.resolve(process.cwd(), '.local_data'));
  // fallback to OS temp
  candidates.push(path.join(os.tmpdir(), 'jvtutorcorner', '.local_data'));

  console.log('[resolveDataFile] cwd:', process.cwd(), 'candidates:', candidates);
  
  for (const dir of candidates) {
    console.log('[resolveDataFile] trying dir:', dir);
    if (await tryMakeDir(dir)) {
      const fullPath = path.join(dir, filename);
      console.log('[resolveDataFile] using dir:', dir, 'fullPath:', fullPath);
      return fullPath;
    }
  }

  // last resort: return project-local path (may fail on write)
  const fallback = path.resolve(process.cwd(), '.local_data', filename);
  console.log('[resolveDataFile] fallback:', fallback);
  return fallback;
}

export default resolveDataFile;
