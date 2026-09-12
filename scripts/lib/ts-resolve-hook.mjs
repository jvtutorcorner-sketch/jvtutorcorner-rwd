// scripts/lib/ts-resolve-hook.mjs
//
// ESM resolve hook so plain `node` can run the scripts that import lib/*.ts.
// Node strips TypeScript types natively (v22.6+), but lib/ uses extensionless
// relative imports (`import ... from './dynamo'`), which Node ESM refuses to
// resolve. This retries a failed relative specifier with `.ts` appended.
//
// Usage:
//   node --import ./scripts/lib/ts-resolve-hook.mjs scripts/verify-b2b-seat-membership.mjs
//   node --import ./scripts/lib/ts-resolve-hook.mjs scripts/repair-b2b-data.mjs [--apply]
//
// `@/` path aliases are NOT handled; modules loaded this way must use relative imports.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (err) {
          const relative = specifier.startsWith('./') || specifier.startsWith('../');
          if (err?.code === 'ERR_MODULE_NOT_FOUND' && relative && !/\\.[cm]?[jt]s$/.test(specifier)) {
            return next(specifier + '.ts', context);
          }
          throw err;
        }
      }
    `)
);
