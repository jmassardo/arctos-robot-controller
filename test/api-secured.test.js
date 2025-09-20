const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');

// We'll test against a minimal Express app that mimics our server structure
const express = require('express');
const AuthService = require('../lib/auth');
const Logger = require('../lib/logger');
const { rateLimits, validateInput, securityMiddleware, threatDetection } = require('../lib/security');

// Create test app
function createSecuredApp() {
  const testDataDir = path.join(__dirname, 'test-app-data');
  const testLogDir = path.join(__dirname, 'test-app-logs');
  
  const app = express();
  const authService = new AuthService(testDataDir);
  const logger = new Logger(testLogDir);

  // Middleware
  app.use(express.json());
  app.use(securityMiddleware);
  app.use(threatDetection);
  app.use(logger.requestMiddleware());

  // Auth middleware
  const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const result = authService.verifyToken(token);
    if (!result.valid) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    req.user = result.decoded;
    next();
  };

  const requireRole = (roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      next();
    };
  };

  // Auth routes
  app.post('/auth/login', rateLimits.auth, validateInput.userLogin, async (req, res) => {
    const { username, password } = req.body;
    const result = await authService.login(username, password, req.ip);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  });

  app.post('/auth/register', rateLimits.auth, validateInput.userCreation, async (req, res) => {
    const result = await authService.createUser(req.body);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  });

  app.post('/auth/logout', authenticateToken, async (req, res) => {
    const refreshToken = req.body.refreshToken;
    const result = await authService.logout(refreshToken);
    res.json(result);
  });

  // Protected API routes
  app.get('/api/config', authenticateToken, (req, res) => {
    res.json({
      success: true,
      config: {
        robotType: 'mks57d',
        communicationProtocol: 'serial',
        axes: { count: 6 }
      }
    });
  });

  app.post('/api/config', 
    authenticateToken,
    requireRole(['admin', 'operator']),
    rateLimits.api,
    validateInput.robotConfig,
    (req, res) => {
      res.json({ success: true, message: 'Configuration updated' });
    }
  );

  app.post('/api/positions',
    authenticateToken,
    requireRole(['admin', 'operator']),
    rateLimits.api,
    validateInput.positionData,
    (req, res) => {
      res.json({ success: true, message: 'Position saved' });
    }
  );

  app.post('/api/robot/move',
    authenticateToken,
    requireRole(['admin', 'operator']),
    rateLimits.robotControl,
    (req, res) => {
      res.json({ success: true, message: 'Robot moved' });
    }
  );

  app.get('/api/users',
    authenticateToken,
    requireRole(['admin']),
    (req, res) => {
      res.json({ success: true, users: [] });
    }
  );

  app.get('/api/audit/logs',
    authenticateToken,
    requireRole(['admin']),
    (req, res) => {
      res.json({ success: true, logs: [], total: 0 });
    }
  );

  app.use(logger.errorMiddleware());

  return { app, authService, logger, testDataDir, testLogDir };
}

test('Secured API Integration Tests', async (t) => {
  let testApp, authService, logger, testDataDir, testLogDir;

  // Setup
  await t.before(async () => {
    const setup = createSecuredApp();
    testApp = setup.app;
    authService = setup.authService;
    logger = setup.logger;
    testDataDir = setup.testDataDir;
    testLogDir = setup.testLogDir;

    await fs.ensureDir(testDataDir);
    await fs.ensureDir(testLogDir);

    // Create test users
    await authService.createUser({
      username: 'testadmin',
      password: 'AdminPass123!',
      email: 'admin@test.com',
      role: 'admin'
    });

    await authService.createUser({
      username: 'testoperator',
      password: 'OpPass123!',
      email: 'operator@test.com',
      role: 'operator'
    });

    await authService.createUser({
      username: 'testviewer',
      password: 'ViewPass123!',
      email: 'viewer@test.com',
      role: 'viewer'
    });
  });

  // Cleanup
  await t.after(async () => {
    await fs.remove(testDataDir);
    await fs.remove(testLogDir);
  });

  await t.test('Authentication Flow', async (st) => {
    await st.test('should register new user with valid data', async () => {
      const userData = {
        username: 'newuser',
        password: 'NewPass123!',
        email: 'newuser@test.com',
        role: 'operator'
      };

      const response = await request(testApp)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      assert.ok(response.body.success);
      assert.ok(response.body.user);
      assert.strictEqual(response.body.user.username, 'newuser');
    });

    await st.test('should not register user with invalid data', async () => {
      const userData = {
        username: 'nu', // Too short
        password: '123', // Too weak
        email: 'invalid-email',
        role: 'invalid-role'
      };

      const response = await request(testApp)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      assert.ok(!response.body.success);
      assert.ok(response.body.errors);
    });

    await st.test('should login with valid credentials', async () => {
      const credentials = {
        username: 'testadmin',
        password: 'AdminPass123!'
      };

      const response = await request(testApp)
        .post('/auth/login')
        .send(credentials)
        .expect(200);

      assert.ok(response.body.success);
      assert.ok(response.body.accessToken);
      assert.ok(response.body.refreshToken);
      assert.strictEqual(response.body.user.username, 'testadmin');
    });

    await st.test('should not login with invalid credentials', async () => {
      const credentials = {
        username: 'testadmin',
        password: 'wrongpassword'
      };

      const response = await request(testApp)
        .post('/auth/login')
        .send(credentials)
        .expect(401);

      assert.ok(!response.body.success);
      assert.ok(response.body.error);
    });

    await st.test('should detect login rate limiting', async () => {
      const credentials = {
        username: 'testadmin',
        password: 'wrongpassword'
      };

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(testApp)
          .post('/auth/login')
          .send(credentials)
          .expect(401);
      }

      // 6th attempt should be rate limited
      const response = await request(testApp)
        .post('/auth/login')
        .send(credentials)
        .expect(429);

      assert.ok(response.body.error.includes('Too many'));
    });
  });

  await t.test('Role-Based Access Control', async (st) => {
    let adminToken, operatorToken, viewerToken;

    // Get tokens for each role
    await st.before(async () => {
      const adminLogin = await request(testApp)
        .post('/auth/login')
        .send({ username: 'testadmin', password: 'AdminPass123!' });
      adminToken = adminLogin.body.accessToken;

      const operatorLogin = await request(testApp)
        .post('/auth/login')
        .send({ username: 'testoperator', password: 'OpPass123!' });
      operatorToken = operatorLogin.body.accessToken;

      const viewerLogin = await request(testApp)
        .post('/auth/login')
        .send({ username: 'testviewer', password: 'ViewPass123!' });
      viewerToken = viewerLogin.body.accessToken;
    });

    await st.test('should allow all roles to access config read', async () => {
      // Admin
      await request(testApp)
        .get('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Operator
      await request(testApp)
        .get('/api/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      // Viewer
      await request(testApp)
        .get('/api/config')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    await st.test('should restrict config write to admin and operator', async () => {
      const configData = {
        robotType: 'mks57d',
        communicationProtocol: 'serial',
        axes: { count: 6 }
      };

      // Admin should succeed
      await request(testApp)
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(configData)
        .expect(200);

      // Operator should succeed
      await request(testApp)
        .post('/api/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(configData)
        .expect(200);

      // Viewer should be denied
      await request(testApp)
        .post('/api/config')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(configData)
        .expect(403);
    });

    await st.test('should restrict admin endpoints to admin only', async () => {
      // Admin should access user management
      await request(testApp)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Operator should be denied
      await request(testApp)
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      // Viewer should be denied
      await request(testApp)
        .get('/api/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    await st.test('should restrict audit logs to admin only', async () => {
      // Admin should access audit logs
      await request(testApp)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Operator should be denied
      await request(testApp)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      // Viewer should be denied
      await request(testApp)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  await t.test('Input Validation', async (st) => {
    let adminToken;

    await st.before(async () => {
      const adminLogin = await request(testApp)
        .post('/auth/login')
        .send({ username: 'testadmin', password: 'AdminPass123!' });
      adminToken = adminLogin.body.accessToken;
    });

    await st.test('should validate robot configuration', async () => {
      const validConfig = {
        robotType: 'mks57d',
        communicationProtocol: 'serial',
        axes: { count: 6 }
      };

      await request(testApp)
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validConfig)
        .expect(200);

      const invalidConfig = {
        robotType: '', // Invalid
        communicationProtocol: 'invalid-protocol',
        axes: { count: 'not-a-number' }
      };

      const response = await request(testApp)
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      assert.ok(response.body.errors);
    });

    await st.test('should validate position data', async () => {
      const validPosition = {
        name: 'Test Position',
        axes: { x: 100, y: 200, z: 300 },
        manipulators: { gripper: 50 },
        delay: 1000
      };

      await request(testApp)
        .post('/api/positions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPosition)
        .expect(200);

      const invalidPosition = {
        name: '', // Invalid
        axes: { x: 'not-a-number' },
        manipulators: { gripper: -10 },
        delay: 'invalid'
      };

      const response = await request(testApp)
        .post('/api/positions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPosition)
        .expect(400);

      assert.ok(response.body.errors);
    });
  });

  await t.test('Security Features', async (st) => {
    let operatorToken;

    await st.before(async () => {
      const operatorLogin = await request(testApp)
        .post('/auth/login')
        .send({ username: 'testoperator', password: 'OpPass123!' });
      operatorToken = operatorLogin.body.accessToken;
    });

    await st.test('should detect threat attempts', async () => {
      const maliciousData = {
        name: '<script>alert("xss")</script>',
        command: 'ls; rm -rf /'
      };

      const response = await request(testApp)
        .post('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(maliciousData)
        .expect(400);

      assert.ok(response.body.error.includes('security violation'));
    });

    await st.test('should apply security headers', async () => {
      const response = await request(testApp)
        .get('/api/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert.ok(response.headers['x-content-type-options']);
      assert.ok(response.headers['x-frame-options']);
      assert.ok(response.headers['strict-transport-security']);
    });

    await st.test('should enforce rate limiting on robot control', async () => {
      const moveCommand = { x: 100, y: 200 };

      // Make 30 requests (the limit)
      for (let i = 0; i < 30; i++) {
        await request(testApp)
          .post('/api/robot/move')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send(moveCommand)
          .expect(200);
      }

      // 31st request should be rate limited
      const response = await request(testApp)
        .post('/api/robot/move')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(moveCommand)
        .expect(429);

      assert.ok(response.body.error.includes('Too many'));
    });
  });

  await t.test('Unauthorized Access', async (st) => {
    await st.test('should reject requests without token', async () => {
      await request(testApp)
        .get('/api/config')
        .expect(401);
    });

    await st.test('should reject requests with invalid token', async () => {
      await request(testApp)
        .get('/api/config')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(403);
    });

    await st.test('should reject requests with malformed auth header', async () => {
      await request(testApp)
        .get('/api/config')
        .set('Authorization', 'InvalidFormat')
        .expect(401);
    });
  });
});