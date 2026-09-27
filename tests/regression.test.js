#!/usr/bin/env node
'use strict';
/**
 * Regression test suite for 채굴 공방 (gacha-factory-prototype).
 *
 * The suite lives in tests/chunks/*.js (00.js, 01.js, …) and this file is
 * the npm test entry. Chunks are concatenated in filename order and run
 * with __dirname set to tests/.
 *
 * Run: npm test   (or)   node tests/regression.test.js
 */
const fs = require('fs');
const path = require('path');

const chunkDir = path.join(__dirname, 'chunks');
const files = fs.readdirSync(chunkDir).filter((f) => /^\d{2}\.js$/.test(f)).sort();
if (files.length === 0) {
  console.error('tests/chunks is empty');
  process.exit(2);
}
const src = files.map((f) => fs.readFileSync(path.join(chunkDir, f), 'utf8')).join('');
const code = src.replace(/^#![^\n]*\n/, '');
new Function(
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'process',
  'console',
  code
)(require, module, exports, __dirname, __filename, process, console);
