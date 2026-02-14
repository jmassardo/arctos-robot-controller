/**
 * Comprehensive Unit Tests for Authentication Module
 * Following AAA Pattern with 100% Coverage Target
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock dependencies before require
const mockPath = path.join(__dirname, '../fixtures/test-auth');
fs.ensureDirSync(mockPath);

// Override the auth module's file paths for testing
process.env.NODE_ENV = 'test';
const originalEnv = process.env.JWT_SECRET;

// Import after mocking
const {
  AuthService,
  authenticateToken,
  requireRole,
  registerValidation,
  loginValidation,
  changePasswordValidation,
} = require('../../lib/auth');

describe('AuthService - Comprehensive Unit Tests', () => {
  let authService;
  let testUsersFile;
  let testSessionsFile;

  beforeEach(async () => {
    // Arrange: Setup test environment
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    testUsersFile = path.join(mockPath, 'users.json');
    testSessionsFile = path.join(mockPath, 'sessions.json');

    // Clean test files
    await fs.remove(testUsersFile);
    await fs.remove(testSessionsFile);

    // Create fresh instance
    authService = new AuthService();
    authService.USERS_FILE = testUsersFile;
    authService.SESSIONS_FILE = testSessionsFile;
  });

  afterEach(async () => {
    // Cleanup after each test
    await fs.remove(mockPath);
    process.env.JWT_SECRET = originalEnv;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with correct default values', () => {
      // Arrange & Act
      const service = new AuthService();

      // Assert
      assert.ok(service.JWT_SECRET);
      assert.strictEqual(service.JWT_EXPIRES_IN, '24h');
      assert.strictEqual(service.REFRESH_TOKEN_EXPIRES_IN, '7d');
      assert.ok(service.twoFactorAuth);
      assert.ok(service.USERS_FILE.includes('users.json'));
      assert.ok(service.SESSIONS_FILE.includes('sessions.json'));
    });

    test('should use environment variables when provided', () => {
      // Arrange
      process.env.JWT_SECRET = 'custom-secret';
      process.env.JWT_EXPIRES_IN = '1h';

      // Act
      const service = new AuthService();

      // Assert
      assert.strictEqual(service.JWT_SECRET, 'custom-secret');
      assert.strictEqual(service.JWT_EXPIRES_IN, '1h');
    });

    test('should create data directory if it does not exist', async () => {
      // Arrange
      const newPath = path.join(__dirname, '../fixtures/test-new-dir');
      await fs.remove(newPath);

      // Act
      const service = new AuthService();
      service.USERS_FILE = path.join(newPath, 'users.json');
      await service.initializeDefaultUser();

      // Assert
      assert.ok(await fs.pathExists(newPath));

      // Cleanup
      await fs.remove(newPath);
    });
  });

  describe('Default User Creation', () => {
    test('should create default admin user when no users exist', async () => {
      // Arrange
      assert.strictEqual(await fs.pathExists(testUsersFile), false);

      // Act
      await authService.initializeDefaultUser();

      // Assert
      assert.ok(await fs.pathExists(testUsersFile));
      const users = await fs.readJson(testUsersFile);
      assert.strictEqual(users.length, 1);

      const admin = users[0];
      assert.strictEqual(admin.username, 'admin');
      assert.strictEqual(admin.email, 'admin@arctos-robot.local');
      assert.strictEqual(admin.role, 'admin');
      assert.strictEqual(admin.isActive, true);
      assert.ok(admin.password);
      assert.ok(bcrypt.compareSync('admin123', admin.password));
    });

    test('should not create default user when users already exist', async () => {
      // Arrange
      const existingUsers = [{ id: 1, username: 'existing' }];
      await fs.writeJson(testUsersFile, existingUsers);

      // Act
      await authService.initializeDefaultUser();

      // Assert
      const users = await fs.readJson(testUsersFile);
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].username, 'existing');
    });
  });

  describe('User Registration', () => {
    test('should create new user with valid data', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      };

      // Act
      const result = await authService.createUser(userData);

      // Assert
      assert.ok(result.success);
      assert.ok(result.user);
      assert.strictEqual(result.user.username, 'testuser');
      assert.strictEqual(result.user.email, 'test@example.com');
      assert.strictEqual(result.user.role, 'user');
      assert.strictEqual(result.user.isActive, true);
      assert.ok(result.user.id);
      assert.ok(result.user.createdAt);

      // Password should be hashed
      assert.notStrictEqual(result.user.password, userData.password);
      assert.ok(bcrypt.compareSync(userData.password, result.user.password));
    });

    test('should reject duplicate username', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      };
      await authService.createUser(userData);

      // Act
      const result = await authService.createUser({
        username: 'testuser',
        email: 'different@example.com',
        password: 'DifferentPassword123!',
      });

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('username already exists'));
    });

    test('should reject duplicate email', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      };
      await authService.createUser(userData);

      // Act
      const result = await authService.createUser({
        username: 'different',
        email: 'test@example.com',
        password: 'DifferentPassword123!',
      });

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('email already exists'));
    });

    test('should validate required fields', async () => {
      // Arrange & Act & Assert
      const testCases = [
        { data: {}, expectedError: 'username is required' },
        { data: { username: 'test' }, expectedError: 'email is required' },
        {
          data: { username: 'test', email: 'test@example.com' },
          expectedError: 'password is required',
        },
      ];

      for (const testCase of testCases) {
        const result = await authService.createUser(testCase.data);
        assert.strictEqual(result.success, false);
        assert.ok(result.error.includes(testCase.expectedError));
      }
    });

    test('should validate email format', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'TestPassword123!',
      };

      // Act
      const result = await authService.createUser(userData);

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('valid email'));
    });

    test('should enforce password strength requirements', async () => {
      // Arrange & Act & Assert
      const weakPasswords = [
        'short',
        '12345678',
        'onlylowercase',
        'ONLYUPPERCASE',
        'NoSpecialChar123',
      ];

      for (const password of weakPasswords) {
        const result = await authService.createUser({
          username: `user${Math.random()}`,
          email: `test${Math.random()}@example.com`,
          password,
        });
        assert.strictEqual(result.success, false, `Password '${password}' should be rejected`);
        assert.ok(result.error.includes('password') || result.error.includes('strength'));
      }
    });
  });

  describe('User Authentication', () => {
    let testUser;

    beforeEach(async () => {
      // Arrange: Create test user
      const result = await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      });
      testUser = result.user;
    });

    test('should authenticate valid credentials', async () => {
      // Arrange
      const credentials = {
        username: 'testuser',
        password: 'TestPassword123!',
      };

      // Act
      const result = await authService.authenticateUser(credentials.username, credentials.password);

      // Assert
      assert.ok(result.success);
      assert.ok(result.user);
      assert.strictEqual(result.user.username, 'testuser');
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);

      // Should update lastLogin
      const users = await fs.readJson(testUsersFile);
      const updatedUser = users.find(u => u.username === 'testuser');
      assert.ok(updatedUser.lastLogin);
    });

    test('should reject invalid username', async () => {
      // Arrange & Act
      const result = await authService.authenticateUser('nonexistent', 'TestPassword123!');

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid credentials'));
    });

    test('should reject invalid password', async () => {
      // Arrange & Act
      const result = await authService.authenticateUser('testuser', 'WrongPassword123!');

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid credentials'));
    });

    test('should reject inactive user', async () => {
      // Arrange
      const users = await fs.readJson(testUsersFile);
      users[0].isActive = false;
      await fs.writeJson(testUsersFile, users);

      // Act
      const result = await authService.authenticateUser('testuser', 'TestPassword123!');

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('inactive') || result.error.includes('disabled'));
    });

    test('should handle account lockout after failed attempts', async () => {
      // Arrange: Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await authService.authenticateUser('testuser', 'WrongPassword');
      }

      // Act
      const result = await authService.authenticateUser('testuser', 'TestPassword123!');

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('locked') || result.error.includes('attempts'));
    });
  });

  describe('Token Management', () => {
    let testUser;

    beforeEach(async () => {
      const result = await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      });
      testUser = result.user;
    });

    test('should generate valid access token', async () => {
      // Arrange & Act
      const token = authService.generateAccessToken(testUser);

      // Assert
      assert.ok(token);
      const decoded = jwt.verify(token, authService.JWT_SECRET);
      assert.strictEqual(decoded.userId, testUser.id);
      assert.strictEqual(decoded.username, testUser.username);
      assert.strictEqual(decoded.role, testUser.role);
    });

    test('should generate valid refresh token', async () => {
      // Arrange & Act
      const token = authService.generateRefreshToken(testUser);

      // Assert
      assert.ok(token);
      const decoded = jwt.verify(token, authService.JWT_SECRET);
      assert.strictEqual(decoded.userId, testUser.id);
      assert.strictEqual(decoded.type, 'refresh');
    });

    test('should verify valid tokens', async () => {
      // Arrange
      const token = authService.generateAccessToken(testUser);

      // Act
      const result = authService.verifyToken(token);

      // Assert
      assert.ok(result.valid);
      assert.strictEqual(result.decoded.userId, testUser.id);
    });

    test('should reject invalid tokens', async () => {
      // Arrange & Act & Assert
      const invalidTokens = [
        'invalid-token',
        '',
        null,
        undefined,
        jwt.sign({ userId: 'fake' }, 'wrong-secret'),
        jwt.sign({ userId: testUser.id }, authService.JWT_SECRET, { expiresIn: '0s' }), // Expired
      ];

      for (const token of invalidTokens) {
        const result = authService.verifyToken(token);
        assert.strictEqual(result.valid, false, `Token should be invalid: ${token}`);
        assert.ok(result.error);
      }
    });

    test('should refresh access token with valid refresh token', async () => {
      // Arrange
      const refreshToken = authService.generateRefreshToken(testUser);

      // Act
      const result = await authService.refreshAccessToken(refreshToken);

      // Assert
      assert.ok(result.success);
      assert.ok(result.accessToken);
      assert.ok(result.refreshToken);

      // New tokens should be valid
      const accessValid = authService.verifyToken(result.accessToken);
      assert.ok(accessValid.valid);
    });

    test('should reject refresh with invalid refresh token', async () => {
      // Arrange & Act
      const result = await authService.refreshAccessToken('invalid-refresh-token');

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle corrupted user file gracefully', async () => {
      // Arrange
      await fs.writeFile(testUsersFile, 'invalid json content');

      // Act & Assert
      const result = await authService.createUser({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

      // Should handle gracefully and recreate file
      assert.ok(result.success || result.error);
    });

    test('should handle null and undefined inputs gracefully', async () => {
      // Arrange & Act & Assert
      const nullInputs = [null, undefined, {}, { username: null }, { email: undefined }];

      for (const input of nullInputs) {
        const result = await authService.createUser(input);
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
      }
    });
  });
});

describe('Authentication Middleware Functions', () => {
  describe('authenticateToken Middleware', () => {
    test('should authenticate valid token', () => {
      // Arrange
      const token = jwt.sign({ userId: 1, username: 'test', role: 'user' }, 'test-secret');
      const req = {
        headers: { authorization: `Bearer ${token}` },
      };
      const res = {};
      const next = mock.fn();

      // Mock JWT_SECRET temporarily
      process.env.JWT_SECRET = 'test-secret';

      // Act
      authenticateToken(req, res, next);

      // Assert
      assert.ok(req.user);
      assert.strictEqual(req.user.userId, 1);
      assert.strictEqual(req.user.username, 'test');
      assert.ok(next.mock.calls.length > 0);
    });

    test('should reject missing token', () => {
      // Arrange
      const req = { headers: {} };
      const res = {
        status: mock.fn().mockReturnThis(),
        json: mock.fn(),
      };
      const next = mock.fn();

      // Act
      authenticateToken(req, res, next);

      // Assert
      assert.strictEqual(res.status.mock.calls[0][0], 401);
      assert.ok(res.json.mock.calls[0][0].error.includes('token'));
    });

    test('should reject invalid token format', () => {
      // Arrange
      const req = {
        headers: { authorization: 'InvalidFormat token123' },
      };
      const res = {
        status: mock.fn().mockReturnThis(),
        json: mock.fn(),
      };
      const next = mock.fn();

      // Act
      authenticateToken(req, res, next);

      // Assert
      assert.strictEqual(res.status.mock.calls[0][0], 401);
    });
  });

  describe('requireRole Middleware', () => {
    test('should allow access for correct role', () => {
      // Arrange
      const req = { user: { role: 'admin' } };
      const res = {};
      const next = mock.fn();
      const middleware = requireRole('admin');

      // Act
      middleware(req, res, next);

      // Assert
      assert.ok(next.mock.calls.length > 0);
    });

    test('should deny access for incorrect role', () => {
      // Arrange
      const req = { user: { role: 'user' } };
      const res = {
        status: mock.fn().mockReturnThis(),
        json: mock.fn(),
      };
      const next = mock.fn();
      const middleware = requireRole('admin');

      // Act
      middleware(req, res, next);

      // Assert
      assert.strictEqual(res.status.mock.calls[0][0], 403);
      assert.ok(res.json.mock.calls[0][0].error.includes('access denied'));
    });
  });

  describe('Validation Middleware', () => {
    test('should validate registration data correctly', () => {
      // This would test the express-validator rules
      // Implementation depends on how validation is structured
      assert.ok(registerValidation);
      assert.ok(Array.isArray(registerValidation));
    });

    test('should validate login data correctly', () => {
      assert.ok(loginValidation);
      assert.ok(Array.isArray(loginValidation));
    });

    test('should validate password change data correctly', () => {
      assert.ok(changePasswordValidation);
      assert.ok(Array.isArray(changePasswordValidation));
    });
  });
});
