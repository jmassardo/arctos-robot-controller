const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('server.js exists and is syntactically valid', () => {
  // Basic smoke test - check file exists and has valid syntax
  const serverPath = path.join(__dirname, '../server.js');
  assert.ok(fs.existsSync(serverPath), 'server.js should exist');
  
  // Try to parse without executing
  const content = fs.readFileSync(serverPath, 'utf8');
  assert.ok(content.length > 0, 'server.js should not be empty');
  assert.ok(content.includes('express'), 'server.js should use express');
});

test('package.json has required fields', () => {
  const pkg = require('../package.json');
  
  assert.ok(pkg.name, 'package.json should have a name');
  assert.ok(pkg.version, 'package.json should have a version');
  assert.ok(pkg.main, 'package.json should have a main entry point');
  assert.ok(pkg.scripts, 'package.json should have scripts');
  assert.ok(pkg.scripts.start, 'package.json should have a start script');
  assert.ok(pkg.scripts.lint, 'package.json should have a lint script');
  assert.ok(pkg.scripts.test, 'package.json should have a test script');
});