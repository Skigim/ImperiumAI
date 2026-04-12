import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { build } from 'esbuild';

const outFile = resolve('dist/main.js');

await rm(resolve('dist'), { recursive: true, force: true });
await mkdir(dirname(outFile), { recursive: true });

await build({
  entryPoints: [resolve('src/main.ts')],
  outfile: outFile,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  tsconfig: resolve('tsconfig.json'),
  legalComments: 'none',
  logLevel: 'info',
});