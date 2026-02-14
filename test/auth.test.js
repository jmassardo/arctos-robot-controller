const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Import our authentication service
const { AuthService } = require('../lib/auth');

// Mock user data
const mockUsers = {
  testUser: {
    id: 1,
    username: 'testUser',
    password: '$2b$10$example.hash.here', // bcrypt hash for 'password123'
    role: 'operator',
    email: 'test@example.com',
    isActive: true,
    loginAttempts: 0,
    lastLogin: null,
    createdAt: new Date().toISOString(),
  },
  adminUser: {
    id: 2,
    username: 'adminUser',
    password: '$2b$10$another.hash.here',
    role: 'admin',
    email: 'admin@example.com',
    isActive: true,
    loginAttempts: 0,
    lastLogin: null,
    createdAt: new Date().toISOString(),
  },
};

test('AuthService - User Management', async t => {
  // Setup test environment
  const testDataDir = path.join(__dirname, 'test-data');
  await fs.ensureDir(testDataDir);
  const authService = new AuthService(testDataDir);

  await t.test('should create new user', async () => {
    const userData = {
      username: 'newuser',
      password: 'password123',
      email: 'newuser@example.com',
      role: 'viewer',
    };

    const result = await authService.createUser(userData);
    assert.ok(result.success);
    assert.strictEqual(result.user.username, 'newuser');
    assert.strictEqual(result.user.role, 'viewer');
    assert.ok(result.user.id);
  });

  await t.test('should not create user with existing username', async () => {
    const userData = {
      username: 'newuser', // Same as above
      password: 'different123',
      email: 'different@example.com',
      role: 'operator',
    };

    const result = await authService.createUser(userData);
    assert.ok(!result.success);
    assert.ok(result.error.includes('already exists'));
  });

  await t.test('should validate user data', async () => {
    const invalidUserData = {
      username: 'u', // Too short
      password: '123', // Too short
      email: 'invalid-email',
      role: 'invalid-role',
    };

    const result = await authService.createUser(invalidUserData);
    assert.ok(!result.success);
    assert.ok(result.error);
  });

  await t.test('should get user by username', async () => {
    const user = await authService.getUserByUsername('newuser');
    assert.ok(user);
    assert.strictEqual(user.username, 'newuser');
  });

  await t.test('should update user', async () => {
    const updates = {
      email: 'updated@example.com',
      role: 'operator',
    };

    const result = await authService.updateUser('newuser', updates);
    assert.ok(result.success);
    assert.strictEqual(result.user.email, 'updated@example.com');
    assert.strictEqual(result.user.role, 'operator');
  });

  await t.test('should delete user', async () => {
    const result = await authService.deleteUser('newuser');
    assert.ok(result.success);

    const deletedUser = await authService.getUserByUsername('newuser');
    assert.ok(!deletedUser);
  });

  // Cleanup
  await fs.remove(testDataDir);
});

test('AuthService - Authentication', async t => {
  const testDataDir = path.join(__dirname, 'test-data-auth');
  await fs.ensureDir(testDataDir);
  const authService = new AuthService(testDataDir);

  // Create test user
  await authService.createUser({
    username: 'testauth',
    password: 'password123',
    email: 'testauth@example.com',
    role: 'operator',
  });

  await t.test('should login with valid credentials', async () => {
    const result = await authService.login('testauth', 'password123', '127.0.0.1');
    assert.ok(result.success);
    assert.ok(result.accessToken);
    assert.ok(result.refreshToken);
    assert.strictEqual(result.user.username, 'testauth');
  });

  await t.test('should not login with invalid password', async () => {
    const result = await authService.login('testauth', 'wrongpassword', '127.0.0.1');
    assert.ok(!result.success);
    assert.ok(result.error);
  });

  await t.test('should not login with nonexistent user', async () => {
    const result = await authService.login('nonexistent', 'password123', '127.0.0.1');
    assert.ok(!result.success);
    assert.ok(result.error);
  });

  await t.test('should handle account lockout after failed attempts', async () => {
    // Create a new user for lockout test
    await authService.createUser({
      username: 'lockouttest',
      password: 'password123',
      email: 'lockout@example.com',
      role: 'operator',
    });

    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await authService.login('lockouttest', 'wrongpassword', '127.0.0.1');
    }

    // 6th attempt should be locked
    const result = await authService.login('lockouttest', 'wrongpassword', '127.0.0.1');
    assert.ok(!result.success);
    assert.ok(result.error.includes('locked'));
  });

  await t.test('should verify JWT tokens', async () => {
    const loginResult = await authService.login('testauth', 'password123', '127.0.0.1');
    const token = loginResult.accessToken;

    const verifyResult = authService.verifyToken(token);
    assert.ok(verifyResult.valid);
    assert.strictEqual(verifyResult.decoded.username, 'testauth');
  });

  await t.test('should not verify invalid tokens', async () => {
    const invalidToken = 'invalid.token.here';
    const verifyResult = authService.verifyToken(invalidToken);
    assert.ok(!verifyResult.valid);
    assert.ok(verifyResult.error);
  });

  await t.test('should refresh tokens', async () => {
    const loginResult = await authService.login('testauth', 'password123', '127.0.0.1');
    const refreshToken = loginResult.refreshToken;

    const refreshResult = await authService.refreshToken(refreshToken);
    assert.ok(refreshResult.success);
    assert.ok(refreshResult.accessToken);
    assert.ok(refreshResult.refreshToken);
  });

  await t.test('should logout and invalidate tokens', async () => {
    const loginResult = await authService.login('testauth', 'password123', '127.0.0.1');
    const refreshToken = loginResult.refreshToken;

    const logoutResult = await authService.logout(refreshToken);
    assert.ok(logoutResult.success);

    // Try to use the refresh token - should fail
    const refreshResult = await authService.refreshToken(refreshToken);
    assert.ok(!refreshResult.success);
  });

  // Cleanup
  await fs.remove(testDataDir);
});

test('AuthService - Password Security', async t => {
  const testDataDir = path.join(__dirname, 'test-data-password');
  await fs.ensureDir(testDataDir);
  const authService = new AuthService(testDataDir);

  await t.test('should hash passwords securely', async () => {
    const password = 'testpassword123';
    const hashedPassword = await authService.hashPassword(password);

    assert.ok(hashedPassword);
    assert.ok(hashedPassword.startsWith('$2b$'));
    assert.notStrictEqual(hashedPassword, password);
  });

  await t.test('should verify passwords correctly', async () => {
    const password = 'testpassword123';
    const hashedPassword = await authService.hashPassword(password);

    const isValid = await authService.verifyPassword(password, hashedPassword);
    assert.ok(isValid);

    const isInvalid = await authService.verifyPassword('wrongpassword', hashedPassword);
    assert.ok(!isInvalid);
  });

  await t.test('should enforce password strength', () => {
    const weakPasswords = ['123', 'password', 'abc', '12345678'];
    const strongPasswords = ['Password123!', 'MyStr0ngP@ssw0rd', 'C0mpl3x!P@ssw0rd'];

    weakPasswords.forEach(pwd => {
      const result = authService.validatePasswordStrength(pwd);
      assert.ok(!result.valid, `${pwd} should be invalid`);
    });

    strongPasswords.forEach(pwd => {
      const result = authService.validatePasswordStrength(pwd);
      assert.ok(result.valid, `${pwd} should be valid`);
    });
  });

  // Cleanup
  await fs.remove(testDataDir);
});

test('AuthService - Role-Based Access Control', async t => {
  const testDataDir = path.join(__dirname, 'test-data-rbac');
  await fs.ensureDir(testDataDir);
  const authService = new AuthService(testDataDir);

  await t.test('should check role permissions correctly', () => {
    const adminPermissions = authService.getRolePermissions('admin');
    const operatorPermissions = authService.getRolePermissions('operator');
    const viewerPermissions = authService.getRolePermissions('viewer');

    // Admin should have all permissions
    assert.ok(adminPermissions.includes('users:create'));
    assert.ok(adminPermissions.includes('robot:control'));
    assert.ok(adminPermissions.includes('config:write'));

    // Operator should have robot control but not user management
    assert.ok(operatorPermissions.includes('robot:control'));
    assert.ok(!operatorPermissions.includes('users:create'));

    // Viewer should only have read permissions
    assert.ok(viewerPermissions.includes('robot:read'));
    assert.ok(!viewerPermissions.includes('robot:control'));
    assert.ok(!viewerPermissions.includes('users:create'));
  });

  await t.test('should validate role hierarchy', () => {
    assert.ok(authService.hasPermission('admin', 'users:create'));
    assert.ok(authService.hasPermission('admin', 'robot:control'));
    assert.ok(authService.hasPermission('operator', 'robot:control'));
    assert.ok(!authService.hasPermission('operator', 'users:create'));
    assert.ok(!authService.hasPermission('viewer', 'robot:control'));
  });

  // Cleanup
  await fs.remove(testDataDir);
});

test('AuthService - Session Management', async t => {
  const testDataDir = path.join(__dirname, 'test-data-session');
  await fs.ensureDir(testDataDir);
  const authService = new AuthService(testDataDir);

  // Create test user
  await authService.createUser({
    username: 'sessiontest',
    password: 'password123',
    email: 'session@example.com',
    role: 'operator',
  });

  await t.test('should create and track sessions', async () => {
    const result = await authService.login('sessiontest', 'password123', '127.0.0.1');
    assert.ok(result.success);

    const sessions = authService.getActiveSessions('sessiontest');
    assert.ok(sessions.length > 0);
  });

  await t.test('should handle concurrent sessions', async () => {
    // Login from multiple IPs
    await authService.login('sessiontest', 'password123', '192.168.1.100');
    await authService.login('sessiontest', 'password123', '192.168.1.101');

    const sessions = authService.getActiveSessions('sessiontest');
    assert.ok(sessions.length >= 2);
  });

  await t.test('should cleanup expired sessions', async () => {
    // This would require more complex timing tests
    // For now, just verify the cleanup method exists
    assert.ok(typeof authService.cleanupExpiredSessions === 'function');
  });

  // Cleanup
  await fs.remove(testDataDir);
});
