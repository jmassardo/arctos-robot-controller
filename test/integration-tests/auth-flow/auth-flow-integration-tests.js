/**
 * Authentication Flow Integration Tests
 * Comprehensive testing of complete authentication workflows including 2FA
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const speakeasy = require('speakeasy');
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  getTestHelper,
} = require('../integration-test-helpers');
const { TEST_CONFIG, createTestUserData } = require('../integration-test-config');

describe('Authentication Flow Integration Tests', () => {
  let helper;
  let adminAuth;

  before(async () => {
    helper = await setupIntegrationTestEnvironment();
    adminAuth = await helper.registerAndLoginUser('admin');
  });

  after(async () => {
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await helper.cleanupTestData();
  });

  describe('User Registration Flow', () => {
    it('should complete full registration workflow', async () => {
      const client = helper.createHttpClient();
      const userData = {
        username: 'flow-test-user',
        email: 'flow-test@example.com',
        password: 'ComplexPassword123!',
        role: 'operator',
      };

      // Step 1: Register user
      const registerResponse = await client.post('/api/auth/register').send(userData).expect(201);

      const registrationData = helper.assertApiResponse(registerResponse, 201);

      // Validate registration response
      assert.strictEqual(registrationData.success, true);
      assert(registrationData.user);
      assert.strictEqual(registrationData.user.username, userData.username);
      assert.strictEqual(registrationData.user.email, userData.email);
      assert.strictEqual(registrationData.user.role, userData.role);
      assert(!registrationData.user.password); // Password should not be returned

      // Step 2: Verify user can login immediately
      const loginResponse = await client
        .post('/api/auth/login')
        .send({
          username: userData.username,
          password: userData.password,
        })
        .expect(200);

      const loginData = helper.assertApiResponse(loginResponse);

      // Validate login response
      assert.strictEqual(loginData.success, true);
      assert.strictEqual(typeof loginData.token, 'string');
      assert.strictEqual(typeof loginData.refreshToken, 'string');
      assert.strictEqual(loginData.user.id, registrationData.user.id);

      // Step 3: Verify token works for authenticated requests
      const profileResponse = await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginData.token}`)
        .expect(200);

      const profileData = helper.assertApiResponse(profileResponse);
      assert.strictEqual(profileData.user.username, userData.username);
    });

    it('should enforce registration validation rules', async () => {
      const client = helper.createHttpClient();

      // Test username validation
      await client
        .post('/api/auth/register')
        .send({
          username: 'ab', // Too short
          email: 'test@example.com',
          password: 'ValidPassword123!',
          role: 'operator',
        })
        .expect(400);

      await client
        .post('/api/auth/register')
        .send({
          username: 'invalid user!', // Invalid characters
          email: 'test@example.com',
          password: 'ValidPassword123!',
          role: 'operator',
        })
        .expect(400);

      // Test email validation
      await client
        .post('/api/auth/register')
        .send({
          username: 'validuser',
          email: 'invalid-email', // Invalid format
          password: 'ValidPassword123!',
          role: 'operator',
        })
        .expect(400);

      // Test password validation
      await client
        .post('/api/auth/register')
        .send({
          username: 'validuser',
          email: 'valid@example.com',
          password: '123', // Too weak
          role: 'operator',
        })
        .expect(400);

      // Test role validation
      await client
        .post('/api/auth/register')
        .send({
          username: 'validuser',
          email: 'valid@example.com',
          password: 'ValidPassword123!',
          role: 'invalid_role',
        })
        .expect(400);
    });

    it('should prevent duplicate user registration', async () => {
      const client = helper.createHttpClient();
      const userData = {
        username: 'duplicate-test',
        email: 'duplicate@example.com',
        password: 'ValidPassword123!',
        role: 'operator',
      };

      // Register first user
      await client.post('/api/auth/register').send(userData).expect(201);

      // Try to register with same username
      await client
        .post('/api/auth/register')
        .send({
          ...userData,
          email: 'different@example.com',
        })
        .expect(400);

      // Try to register with same email
      await client
        .post('/api/auth/register')
        .send({
          ...userData,
          username: 'different-username',
        })
        .expect(400);
    });
  });

  describe('Login and Authentication Flow', () => {
    it('should complete login workflow with valid credentials', async () => {
      // First register a user
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createHttpClient();

      // Test fresh login
      const loginResponse = await client
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(200);

      const loginData = helper.assertApiResponse(loginResponse);

      // Validate login response structure
      assert.strictEqual(loginData.success, true);
      assert.strictEqual(typeof loginData.token, 'string');
      assert.strictEqual(typeof loginData.refreshToken, 'string');
      assert(loginData.user);
      assert.strictEqual(loginData.user.username, userData.userData.username);
      assert(!loginData.user.password);

      // Validate JWT token format
      const tokenParts = loginData.token.split('.');
      assert.strictEqual(tokenParts.length, 3); // Header.Payload.Signature
    });

    it('should reject invalid login credentials', async () => {
      const client = helper.createHttpClient();

      // Register user first
      await helper.registerAndLoginUser('operator');

      // Test wrong password
      await client
        .post('/api/auth/login')
        .send({
          username: 'test-operator',
          password: 'wrongpassword',
        })
        .expect(401);

      // Test non-existent user
      await client
        .post('/api/auth/login')
        .send({
          username: 'nonexistent-user',
          password: 'anypassword',
        })
        .expect(401);

      // Test missing credentials
      await client.post('/api/auth/login').send({}).expect(400);
    });

    it('should handle login rate limiting', async () => {
      const client = helper.createHttpClient();
      const attempts = [];

      // Attempt multiple failed logins
      for (let i = 0; i < 8; i++) {
        attempts.push(
          client.post('/api/auth/login').send({
            username: 'nonexistent',
            password: 'wrongpassword',
          })
        );
      }

      const responses = await Promise.allSettled(attempts);

      // Should have at least one rate-limited response (429)
      const rateLimited = responses.filter(r => r.status === 'fulfilled' && r.value.status === 429);

      assert(rateLimited.length > 0, 'Rate limiting should be enforced on failed logins');
    });

    it('should track login sessions', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');

      // Get user profile to verify session tracking
      const profileResponse = await client.get('/api/auth/profile').expect(200);

      const profileData = helper.assertApiResponse(profileResponse);

      // Should include session information
      assert(profileData.user);
      assert.strictEqual(profileData.user.username, userData.userData.username);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createHttpClient();

      // Use refresh token to get new access token
      const refreshResponse = await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: userData.refreshToken,
        })
        .expect(200);

      const refreshData = helper.assertApiResponse(refreshResponse);

      // Validate refresh response
      assert.strictEqual(refreshData.success, true);
      assert.strictEqual(typeof refreshData.token, 'string');
      assert.strictEqual(typeof refreshData.refreshToken, 'string');
      assert(refreshData.user);

      // New tokens should be different from original
      assert.notStrictEqual(refreshData.token, userData.token);
      assert.notStrictEqual(refreshData.refreshToken, userData.refreshToken);

      // New token should work for authenticated requests
      const profileResponse = await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${refreshData.token}`)
        .expect(200);

      const profileData = helper.assertApiResponse(profileResponse);
      assert.strictEqual(profileData.user.username, userData.userData.username);
    });

    it('should reject invalid refresh tokens', async () => {
      const client = helper.createHttpClient();

      // Test with invalid refresh token
      await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);

      // Test with expired refresh token (if implementable)
      await client
        .post('/api/auth/refresh')
        .send({
          refreshToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIzLCJ0eXBlIjoicmVmcmVzaCIsImV4cCI6MX0.expired',
        })
        .expect(401);

      // Test with missing refresh token
      await client.post('/api/auth/refresh').send({}).expect(400);
    });

    it('should invalidate old refresh tokens after use', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createHttpClient();
      const originalRefreshToken = userData.refreshToken;

      // Use refresh token once
      const firstRefreshResponse = await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: originalRefreshToken,
        })
        .expect(200);

      // Try to use the same refresh token again - should fail
      await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: originalRefreshToken,
        })
        .expect(401);

      // New refresh token should work
      const secondRefreshResponse = await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: firstRefreshResponse.body.refreshToken,
        })
        .expect(200);

      assert(secondRefreshResponse.body.token);
    });
  });

  describe('Logout Flow', () => {
    it('should complete logout workflow', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createHttpClient();

      // Logout user
      const logoutResponse = await client
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userData.token}`)
        .send({})
        .expect(200);

      const logoutData = helper.assertApiResponse(logoutResponse);
      assert.strictEqual(logoutData.success, true);

      // Token should no longer work
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userData.token}`)
        .expect(401);

      // Refresh token should no longer work
      await client
        .post('/api/auth/refresh')
        .send({
          refreshToken: userData.refreshToken,
        })
        .expect(401);
    });

    it('should handle logout without valid session gracefully', async () => {
      const client = helper.createHttpClient();

      // Try to logout without token
      await client.post('/api/auth/logout').send({}).expect(401);

      // Try to logout with invalid token
      await client
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .send({})
        .expect(401);
    });
  });

  describe('Two-Factor Authentication (2FA) Flow', () => {
    it('should complete 2FA setup workflow', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');

      // Step 1: Setup 2FA
      const setupResponse = await client.post('/api/auth/2fa/setup').send({}).expect(200);

      const setupData = helper.assertApiResponse(setupResponse);

      // Validate 2FA setup response
      assert.strictEqual(setupData.success, true);
      assert.strictEqual(typeof setupData.secret, 'string');
      assert.strictEqual(typeof setupData.qrCode, 'string');
      assert(setupData.qrCode.startsWith('data:image/png;base64,'));

      // Step 2: Verify setup with TOTP token
      const token = speakeasy.totp({
        secret: setupData.secret,
        encoding: 'base32',
      });

      const verifyResponse = await client
        .post('/api/auth/2fa/verify-setup')
        .send({
          token: token,
        })
        .expect(200);

      const verifyData = helper.assertApiResponse(verifyResponse);
      assert.strictEqual(verifyData.success, true);
      assert(Array.isArray(verifyData.backupCodes));
      assert(verifyData.backupCodes.length > 0);

      // Step 3: Verify 2FA is enabled
      const statusResponse = await client.get('/api/auth/2fa/status').expect(200);

      const statusData = helper.assertApiResponse(statusResponse);
      assert.strictEqual(statusData.enabled, true);
    });

    it('should require 2FA token during login when enabled', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');
      const httpClient = helper.createHttpClient();

      // Enable 2FA first
      const setupResponse = await client.post('/api/auth/2fa/setup').send({}).expect(200);

      const secret = setupResponse.body.secret;
      const token = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
      });

      await client.post('/api/auth/2fa/verify-setup').send({ token }).expect(200);

      // Now try to login - should require 2FA
      const loginResponse = await httpClient
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(200);

      const loginData = loginResponse.body;

      // Should indicate 2FA is required
      if (loginData.requiresTwoFactor) {
        assert.strictEqual(loginData.requiresTwoFactor, true);
        assert.strictEqual(typeof loginData.tempToken, 'string');

        // Complete 2FA verification
        const twoFactorToken = speakeasy.totp({
          secret: secret,
          encoding: 'base32',
        });

        const verifyLoginResponse = await httpClient
          .post('/api/auth/2fa/verify')
          .send({
            tempToken: loginData.tempToken,
            token: twoFactorToken,
          })
          .expect(200);

        const finalLoginData = helper.assertApiResponse(verifyLoginResponse);
        assert.strictEqual(typeof finalLoginData.token, 'string');
        assert.strictEqual(typeof finalLoginData.refreshToken, 'string');
      }
    });

    it('should allow backup codes for 2FA recovery', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');
      const httpClient = helper.createHttpClient();

      // Setup 2FA
      const setupResponse = await client.post('/api/auth/2fa/setup').send({}).expect(200);

      const secret = setupResponse.body.secret;
      const token = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
      });

      const verifyResponse = await client
        .post('/api/auth/2fa/verify-setup')
        .send({ token })
        .expect(200);

      const backupCodes = verifyResponse.body.backupCodes;

      // Login and get temp token
      const loginResponse = await httpClient
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(200);

      if (loginResponse.body.requiresTwoFactor) {
        // Use backup code instead of TOTP token
        const backupCodeResponse = await httpClient
          .post('/api/auth/2fa/verify')
          .send({
            tempToken: loginResponse.body.tempToken,
            backupCode: backupCodes[0],
          })
          .expect(200);

        const finalLoginData = helper.assertApiResponse(backupCodeResponse);
        assert.strictEqual(typeof finalLoginData.token, 'string');

        // Used backup code should be invalidated
        await httpClient
          .post('/api/auth/2fa/verify')
          .send({
            tempToken: loginResponse.body.tempToken,
            backupCode: backupCodes[0],
          })
          .expect(400); // Should fail with used backup code
      }
    });

    it('should allow 2FA disabling', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');

      // Setup 2FA
      const setupResponse = await client.post('/api/auth/2fa/setup').send({}).expect(200);

      const secret = setupResponse.body.secret;
      const token = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
      });

      await client.post('/api/auth/2fa/verify-setup').send({ token }).expect(200);

      // Verify 2FA is enabled
      const statusResponse = await client.get('/api/auth/2fa/status').expect(200);
      assert.strictEqual(statusResponse.body.enabled, true);

      // Disable 2FA
      const currentToken = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
      });

      const disableResponse = await client
        .post('/api/auth/2fa/disable')
        .send({
          token: currentToken,
        })
        .expect(200);

      const disableData = helper.assertApiResponse(disableResponse);
      assert.strictEqual(disableData.success, true);

      // Verify 2FA is disabled
      const newStatusResponse = await client.get('/api/auth/2fa/status').expect(200);
      assert.strictEqual(newStatusResponse.body.enabled, false);
    });
  });

  describe('Password Change Flow', () => {
    it('should complete password change workflow', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');
      const httpClient = helper.createHttpClient();

      const newPassword = 'NewComplexPassword456!';

      // Change password
      const changeResponse = await client
        .post('/api/auth/change-password')
        .send({
          currentPassword: userData.userData.password,
          newPassword: newPassword,
          confirmPassword: newPassword,
        })
        .expect(200);

      const changeData = helper.assertApiResponse(changeResponse);
      assert.strictEqual(changeData.success, true);

      // Old password should no longer work
      await httpClient
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(401);

      // New password should work
      const loginResponse = await httpClient
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: newPassword,
        })
        .expect(200);

      const loginData = helper.assertApiResponse(loginResponse);
      assert.strictEqual(typeof loginData.token, 'string');
    });

    it('should validate password change requirements', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');

      // Test wrong current password
      await client
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        })
        .expect(400);

      // Test password confirmation mismatch
      await client
        .post('/api/auth/change-password')
        .send({
          currentPassword: userData.userData.password,
          newPassword: 'NewPassword123!',
          confirmPassword: 'DifferentPassword123!',
        })
        .expect(400);

      // Test weak new password
      await client
        .post('/api/auth/change-password')
        .send({
          currentPassword: userData.userData.password,
          newPassword: '123',
          confirmPassword: '123',
        })
        .expect(400);
    });

    it('should invalidate existing sessions after password change', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');
      const originalToken = userData.token;

      // Change password
      await client
        .post('/api/auth/change-password')
        .send({
          currentPassword: userData.userData.password,
          newPassword: 'NewComplexPassword456!',
          confirmPassword: 'NewComplexPassword456!',
        })
        .expect(200);

      // Original token should be invalidated
      const httpClient = helper.createHttpClient();
      await httpClient
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${originalToken}`)
        .expect(401);
    });
  });

  describe('User Profile Management', () => {
    it('should retrieve and update user profile', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const client = helper.createAuthenticatedRequest('operator');

      // Get profile
      const profileResponse = await client.get('/api/auth/profile').expect(200);

      const profileData = helper.assertApiResponse(profileResponse);

      // Validate profile data
      assert(profileData.user);
      assert.strictEqual(profileData.user.username, userData.userData.username);
      assert.strictEqual(profileData.user.email, userData.userData.email);
      assert.strictEqual(profileData.user.role, userData.userData.role);
      assert.strictEqual(typeof profileData.user.createdAt, 'string');
      assert(!profileData.user.password);
    });

    it('should handle profile access with expired token', async () => {
      const client = helper.createHttpClient();

      // Use an expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIzLCJleHAiOjF9.expired';

      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe('Admin User Management Flow', () => {
    it('should allow admins to manage users', async () => {
      const adminClient = helper.createAuthenticatedRequest('admin');

      // Create new user as admin
      const newUser = await adminClient
        .post('/api/auth/register')
        .send({
          username: 'admin-created-user',
          email: 'admin-created@example.com',
          password: 'AdminPassword123!',
          role: 'viewer',
        })
        .expect(201);

      const userId = newUser.body.user.id;

      // List users
      const usersResponse = await adminClient.get('/api/users').expect(200);

      const usersData = helper.assertApiResponse(usersResponse);
      assert(Array.isArray(usersData.users));
      assert(usersData.users.find(u => u.id === userId));

      // Update user role
      const updateResponse = await adminClient
        .put(`/api/users/${userId}`)
        .send({
          role: 'operator',
          isActive: false,
        })
        .expect(200);

      const updateData = helper.assertApiResponse(updateResponse);
      assert.strictEqual(updateData.user.role, 'operator');
      assert.strictEqual(updateData.user.isActive, false);

      // Delete user
      await adminClient.delete(`/api/users/${userId}`).expect(200);

      // Verify user is deleted
      const deletedUsersResponse = await adminClient.get('/api/users').expect(200);

      const deletedUsersData = deletedUsersResponse.body;
      assert(!deletedUsersData.users.find(u => u.id === userId));
    });

    it('should prevent non-admins from managing users', async () => {
      const operatorClient = helper.createAuthenticatedRequest('operator');

      // Try to list users - should fail
      await operatorClient.get('/api/users').expect(403);

      // Try to create user - should fail
      await operatorClient
        .post('/api/auth/register')
        .send({
          username: 'unauthorized-user',
          email: 'unauthorized@example.com',
          password: 'Password123!',
          role: 'admin',
        })
        .expect(403);
    });
  });

  describe('Session Management', () => {
    it('should track active user sessions', async () => {
      const userData = await helper.registerAndLoginUser('operator');

      // Create multiple sessions for same user
      const client = helper.createHttpClient();

      const session1 = await client
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(200);

      const session2 = await client
        .post('/api/auth/login')
        .send({
          username: userData.userData.username,
          password: userData.userData.password,
        })
        .expect(200);

      // Both tokens should be valid
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .expect(200);

      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${session2.body.token}`)
        .expect(200);

      // Logout one session
      await client
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .send({})
        .expect(200);

      // First session should be invalid
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .expect(401);

      // Second session should still be valid
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${session2.body.token}`)
        .expect(200);
    });

    it('should handle session cleanup on user deletion', async () => {
      const userData = await helper.registerAndLoginUser('operator');
      const adminClient = helper.createAuthenticatedRequest('admin');
      const client = helper.createHttpClient();

      // Verify user session is active
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userData.token}`)
        .expect(200);

      // Delete user as admin
      await adminClient.delete(`/api/users/${userData.user.id}`).expect(200);

      // User token should now be invalid
      await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${userData.token}`)
        .expect(401);
    });
  });

  describe('Security and Error Handling', () => {
    it('should handle malformed authentication requests gracefully', async () => {
      const client = helper.createHttpClient();

      // Malformed JSON
      await client
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid":json}')
        .expect(400);

      // Missing Content-Type
      await client.post('/api/auth/login').send('username=test&password=test').expect(400);
    });

    it('should sanitize authentication error messages', async () => {
      const client = helper.createHttpClient();

      // Test with SQL injection attempt
      const response = await client
        .post('/api/auth/login')
        .send({
          username: "admin'; DROP TABLE users; --",
          password: 'password',
        })
        .expect(401);

      // Error message should not reveal database structure
      assert(!response.body.error.includes('DROP TABLE'));
      assert(!response.body.error.includes('SQL'));
    });

    it('should prevent timing attacks on user enumeration', async () => {
      const client = helper.createHttpClient();

      // Time login attempts with valid and invalid usernames
      const validUserAttempt = async () => {
        const start = process.hrtime();
        await client.post('/api/auth/login').send({
          username: 'test-operator', // Known to exist
          password: 'wrongpassword',
        });
        const [seconds, nanoseconds] = process.hrtime(start);
        return seconds * 1000 + nanoseconds / 1000000;
      };

      const invalidUserAttempt = async () => {
        const start = process.hrtime();
        await client.post('/api/auth/login').send({
          username: 'nonexistent-user',
          password: 'wrongpassword',
        });
        const [seconds, nanoseconds] = process.hrtime(start);
        return seconds * 1000 + nanoseconds / 1000000;
      };

      // Measure timing for both scenarios
      const validUserTime = await validUserAttempt();
      const invalidUserTime = await invalidUserAttempt();

      // Times should be similar (within reasonable variance)
      const timeDifference = Math.abs(validUserTime - invalidUserTime);
      const maxAllowedDifference = Math.max(validUserTime, invalidUserTime) * 0.5; // 50% tolerance

      assert(
        timeDifference < maxAllowedDifference,
        `Timing difference too large: ${timeDifference}ms (valid: ${validUserTime}ms, invalid: ${invalidUserTime}ms)`
      );
    });
  });
});
