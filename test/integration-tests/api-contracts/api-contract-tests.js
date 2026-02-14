/**
 * API Contract Tests
 * Comprehensive testing of all REST API endpoints with contract validation
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  getTestHelper,
} = require('../integration-test-helpers');
const { TEST_CONFIG } = require('../integration-test-config');

describe('API Contract Tests', () => {
  let helper;
  let adminAuth, operatorAuth, viewerAuth;

  before(async () => {
    helper = await setupIntegrationTestEnvironment();

    // Setup authenticated users for different role tests
    adminAuth = await helper.registerAndLoginUser('admin');
    operatorAuth = await helper.registerAndLoginUser('operator');
    viewerAuth = await helper.registerAndLoginUser('viewer');
  });

  after(async () => {
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await helper.cleanupTestData();
    await helper.setupTestRobotConfig();
  });

  describe('Health and Status Endpoints', () => {
    it('GET /api/health should return system health status', async () => {
      const client = helper.createHttpClient();

      const response = await client.get('/api/health').expect(200);

      const data = helper.assertApiResponse(response);

      // Validate health response contract
      assert.strictEqual(typeof data.status, 'string');
      assert.strictEqual(data.status, 'healthy');
      assert.strictEqual(typeof data.timestamp, 'string');
      assert.strictEqual(typeof data.version, 'string');
      assert.strictEqual(typeof data.uptime, 'number');
      assert.strictEqual(typeof data.environment, 'string');
      assert(data.memory);
      assert.strictEqual(typeof data.memory.rss, 'number');
      assert.strictEqual(typeof data.memory.heapUsed, 'number');
    });

    it('GET /api/monitoring/health should require authentication', async () => {
      const client = helper.createHttpClient();

      await client.get('/api/monitoring/health').expect(401);
    });

    it('GET /api/monitoring/health should return detailed health with auth', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const response = await client.get('/api/monitoring/health').expect(200);

      const data = helper.assertApiResponse(response);

      // Validate monitoring health contract
      assert(data.system);
      assert(data.hardware);
      assert(data.database);
      assert.strictEqual(typeof data.uptime, 'number');
      assert.strictEqual(typeof data.timestamp, 'string');
    });
  });

  describe('Authentication API Contracts', () => {
    describe('POST /api/auth/register', () => {
      it('should validate registration request contract', async () => {
        const client = helper.createHttpClient();

        // Test missing required fields
        await client.post('/api/auth/register').send({}).expect(400);

        // Test invalid email format
        await client
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'invalid-email',
            password: 'ValidPassword123!',
          })
          .expect(400);

        // Test weak password
        await client
          .post('/api/auth/register')
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: '123',
          })
          .expect(400);
      });

      it('should return valid registration response contract', async () => {
        const client = helper.createHttpClient();
        const userData = {
          username: 'contract-test-user',
          email: 'contract@test.com',
          password: 'ValidPassword123!',
          role: 'operator',
        };

        const response = await client.post('/api/auth/register').send(userData).expect(201);

        const data = helper.assertApiResponse(response, 201);

        // Validate registration response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');
        assert(data.user);
        assert.strictEqual(typeof data.user.id, 'number');
        assert.strictEqual(data.user.username, userData.username);
        assert.strictEqual(data.user.email, userData.email);
        assert.strictEqual(data.user.role, userData.role);
        assert(!data.user.password); // Password should not be returned
      });
    });

    describe('POST /api/auth/login', () => {
      it('should validate login request contract', async () => {
        const client = helper.createHttpClient();

        // Test missing credentials
        await client.post('/api/auth/login').send({}).expect(400);

        // Test invalid credentials
        await client
          .post('/api/auth/login')
          .send({
            username: 'nonexistent',
            password: 'wrongpassword',
          })
          .expect(401);
      });

      it('should return valid login response contract', async () => {
        // Use existing operator auth data
        const client = helper.createHttpClient();

        const response = await client
          .post('/api/auth/login')
          .send({
            username: operatorAuth.userData.username,
            password: operatorAuth.userData.password,
          })
          .expect(200);

        const data = helper.assertApiResponse(response);

        // Validate login response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.token, 'string');
        assert.strictEqual(typeof data.refreshToken, 'string');
        assert(data.user);
        assert.strictEqual(typeof data.user.id, 'number');
        assert.strictEqual(data.user.username, operatorAuth.userData.username);
        assert(!data.user.password); // Password should not be returned
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh token with valid refresh token', async () => {
        const client = helper.createHttpClient();

        const response = await client
          .post('/api/auth/refresh')
          .send({
            refreshToken: operatorAuth.refreshToken,
          })
          .expect(200);

        const data = helper.assertApiResponse(response);

        // Validate refresh response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.token, 'string');
        assert.strictEqual(typeof data.refreshToken, 'string');
        assert(data.user);
      });

      it('should reject invalid refresh token', async () => {
        const client = helper.createHttpClient();

        await client
          .post('/api/auth/refresh')
          .send({
            refreshToken: 'invalid-refresh-token',
          })
          .expect(401);
      });
    });

    describe('GET /api/auth/profile', () => {
      it('should return user profile with valid token', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.get('/api/auth/profile').expect(200);

        const data = helper.assertApiResponse(response);

        // Validate profile response contract
        assert.strictEqual(data.success, true);
        assert(data.user);
        assert.strictEqual(typeof data.user.id, 'number');
        assert.strictEqual(typeof data.user.username, 'string');
        assert.strictEqual(typeof data.user.email, 'string');
        assert.strictEqual(typeof data.user.role, 'string');
        assert.strictEqual(typeof data.user.createdAt, 'string');
        assert(!data.user.password);
      });
    });
  });

  describe('Configuration API Contracts', () => {
    describe('GET /api/config', () => {
      it('should return robot configuration', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.get('/api/config').expect(200);

        const data = helper.assertApiResponse(response);

        // Validate configuration response contract
        assert.strictEqual(typeof data.robotType, 'string');
        assert.strictEqual(typeof data.communicationProtocol, 'string');
        assert(data.serialConfig);
        assert(data.canConfig);
        assert(data.axes);
        assert(data.manipulators);
        assert.strictEqual(typeof data.axes.count, 'number');
        assert(data.axes.limits);
      });
    });

    describe('POST /api/config', () => {
      it('should validate configuration update contract', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Test missing required fields
        await client.post('/api/config').send({}).expect(400);

        // Test invalid configuration
        await client
          .post('/api/config')
          .send({
            robotType: '',
            axes: { count: -1 },
          })
          .expect(400);
      });

      it('should update configuration with valid data', async () => {
        const client = helper.createAuthenticatedRequest('operator');
        const config = {
          robotType: 'updated-arctos',
          communicationProtocol: 'serial',
          serialConfig: {
            port: '/dev/ttyUSB1',
            baudRate: 9600,
          },
          axes: {
            count: 4,
            limits: {
              axis1: { min: -90, max: 90 },
              axis2: { min: -45, max: 45 },
              axis3: { min: -180, max: 180 },
              axis4: { min: -270, max: 270 },
            },
          },
          manipulators: {
            count: 1,
            gripper1: { min: 0, max: 50 },
          },
        };

        const response = await client.post('/api/config').send(config).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate update response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');

        // Verify configuration was actually updated
        const getResponse = await client.get('/api/config').expect(200);

        assert.strictEqual(getResponse.body.robotType, config.robotType);
        assert.strictEqual(getResponse.body.communicationProtocol, config.communicationProtocol);
      });
    });
  });

  describe('Position Management API Contracts', () => {
    describe('GET /api/positions', () => {
      it('should return positions array', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Setup test positions first
        await helper.setupTestPositions(3);

        const response = await client.get('/api/positions').expect(200);

        const data = response.body;

        // Validate positions response contract
        assert(Array.isArray(data));

        if (data.length > 0) {
          const position = data[0];
          assert.strictEqual(typeof position.id, 'number');
          assert.strictEqual(typeof position.name, 'string');
          assert(position.axes);
          assert(position.manipulators);
          assert.strictEqual(typeof position.delay, 'number');
          assert.strictEqual(typeof position.timestamp, 'string');
        }
      });
    });

    describe('POST /api/positions', () => {
      it('should validate position creation contract', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Test missing required fields
        await client.post('/api/positions').send({}).expect(400);

        // Test invalid position data
        await client
          .post('/api/positions')
          .send({
            name: '',
            axes: {},
            manipulators: {},
            delay: -1,
          })
          .expect(400);
      });

      it('should create position with valid data', async () => {
        const client = helper.createAuthenticatedRequest('operator');
        const positionData = {
          name: 'Test API Position',
          axes: {
            axis1: 45.5,
            axis2: -30.2,
            axis3: 90.0,
            axis4: 0.0,
            axis5: 60.5,
            axis6: -45.8,
          },
          manipulators: {
            gripper1: 75.5,
            gripper2: 25.0,
          },
          delay: 2000,
        };

        const response = await client.post('/api/positions').send(positionData).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate creation response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');
        assert(data.position);
        assert.strictEqual(typeof data.position.id, 'number');
        assert.strictEqual(data.position.name, positionData.name);
      });
    });

    describe('DELETE /api/positions/:id', () => {
      it('should delete existing position', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Create a position first
        const createResponse = await client
          .post('/api/positions')
          .send({
            name: 'Position to Delete',
            axes: { axis1: 0 },
            manipulators: { gripper1: 0 },
            delay: 1000,
          })
          .expect(200);

        const positionId = createResponse.body.position.id;

        // Delete the position
        const response = await client.delete(`/api/positions/${positionId}`).expect(200);

        const data = helper.assertApiResponse(response);
        assert.strictEqual(data.success, true);
      });

      it('should return 404 for non-existent position', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        await client.delete('/api/positions/99999').expect(404);
      });
    });
  });

  describe('Manual Control API Contracts', () => {
    describe('POST /api/manual/move', () => {
      it('should validate manual move contract', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Test missing axis parameter
        await client.post('/api/manual/move').send({}).expect(400);

        // Test invalid axis
        await client
          .post('/api/manual/move')
          .send({
            axis: 'invalid_axis',
            direction: 'positive',
            amount: 10,
          })
          .expect(400);

        // Test invalid direction
        await client
          .post('/api/manual/move')
          .send({
            axis: 'axis1',
            direction: 'invalid_direction',
            amount: 10,
          })
          .expect(400);
      });

      it('should execute manual move with valid parameters', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client
          .post('/api/manual/move')
          .send({
            axis: 'axis1',
            direction: 'positive',
            amount: 5.5,
          })
          .expect(200);

        const data = helper.assertApiResponse(response);

        // Validate move response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');
        assert(data.position);
        assert.strictEqual(typeof data.position.axis1, 'number');
      });
    });

    describe('POST /api/home', () => {
      it('should execute homing sequence', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.post('/api/home').send({}).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate homing response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');
      });
    });

    describe('POST /api/emergency-stop', () => {
      it('should execute emergency stop', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.post('/api/emergency-stop').send({}).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate emergency stop response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.message, 'string');
      });
    });
  });

  describe('G-Code API Contracts', () => {
    describe('POST /api/gcode/execute', () => {
      it('should validate G-code execution contract', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        // Test missing G-code
        await client.post('/api/gcode/execute').send({}).expect(400);

        // Test invalid G-code format
        await client
          .post('/api/gcode/execute')
          .send({
            gcode: 123, // Should be string or array
          })
          .expect(400);
      });

      it('should execute valid G-code', async () => {
        const client = helper.createAuthenticatedRequest('operator');
        const gcode = ['G28 ; Home all axes', 'G1 X10 Y10 Z5 F1000', 'M84 ; Disable motors'];

        const response = await client.post('/api/gcode/execute').send({ gcode }).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate G-code execution response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.executionId, 'string');
        assert.strictEqual(typeof data.message, 'string');
      });
    });

    describe('POST /api/gcode/validate', () => {
      it('should validate G-code syntax', async () => {
        const client = helper.createAuthenticatedRequest('operator');
        const gcode = ['G28', 'G1 X10 Y10 F1000', 'M84'];

        const response = await client.post('/api/gcode/validate').send({ gcode }).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate G-code validation response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.valid, 'boolean');
        assert(Array.isArray(data.commands));
        assert(Array.isArray(data.warnings));
        assert(Array.isArray(data.errors));
      });
    });

    describe('GET /api/gcode/execution/state', () => {
      it('should return execution state', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.get('/api/gcode/execution/state').expect(200);

        const data = helper.assertApiResponse(response);

        // Validate execution state response contract
        assert.strictEqual(data.success, true);
        assert(data.state);
        assert.strictEqual(typeof data.state.status, 'string');
        assert.strictEqual(typeof data.state.currentLine, 'number');
        assert.strictEqual(typeof data.state.totalLines, 'number');
        assert.strictEqual(typeof data.state.progress, 'number');
      });
    });
  });

  describe('User Management API Contracts', () => {
    describe('GET /api/users', () => {
      it('should require admin role for user list', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        await client.get('/api/users').expect(403);
      });

      it('should return user list for admin', async () => {
        const client = helper.createAuthenticatedRequest('admin');

        const response = await client.get('/api/users').expect(200);

        const data = helper.assertApiResponse(response);

        // Validate user list response contract
        assert.strictEqual(data.success, true);
        assert(Array.isArray(data.users));

        if (data.users.length > 0) {
          const user = data.users[0];
          assert.strictEqual(typeof user.id, 'number');
          assert.strictEqual(typeof user.username, 'string');
          assert.strictEqual(typeof user.email, 'string');
          assert.strictEqual(typeof user.role, 'string');
          assert(!user.password); // Password should not be included
        }
      });
    });
  });

  describe('Database API Contracts', () => {
    describe('GET /api/database/status', () => {
      it('should return database status', async () => {
        const client = helper.createAuthenticatedRequest('operator');

        const response = await client.get('/api/database/status').expect(200);

        const data = helper.assertApiResponse(response);

        // Validate database status response contract
        assert.strictEqual(data.success, true);
        assert(data.status);
        assert.strictEqual(typeof data.status.connected, 'boolean');
        assert.strictEqual(typeof data.status.size, 'number');
        assert.strictEqual(typeof data.status.tables, 'object');
      });
    });

    describe('POST /api/database/backup', () => {
      it('should create database backup', async () => {
        const client = helper.createAuthenticatedRequest('admin');

        const response = await client.post('/api/database/backup').send({}).expect(200);

        const data = helper.assertApiResponse(response);

        // Validate backup response contract
        assert.strictEqual(data.success, true);
        assert.strictEqual(typeof data.backupPath, 'string');
        assert.strictEqual(typeof data.size, 'number');
        assert.strictEqual(typeof data.timestamp, 'string');
      });
    });
  });

  describe('Error Handling Contracts', () => {
    it('should return consistent error response format', async () => {
      const client = helper.createHttpClient();

      // Test 401 Unauthorized
      const unauthorizedResponse = await client.get('/api/config').expect(401);

      assert.strictEqual(unauthorizedResponse.body.success, false);
      assert.strictEqual(typeof unauthorizedResponse.body.error, 'string');

      // Test 404 Not Found
      const notFoundResponse = await client.get('/api/nonexistent-endpoint').expect(404);

      // Should have consistent error structure
      assert(notFoundResponse.body.error || notFoundResponse.body.message);
    });

    it('should handle validation errors consistently', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const response = await client
        .post('/api/positions')
        .send({
          name: '', // Invalid empty name
          axes: {},
          manipulators: {},
        })
        .expect(400);

      // Validate error response contract
      assert.strictEqual(response.body.success, false);
      assert.strictEqual(typeof response.body.error, 'string');
    });
  });

  describe('Rate Limiting Contracts', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      const client = helper.createHttpClient();
      const requests = [];

      // Generate multiple rapid requests to trigger rate limit
      for (let i = 0; i < 10; i++) {
        requests.push(
          client.post('/api/auth/login').send({
            username: 'nonexistent',
            password: 'wrong',
          })
        );
      }

      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 429
      );

      // Should have at least one rate limited response
      assert(rateLimitedResponses.length > 0, 'Rate limiting should be enforced');
    });
  });
});
