const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

test('auth library import', async () => {
  const auth = require('../lib/auth');
  assert.ok(auth);
  assert.ok(auth.AuthService);
  assert.ok(typeof auth.AuthService === 'function');
});

test('logger library import', async () => {
  const Logger = require('../lib/logger');
  assert.ok(Logger);
  assert.ok(Logger.Logger);
  assert.ok(typeof Logger.Logger === 'function');
});

test('security library import', async () => {
  const security = require('../lib/security');
  assert.ok(security);
  assert.ok(security.rateLimits);
  assert.ok(security.validationRules);
});
