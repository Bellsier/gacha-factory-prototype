#!/usr/bin/env node
'use strict';
/**
 * Regression test suite for 채굴 공방 (gacha-factory-prototype).
 *
 * The suite is split into tests/chunks/*.js so GitHub file writes stay
 * within MCP size limits. Concatenating those chunks in order recreates
 * the original single-file suite. This loader evaluates that source with
 * __dirname set to tests/, matching the previous harness paths.
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
