#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const distMainPath = path.join(projectRoot, 'dist', 'main.js');
const envExamplePath = path.join(projectRoot, '.env.example');
const screepsConfigExamplePath = path.join(projectRoot, '.screeps.example.json');

const hasBuildOutput = fs.existsSync(distMainPath);

console.log('[Imperium] Deploy placeholder');
console.log('This script is intentionally non-destructive and does not upload code yet.');
console.log('Use it as the integration point for a future Screeps deployment workflow.');
console.log('');
console.log(`Build output present: ${hasBuildOutput ? 'yes' : 'no'}`);
console.log(`Environment template: ${envExamplePath}`);
console.log(`Deploy config template: ${screepsConfigExamplePath}`);
console.log('');
console.log(
  'Suggested next step: replace this placeholder with a real deployment adapter once branch, auth, and upload strategy are finalized.',
);
