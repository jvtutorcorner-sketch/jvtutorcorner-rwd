// Registers ./ts-resolve-loader.mjs as a Node ESM loader hook.
// Usage: node --import ./scripts/lib/register-ts-resolve.mjs <script.mjs>
import { register } from 'node:module';

register('./ts-resolve-loader.mjs', import.meta.url);
