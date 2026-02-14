const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Import our authentication service
const { AuthService } = require('../lib/auth');

test('AuthService - Fixed Unit Tests', async t => {
  // Use unique test data directory for each test run
  const testDataDir = path.join(__dirname, 'test-data-auth-fixed');

  await t.beforeEach(async () => {
    // Clean up test directory before each test
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);
  });

  await t.test('should create new user successfully', async () => {
    const authService = new AuthService();
    // Override file paths to use test directory
    authService.USERS_FILE = path.join(testDataDir, 'users.json');

    const userData = {
      username: 'testuser_' + Date.now(),
      password: 'password123',
      email: 'testuser_' + Date.now() + '@example.com',
      role: 'viewer',
    };

    const result = await authService.createUser(userData);

    assert.ok(result);
    assert.strictEqual(result.username, userData.username);
    assert.strictEqual(result.role, userData.role);
    assert.ok(!result.password, 'Password should not be returned');
  });

  await t.test('should reject duplicate usernames', async () => {
    const authService = new AuthService();
    authService.USERS_FILE = path.join(testDataDir, 'users.json');

    const userData = {
      username: 'duplicate_user',
      password: 'password123',
      email: 'test@example.com',
      role: 'viewer',
    };

    // Create first user
    await authService.createUser(userData);

    // Try to create duplicate
    await assert.rejects(
      async () => await authService.createUser({ ...userData, email: 'different@example.com' }),
      { message: 'Username or email already exists' }
    );
  });

  await t.test('should authenticate valid credentials', async () => {
    const authService = new AuthService();
    authService.USERS_FILE = path.join(testDataDir, 'users.json');
    authService.SESSIONS_FILE = path.join(testDataDir, 'sessions.json');

    const userData = {
      username: 'authtest_' + Date.now(),
      password: 'password123',
      email: 'authtest_' + Date.now() + '@example.com',
      role: 'operator',
    };

    // Create user
    await authService.createUser(userData);

    // Test authentication
    const result = await authService.authenticateUser(userData.username, userData.password);
    assert.ok(result.success);
    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);
    assert.strictEqual(result.user.username, userData.username);
  });

  await t.test('should reject invalid credentials', async () => {
    const authService = new AuthService();
    authService.USERS_FILE = path.join(testDataDir, 'users.json');

    const userData = {
      username: 'invalidtest_' + Date.now(),
      password: 'password123',
      email: 'invalidtest_' + Date.now() + '@example.com',
      role: 'operator',
    };

    // Create user
    await authService.createUser(userData);

    // Test with wrong password
    const result = await authService.authenticateUser(userData.username, 'wrongpassword');
    assert.ok(!result.success);
    assert.strictEqual(result.message, 'Invalid credentials');
  });

  await t.afterEach(async () => {
    // Clean up test directory after each test
    await fs.remove(testDataDir).catch(() => {});
  });
});

test('AuthService - Token Management', async t => {
  const testDataDir = path.join(__dirname, 'test-data-auth-tokens');

  await t.beforeEach(async () => {
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);
  });

  await t.test('should verify valid access tokens', async () => {
    const authService = new AuthService();
    authService.USERS_FILE = path.join(testDataDir, 'users.json');
    authService.SESSIONS_FILE = path.join(testDataDir, 'sessions.json');

    const userData = {
      username: 'tokentest_' + Date.now(),
      password: 'password123',
      email: 'tokentest_' + Date.now() + '@example.com',
      role: 'operator',
    };

    // Create user and get tokens
    await authService.createUser(userData);
    const authResult = await authService.authenticateUser(userData.username, userData.password);

    // Verify token
    const verifyResult = authService.verifyAccessToken(authResult.accessToken);
    assert.ok(verifyResult.success);
    assert.strictEqual(verifyResult.user.username, userData.username);
  });

  await t.test('should reject invalid tokens', async () => {
    const authService = new AuthService();

    const verifyResult = authService.verifyAccessToken('invalid.token.here');
    assert.ok(!verifyResult.success);
    assert.strictEqual(verifyResult.message, 'Invalid token');
  });

  await t.afterEach(async () => {
    await fs.remove(testDataDir).catch(() => {});
  });
});
