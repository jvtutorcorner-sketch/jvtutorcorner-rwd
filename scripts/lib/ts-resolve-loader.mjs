// Node ESM resolve hook that closes two gaps between this repo's TS source
// (written for Next.js/webpack's bundler-style resolution) and plain Node ESM
// resolution, so lib/*.ts files can run standalone for verification scripts:
//
//  1. Extensionless imports (`import { x } from './dynamo'`, or a bare
//     specifier like `next/server` whose package.json has no "exports" map —
//     Node's own error for that one suggests "next/server.js") — retried with
//     .ts/.tsx/.mjs/.js appended.
//  2. The `@/*` -> `<project root>/*` path alias from tsconfig.json's
//     "paths" (e.g. `import x from '@/lib/profilesService'`) — rewritten to a
//     file URL under the project root before the extension retry above.
//
// Node's native TypeScript type-stripping (unflagged since ~v23.6) already
// handles the .ts syntax fine; only resolution needs help.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const aliasedUrl = pathToFileURL(resolvePath(PROJECT_ROOT, specifier.slice(2))).href;
    return resolve(aliasedUrl, context, nextResolve);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') {
      for (const ext of CANDIDATE_EXTENSIONS) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {
          // try next extension
        }
      }
    }
    // Directory import (`./registry` -> `./registry/index.ts`): Node reports a
    // distinct error code, so retry the directory's index file per extension.
    if (err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      const base = specifier.endsWith('/') ? specifier : specifier + '/';
      for (const ext of CANDIDATE_EXTENSIONS) {
        try {
          return await nextResolve(base + 'index' + ext, context);
        } catch {
          // try next extension
        }
      }
    }
    throw err;
  }
}
