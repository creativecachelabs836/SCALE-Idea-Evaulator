/**
 * Module resolution hook for `node --test`.
 *
 * The source uses the `@/*` path alias and extensionless imports, both of which
 * the bundler resolves but Node's ESM loader does not. This hook teaches the
 * test runner the same two rules, so tests import application modules directly
 * with no build step and no test-framework dependency.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

function resolveOnDisk(absolute) {
  if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return absolute;

  for (const ext of EXTENSIONS) {
    const candidate = `${absolute}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = path.join(absolute, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `server-only` is a Next.js build-time guard with no runtime behaviour.
  // There is no client bundle under the test runner, so importing it is a no-op.
  if (specifier === 'server-only') {
    return {
      url: pathToFileURL(path.join(root, 'tests', 'stub-server-only.mjs')).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('@/')) {
    const found = resolveOnDisk(path.join(srcRoot, specifier.slice(2)));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : root;
    const found = resolveOnDisk(path.resolve(path.dirname(parentPath), specifier));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
