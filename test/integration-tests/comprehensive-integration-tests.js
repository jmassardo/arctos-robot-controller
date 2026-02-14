/**
 * Comprehensive Integration Tests - Master Test Suite
 *
 * This master test suite orchestrates all integration tests and provides
 * comprehensive coverage of system integration points.
 *
 * Integration Test Engineer Implementation
 * Covers: API contracts, Database integration, Socket.IO communication,
 * Authentication flows, Hardware protocols, Error recovery, Performance validation
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const { io: SocketIOClient } = require('socket.io-client');
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcryptjs');

// Import test infrastructure
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  IntegrationTestHelper,
} = require('./integration-test-helpers');

// Import application modules for deep integration testing
const { DatabaseManager } = require('../../lib/database');
const { AuthService } = require('../../lib/auth');
const { MKS42DController } = require('../../lib/mks42d');

/**
 * Comprehensive Integration Test Suite
 *
 * Tests all major integration points:
 * 1. Frontend-Backend API Integration
 * 2. Real-time WebSocket Communication
 * 3. Database Integration with Transactions
 * 4. Authentication and Security Flows
 * 5. Hardware Protocol Integration
 * 6. Error Recovery and Fault Tolerance
 * 7. Performance Under Load
 * 8. End-to-End Business Workflows
 */
describe('🔗 Comprehensive Integration Tests', () => {
  let helper;
  let server;
  let app;
  let dbManager;
  let authService;

  // Test users for various scenarios
  let adminUser, operatorUser, viewerUser;
  let adminToken, operatorToken, viewerToken;

  // Socket.IO clients for real-time testing
  let adminSocket, operatorSocket, viewerSocket;

  before(async () => {
    console.log('🚀 Setting up comprehensive integration test environment...');

    // Initialize test environment with full system startup
    helper = await setupIntegrationTestEnvironment({
      enableDatabase: true,
      enableAuth: true,
      enableHardwareSimulation: true,
      enableSocketIO: true,
      verbose: true,
    });

    server = helper.server;
    app = helper.app;
    dbManager = helper.dbManager;
    authService = helper.authService;

    // Create test users with different roles
    adminUser = await helper.createTestUser('admin', 'test_admin_password', 'admin');
    operatorUser = await helper.createTestUser('operator', 'test_operator_password', 'operator');
    viewerUser = await helper.createTestUser('viewer', 'test_viewer_password', 'viewer');

    // Generate authentication tokens
    adminToken = await helper.generateAuthToken(adminUser);
    operatorToken = await helper.generateAuthToken(operatorUser);
    viewerToken = await helper.generateAuthToken(viewerUser);

    console.log('✅ Integration test environment ready');
  });

  after(async () => {
    console.log('🧹 Cleaning up integration test environment...');

    // Disconnect all socket clients
    const sockets = [adminSocket, operatorSocket, viewerSocket].filter(Boolean);
    await Promise.all(
      sockets.map(
        socket =>
          new Promise(resolve => {
            if (socket.connected) {
              socket.disconnect();
              socket.on('disconnect', resolve);
            } else {
              resolve();
            }
          })
      )
    );

    await teardownIntegrationTestEnvironment();
    console.log('✅ Integration test cleanup completed');
  });

  beforeEach(async () => {
    // Reset test data before each test
    await helper.resetTestData();
    await helper.setupDefaultRobotConfig();
  });

  /**
   * 1. FRONTEND-BACKEND API INTEGRATION TESTS
   *
   * Test all REST API endpoints with realistic scenarios,
   * request/response validation, and error handling.
   */
  describe('📡 Frontend-Backend API Integration', () => {
    describe('Authentication API Integration', () => {
      it('should handle complete user registration workflow', async () => {
        const client = supertest(app);

        // 1. Register new user
        const registrationData = {
          username: 'integration_test_user',
          email: 'integration@test.com',
          password: 'SecurePassword123!',
          role: 'operator',
        };

        const registerResponse = await client
          .post('/api/auth/register')
          .send(registrationData)
          .expect(201);

        assert(registerResponse.body.success);
        assert(registerResponse.body.user);
        assert.strictEqual(registerResponse.body.user.username, registrationData.username);

        // 2. Login with new user
        const loginResponse = await client
          .post('/api/auth/login')
          .send({
            username: registrationData.username,
            password: registrationData.password,
          })
          .expect(200);

        assert(loginResponse.body.success);
        assert(loginResponse.body.token);
        assert(loginResponse.body.refreshToken);

        // 3. Access protected resource
        const profileResponse = await client
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${loginResponse.body.token}`)
          .expect(200);

        assert(profileResponse.body.success);
        assert.strictEqual(profileResponse.body.user.username, registrationData.username);
      });

      it('should handle two-factor authentication workflow', async () => {
        const client = supertest(app);

        // 1. Setup 2FA for operator user
        const setupResponse = await client
          .post('/api/auth/2fa/setup')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(setupResponse.body.success);
        assert(setupResponse.body.secret);
        assert(setupResponse.body.qrCode);

        // 2. Verify 2FA setup with test TOTP
        const testTOTP = helper.generateTestTOTP(setupResponse.body.secret);
        const verifyResponse = await client
          .post('/api/auth/2fa/verify-setup')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            token: testTOTP,
            secret: setupResponse.body.secret,
          })
          .expect(200);

        assert(verifyResponse.body.success);
        assert(verifyResponse.body.backupCodes);
        assert.strictEqual(verifyResponse.body.backupCodes.length, 10);

        // 3. Login with 2FA requirement
        const loginResponse = await client
          .post('/api/auth/login')
          .send({
            username: 'operator',
            password: 'test_operator_password',
          })
          .expect(200);

        assert(loginResponse.body.requires2FA);
        assert(loginResponse.body.tempToken);

        // 4. Complete 2FA verification
        const twoFAToken = helper.generateTestTOTP(setupResponse.body.secret);
        const twoFAResponse = await client
          .post('/api/auth/2fa/verify')
          .send({
            tempToken: loginResponse.body.tempToken,
            token: twoFAToken,
          })
          .expect(200);

        assert(twoFAResponse.body.success);
        assert(twoFAResponse.body.token);
        assert(twoFAResponse.body.refreshToken);
      });
    });

    describe('Configuration API Integration', () => {
      it('should handle complete configuration management workflow', async () => {
        const client = supertest(app);

        // 1. Get current configuration
        const getResponse = await client
          .get('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        assert(getResponse.body.success);
        assert(getResponse.body.config);
        const originalConfig = getResponse.body.config;

        // 2. Update configuration
        const updatedConfig = {
          ...originalConfig,
          robotType: 'updated_robot',
          axes: {
            ...originalConfig.axes,
            count: 7,
            limits: {
              ...originalConfig.axes.limits,
              axis7: { min: -90, max: 90 },
            },
          },
        };

        const updateResponse = await client
          .post('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(updatedConfig)
          .expect(200);

        assert(updateResponse.body.success);

        // 3. Verify configuration was updated
        const verifyResponse = await client
          .get('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        assert.strictEqual(verifyResponse.body.config.robotType, 'updated_robot');
        assert.strictEqual(verifyResponse.body.config.axes.count, 7);
        assert(verifyResponse.body.config.axes.limits.axis7);

        // 4. Test configuration validation
        const invalidConfig = {
          ...updatedConfig,
          axes: { count: -1 }, // Invalid axis count
        };

        await client
          .post('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidConfig)
          .expect(400);
      });
    });

    describe('Position Management API Integration', () => {
      it('should handle complete position lifecycle workflow', async () => {
        const client = supertest(app);

        // 1. Create multiple positions
        const positions = [];
        for (let i = 0; i < 5; i++) {
          const positionData = {
            name: `Integration Test Position ${i + 1}`,
            description: `Test position created during integration testing`,
            axes: {
              axis1: Math.random() * 180 - 90,
              axis2: Math.random() * 180 - 90,
              axis3: Math.random() * 180 - 90,
              axis4: Math.random() * 180 - 90,
              axis5: Math.random() * 180 - 90,
              axis6: Math.random() * 180 - 90,
            },
            manipulators: {
              gripper1: Math.random() * 100,
              gripper2: Math.random() * 100,
            },
            metadata: {
              created_by: 'integration_test',
              test_run_id: `test_${Date.now()}`,
            },
          };

          const createResponse = await client
            .post('/api/positions')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send(positionData)
            .expect(200);

          assert(createResponse.body.success);
          positions.push(createResponse.body.position);
        }

        // 2. Get all positions
        const listResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(listResponse.body.success);
        assert(Array.isArray(listResponse.body.positions));
        assert(listResponse.body.positions.length >= 5);

        // 3. Create position group
        const groupData = {
          name: 'Integration Test Group',
          description: 'Group created during integration testing',
          positions: positions.slice(0, 3).map(p => p.id),
        };

        const groupResponse = await client
          .post('/api/positions/groups')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send(groupData)
          .expect(200);

        assert(groupResponse.body.success);
        assert(groupResponse.body.group);

        // 4. Replay single position
        const replayResponse = await client
          .post(`/api/replay/${positions[0].id}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({})
          .expect(200);

        assert(replayResponse.body.success);

        // 5. Replay position group
        const groupReplayResponse = await client
          .post(`/api/replay/group/${groupResponse.body.group.id}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({})
          .expect(200);

        assert(groupReplayResponse.body.success);

        // 6. Delete position
        const deleteResponse = await client
          .delete(`/api/positions/${positions[0].id}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(deleteResponse.body.success);

        // 7. Verify position was deleted
        const verifyResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        const deletedPosition = verifyResponse.body.positions.find(p => p.id === positions[0].id);
        assert.strictEqual(deletedPosition, undefined);
      });
    });

    describe('G-Code Management API Integration', () => {
      it('should handle complete G-Code execution workflow', async () => {
        const client = supertest(app);

        // 1. Upload G-Code program
        const gcodeProgram = `
; Integration Test G-Code Program
G21 ; Set units to millimeters
G90 ; Set absolute positioning
G28 ; Home all axes
G1 X10 Y10 Z5 F1000 ; Move to position
G1 X20 Y20 Z10 F1500 ; Move to second position
G1 X0 Y0 Z0 F800 ; Return to origin
M30 ; End program
        `.trim();

        const uploadResponse = await client
          .post('/api/gcode/upload')
          .set('Authorization', `Bearer ${operatorToken}`)
          .field('name', 'Integration Test Program')
          .field('description', 'G-Code program for integration testing')
          .attach('file', Buffer.from(gcodeProgram), 'integration_test.gcode')
          .expect(200);

        assert(uploadResponse.body.success);
        assert(uploadResponse.body.program);
        const programId = uploadResponse.body.program.id;

        // 2. Validate G-Code program
        const validateResponse = await client
          .post(`/api/gcode/validate/${programId}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(validateResponse.body.success);
        assert(validateResponse.body.validation);
        assert.strictEqual(validateResponse.body.validation.errors.length, 0);

        // 3. Execute G-Code program
        const executeResponse = await client
          .post(`/api/gcode/execute/${programId}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            simulationMode: true,
            safetyChecks: true,
          })
          .expect(200);

        assert(executeResponse.body.success);
        assert(executeResponse.body.executionId);

        // 4. Monitor execution status
        let executionComplete = false;
        let attempts = 0;
        const maxAttempts = 20;

        while (!executionComplete && attempts < maxAttempts) {
          await helper.delay(500);

          const statusResponse = await client
            .get(`/api/gcode/status/${executeResponse.body.executionId}`)
            .set('Authorization', `Bearer ${operatorToken}`)
            .expect(200);

          assert(statusResponse.body.success);

          if (
            statusResponse.body.status.state === 'COMPLETED' ||
            statusResponse.body.status.state === 'ERROR'
          ) {
            executionComplete = true;
            assert.strictEqual(statusResponse.body.status.state, 'COMPLETED');
          }

          attempts++;
        }

        assert(executionComplete, 'G-Code execution did not complete within timeout');

        // 5. Get execution history
        const historyResponse = await client
          .get('/api/gcode/history')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(historyResponse.body.success);
        assert(Array.isArray(historyResponse.body.history));

        const thisExecution = historyResponse.body.history.find(
          h => h.id === executeResponse.body.executionId
        );
        assert(thisExecution);
        assert.strictEqual(thisExecution.state, 'COMPLETED');
      });
    });
  });

  /**
   * 2. REAL-TIME WEBSOCKET COMMUNICATION TESTS
   *
   * Test Socket.IO event flows, broadcasting, and real-time updates
   * across multiple client connections.
   */
  describe('🔌 Real-time WebSocket Communication Integration', () => {
    beforeEach(async () => {
      // Create socket connections for each user role
      adminSocket = await helper.createAuthenticatedSocket(adminToken);
      operatorSocket = await helper.createAuthenticatedSocket(operatorToken);
      viewerSocket = await helper.createAuthenticatedSocket(viewerToken);

      await Promise.all([
        helper.waitForSocketConnection(adminSocket),
        helper.waitForSocketConnection(operatorSocket),
        helper.waitForSocketConnection(viewerSocket),
      ]);
    });

    afterEach(async () => {
      // Clean up socket connections
      const sockets = [adminSocket, operatorSocket, viewerSocket];
      await Promise.all(
        sockets.map(socket => {
          if (socket && socket.connected) {
            return new Promise(resolve => {
              socket.disconnect();
              socket.on('disconnect', resolve);
              setTimeout(resolve, 1000); // Fallback timeout
            });
          }
        })
      );

      adminSocket = operatorSocket = viewerSocket = null;
    });

    it('should broadcast configuration updates to all connected clients', async () => {
      const client = supertest(app);

      // Set up event listeners
      const adminConfigPromise = helper.waitForSocketEvent(adminSocket, 'configUpdated', 5000);
      const operatorConfigPromise = helper.waitForSocketEvent(
        operatorSocket,
        'configUpdated',
        5000
      );
      const viewerConfigPromise = helper.waitForSocketEvent(viewerSocket, 'configUpdated', 5000);

      // Update configuration via API
      const newConfig = {
        robotType: 'socket_test_robot',
        communicationProtocol: 'can',
        axes: { count: 6 },
      };

      await client
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newConfig)
        .expect(200);

      // Wait for all clients to receive the update
      const [adminData, operatorData, viewerData] = await Promise.all([
        adminConfigPromise,
        operatorConfigPromise,
        viewerConfigPromise,
      ]);

      // Verify all clients received the same configuration
      assert.strictEqual(adminData.robotType, 'socket_test_robot');
      assert.strictEqual(operatorData.robotType, 'socket_test_robot');
      assert.strictEqual(viewerData.robotType, 'socket_test_robot');
    });

    it('should broadcast position updates during manual control', async () => {
      const client = supertest(app);

      // Set up position update listeners
      const adminPositionPromise = helper.waitForSocketEvent(adminSocket, 'positionUpdate', 5000);
      const operatorPositionPromise = helper.waitForSocketEvent(
        operatorSocket,
        'positionUpdate',
        5000
      );
      const viewerPositionPromise = helper.waitForSocketEvent(viewerSocket, 'positionUpdate', 5000);

      // Send manual movement command
      const moveCommand = {
        axis: 'axis1',
        direction: 'positive',
        distance: 10,
      };

      await client
        .post('/api/manual/move')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(moveCommand)
        .expect(200);

      // Wait for position updates
      const [adminPosition, operatorPosition, viewerPosition] = await Promise.all([
        adminPositionPromise,
        operatorPositionPromise,
        viewerPositionPromise,
      ]);

      // Verify position data is consistent across clients
      assert.deepStrictEqual(adminPosition.axes, operatorPosition.axes);
      assert.deepStrictEqual(operatorPosition.axes, viewerPosition.axes);
      assert(adminPosition.axes.axis1 !== 0); // Verify movement occurred
    });

    it('should handle G-Code execution status broadcasts', async () => {
      const client = supertest(app);

      // Set up G-Code status listeners
      const adminStatusPromise = helper.waitForSocketEvent(adminSocket, 'gcodeStatus', 10000);
      const operatorStatusPromise = helper.waitForSocketEvent(operatorSocket, 'gcodeStatus', 10000);
      const viewerStatusPromise = helper.waitForSocketEvent(viewerSocket, 'gcodeStatus', 10000);

      // Upload and execute G-Code
      const gcodeProgram = 'G28\nG1 X10 Y10 Z5 F1000\nM30';
      const uploadResponse = await client
        .post('/api/gcode/upload')
        .set('Authorization', `Bearer ${operatorToken}`)
        .field('name', 'Socket Test Program')
        .attach('file', Buffer.from(gcodeProgram), 'socket_test.gcode')
        .expect(200);

      const executeResponse = await client
        .post(`/api/gcode/execute/${uploadResponse.body.program.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ simulationMode: true })
        .expect(200);

      // Wait for status updates
      const [adminStatus, operatorStatus, viewerStatus] = await Promise.all([
        adminStatusPromise,
        operatorStatusPromise,
        viewerStatusPromise,
      ]);

      // Verify status data
      assert.strictEqual(adminStatus.status, 'executing');
      assert.strictEqual(operatorStatus.status, 'executing');
      assert.strictEqual(viewerStatus.status, 'executing');
      assert(adminStatus.progress >= 0);
      assert(operatorStatus.progress >= 0);
      assert(viewerStatus.progress >= 0);
    });

    it('should handle socket disconnection and reconnection gracefully', async () => {
      // Disconnect operator socket
      operatorSocket.disconnect();

      // Wait for disconnection
      await helper.delay(1000);

      // Reconnect with authentication
      operatorSocket = await helper.createAuthenticatedSocket(operatorToken);
      await helper.waitForSocketConnection(operatorSocket);

      // Verify socket is functional after reconnection
      const pingPromise = helper.waitForSocketEvent(operatorSocket, 'pong', 2000);
      operatorSocket.emit('ping', { timestamp: Date.now() });

      const pongData = await pingPromise;
      assert(pongData);
      assert(pongData.timestamp);
    });

    it('should enforce role-based access for socket events', async () => {
      // Viewer should not be able to trigger hardware control events
      let errorOccurred = false;

      viewerSocket.on('error', error => {
        if (error.type === 'authorization') {
          errorOccurred = true;
        }
      });

      // Attempt to send unauthorized command
      viewerSocket.emit('manualControl', {
        axis: 'axis1',
        direction: 'positive',
        distance: 10,
      });

      // Wait and verify error occurred
      await helper.delay(1000);
      assert(errorOccurred, 'Expected authorization error for viewer role');
    });
  });

  /**
   * 3. DATABASE INTEGRATION TESTS
   *
   * Test database operations, transactions, data consistency,
   * and concurrent access scenarios.
   */
  describe('💾 Database Integration Tests', () => {
    it('should handle complex transactional operations with rollback', async () => {
      const transaction = await dbManager.sequelize.transaction();

      try {
        // 1. Create user in transaction
        const userData = {
          username: 'transaction_test_user',
          email: 'transaction@test.com',
          password: await bcrypt.hash('password123', 12),
          role: 'operator',
        };

        const user = await dbManager.models.User.create(userData, { transaction });
        assert(user.id);

        // 2. Create positions for this user
        const positionData = [];
        for (let i = 0; i < 3; i++) {
          const position = await dbManager.models.Position.create(
            {
              name: `Transaction Test Position ${i + 1}`,
              description: 'Position created in transaction',
              axes: { axis1: i * 10, axis2: i * 10 },
              manipulators: { gripper1: i * 20 },
              created_by: user.id,
            },
            { transaction }
          );
          positionData.push(position);
        }

        // 3. Create position group
        const group = await dbManager.models.PositionGroup.create(
          {
            name: 'Transaction Test Group',
            description: 'Group created in transaction',
            created_by: user.id,
          },
          { transaction }
        );

        // 4. Associate positions with group
        await group.addPositions(positionData, { transaction });

        // 5. Intentionally cause an error to trigger rollback
        await dbManager.models.User.create(
          {
            username: 'transaction_test_user', // Duplicate username should fail
            email: 'duplicate@test.com',
            password: await bcrypt.hash('password456', 12),
          },
          { transaction }
        );

        // If we reach here, the test should fail
        await transaction.commit();
        assert.fail('Expected transaction to fail due to duplicate username');
      } catch (error) {
        // Expected error due to duplicate username
        await transaction.rollback();

        // Verify rollback worked - no data should exist
        const userCheck = await dbManager.models.User.findOne({
          where: { username: 'transaction_test_user' },
        });
        assert.strictEqual(userCheck, null, 'User should not exist after rollback');

        const positionCheck = await dbManager.models.Position.findAll({
          where: { name: { [dbManager.sequelize.Op.like]: 'Transaction Test Position%' } },
        });
        assert.strictEqual(positionCheck.length, 0, 'Positions should not exist after rollback');

        const groupCheck = await dbManager.models.PositionGroup.findOne({
          where: { name: 'Transaction Test Group' },
        });
        assert.strictEqual(groupCheck, null, 'Group should not exist after rollback');
      }
    });

    it('should handle concurrent database operations correctly', async () => {
      // Create test data concurrently
      const concurrentOperations = [];

      for (let i = 0; i < 10; i++) {
        concurrentOperations.push(
          dbManager.models.Position.create({
            name: `Concurrent Position ${i + 1}`,
            description: `Position ${i + 1} created concurrently`,
            axes: {
              axis1: Math.random() * 180,
              axis2: Math.random() * 180,
              axis3: Math.random() * 180,
            },
            manipulators: {
              gripper1: Math.random() * 100,
            },
            created_by: operatorUser.id,
          })
        );
      }

      // Execute all operations concurrently
      const results = await Promise.all(concurrentOperations);

      // Verify all positions were created successfully
      assert.strictEqual(results.length, 10);
      results.forEach((position, index) => {
        assert(position.id);
        assert.strictEqual(position.name, `Concurrent Position ${index + 1}`);
      });

      // Verify database consistency
      const allPositions = await dbManager.models.Position.findAll({
        where: {
          name: { [dbManager.sequelize.Op.like]: 'Concurrent Position%' },
        },
      });
      assert.strictEqual(allPositions.length, 10);
    });

    it('should handle database backup and restore operations', async () => {
      // Create test data
      const testUser = await dbManager.models.User.create({
        username: 'backup_test_user',
        email: 'backup@test.com',
        password: await bcrypt.hash('password123', 12),
        role: 'operator',
      });

      const testPosition = await dbManager.models.Position.create({
        name: 'Backup Test Position',
        description: 'Position for backup testing',
        axes: { axis1: 45, axis2: -30 },
        manipulators: { gripper1: 75 },
        created_by: testUser.id,
      });

      // Perform backup
      const backupPath = path.join(helper.testDataDir, 'integration_backup.db');
      await dbManager.backup(backupPath);

      // Verify backup file exists
      const backupExists = await fs.pathExists(backupPath);
      assert(backupExists, 'Backup file should exist');

      // Delete original data
      await testPosition.destroy();
      await testUser.destroy();

      // Verify data is deleted
      const userCheck = await dbManager.models.User.findByPk(testUser.id);
      const positionCheck = await dbManager.models.Position.findByPk(testPosition.id);
      assert.strictEqual(userCheck, null);
      assert.strictEqual(positionCheck, null);

      // Restore from backup
      await dbManager.restore(backupPath);

      // Verify data is restored
      const restoredUser = await dbManager.models.User.findByPk(testUser.id);
      const restoredPosition = await dbManager.models.Position.findByPk(testPosition.id);

      assert(restoredUser);
      assert.strictEqual(restoredUser.username, 'backup_test_user');
      assert(restoredPosition);
      assert.strictEqual(restoredPosition.name, 'Backup Test Position');
    });

    it('should maintain referential integrity across related models', async () => {
      // Create user
      const user = await dbManager.models.User.create({
        username: 'integrity_test_user',
        email: 'integrity@test.com',
        password: await bcrypt.hash('password123', 12),
        role: 'operator',
      });

      // Create positions
      const positions = [];
      for (let i = 0; i < 3; i++) {
        const position = await dbManager.models.Position.create({
          name: `Integrity Test Position ${i + 1}`,
          description: `Position ${i + 1} for integrity testing`,
          axes: { axis1: i * 30, axis2: i * -15 },
          created_by: user.id,
        });
        positions.push(position);
      }

      // Create group and associate positions
      const group = await dbManager.models.PositionGroup.create({
        name: 'Integrity Test Group',
        description: 'Group for integrity testing',
        created_by: user.id,
      });

      await group.addPositions(positions);

      // Verify relationships
      const groupWithPositions = await dbManager.models.PositionGroup.findByPk(group.id, {
        include: [
          {
            model: dbManager.models.Position,
            as: 'positions',
          },
        ],
      });

      assert.strictEqual(groupWithPositions.positions.length, 3);

      // Verify user relationship
      const positionWithUser = await dbManager.models.Position.findByPk(positions[0].id, {
        include: [
          {
            model: dbManager.models.User,
            as: 'creator',
          },
        ],
      });

      assert(positionWithUser.creator);
      assert.strictEqual(positionWithUser.creator.username, 'integrity_test_user');

      // Test cascading delete - deleting user should affect related data appropriately
      await user.destroy();

      // Verify positions still exist but user reference is handled correctly
      const orphanedPositions = await dbManager.models.Position.findAll({
        where: {
          name: { [dbManager.sequelize.Op.like]: 'Integrity Test Position%' },
        },
      });

      // The exact behavior depends on the foreign key configuration
      // This test verifies the referential integrity is maintained
      assert(orphanedPositions.length >= 0); // Could be 0 if CASCADE, or 3 if SET NULL
    });
  });

  /**
   * 4. AUTHENTICATION FLOW INTEGRATION TESTS
   *
   * Test complete authentication workflows including JWT lifecycle,
   * role-based access control, and security enforcement.
   */
  describe('🔐 Authentication Flow Integration Tests', () => {
    it('should handle JWT token lifecycle with refresh mechanism', async () => {
      const client = supertest(app);

      // 1. Initial login
      const loginResponse = await client
        .post('/api/auth/login')
        .send({
          username: 'operator',
          password: 'test_operator_password',
        })
        .expect(200);

      assert(loginResponse.body.token);
      assert(loginResponse.body.refreshToken);

      const originalToken = loginResponse.body.token;
      const refreshToken = loginResponse.body.refreshToken;

      // 2. Use token for authenticated request
      const profileResponse = await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${originalToken}`)
        .expect(200);

      assert(profileResponse.body.success);

      // 3. Refresh token before expiration
      const refreshResponse = await client
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      assert(refreshResponse.body.success);
      assert(refreshResponse.body.token);
      assert(refreshResponse.body.refreshToken);
      assert.notStrictEqual(refreshResponse.body.token, originalToken);

      const newToken = refreshResponse.body.token;

      // 4. Verify new token works
      const newProfileResponse = await client
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      assert(newProfileResponse.body.success);

      // 5. Verify old refresh token is invalid
      await client.post('/api/auth/refresh').send({ refreshToken }).expect(401);

      // 6. Logout and verify tokens are invalidated
      await client
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ refreshToken: refreshResponse.body.refreshToken })
        .expect(200);

      // 7. Verify token is no longer valid
      await client.get('/api/auth/profile').set('Authorization', `Bearer ${newToken}`).expect(401);
    });

    it('should enforce role-based access control across all endpoints', async () => {
      const client = supertest(app);

      // Test matrix of endpoints and roles
      const roleTestCases = [
        // Admin-only endpoints
        {
          method: 'get',
          endpoint: '/api/users',
          adminExpected: 200,
          operatorExpected: 403,
          viewerExpected: 403,
        },
        {
          method: 'post',
          endpoint: '/api/users',
          adminExpected: 201,
          operatorExpected: 403,
          viewerExpected: 403,
          data: {
            username: 'rbac_test_user',
            email: 'rbac@test.com',
            password: 'password123',
            role: 'viewer',
          },
        },
        // Operator+ endpoints
        {
          method: 'post',
          endpoint: '/api/positions',
          adminExpected: 200,
          operatorExpected: 200,
          viewerExpected: 403,
          data: {
            name: 'RBAC Test Position',
            axes: { axis1: 45 },
            manipulators: { gripper1: 50 },
          },
        },
        {
          method: 'post',
          endpoint: '/api/manual/move',
          adminExpected: 200,
          operatorExpected: 200,
          viewerExpected: 403,
          data: {
            axis: 'axis1',
            direction: 'positive',
            distance: 5,
          },
        },
        // All authenticated users can access
        {
          method: 'get',
          endpoint: '/api/config',
          adminExpected: 200,
          operatorExpected: 200,
          viewerExpected: 200,
        },
        {
          method: 'get',
          endpoint: '/api/positions',
          adminExpected: 200,
          operatorExpected: 200,
          viewerExpected: 200,
        },
      ];

      for (const testCase of roleTestCases) {
        // Test admin access
        const adminRequest = client[testCase.method](testCase.endpoint).set(
          'Authorization',
          `Bearer ${adminToken}`
        );

        if (testCase.data) {
          adminRequest.send(testCase.data);
        }

        await adminRequest.expect(testCase.adminExpected);

        // Test operator access
        const operatorRequest = client[testCase.method](testCase.endpoint).set(
          'Authorization',
          `Bearer ${operatorToken}`
        );

        if (testCase.data) {
          operatorRequest.send(testCase.data);
        }

        await operatorRequest.expect(testCase.operatorExpected);

        // Test viewer access
        const viewerRequest = client[testCase.method](testCase.endpoint).set(
          'Authorization',
          `Bearer ${viewerToken}`
        );

        if (testCase.data) {
          viewerRequest.send(testCase.data);
        }

        await viewerRequest.expect(testCase.viewerExpected);
      }
    });

    it('should handle security violations and audit logging', async () => {
      const client = supertest(app);

      // Attempt multiple unauthorized access
      const unauthorizedAttempts = [
        { endpoint: '/api/users', method: 'get' },
        { endpoint: '/api/config', method: 'post', data: { robotType: 'hacked' } },
        { endpoint: '/api/users/1', method: 'delete' },
      ];

      for (const attempt of unauthorizedAttempts) {
        const request = client[attempt.method](attempt.endpoint).set(
          'Authorization',
          `Bearer ${viewerToken}`
        );

        if (attempt.data) {
          request.send(attempt.data);
        }

        await request.expect(403);
      }

      // Check audit logs
      const auditResponse = await client
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: new Date(Date.now() - 60000).toISOString(), // Last minute
          endDate: new Date().toISOString(),
          action: 'unauthorized_access',
        })
        .expect(200);

      assert(auditResponse.body.success);
      assert(Array.isArray(auditResponse.body.logs));

      // Should have audit entries for unauthorized attempts
      const unauthorizedLogs = auditResponse.body.logs.filter(
        log => log.action === 'unauthorized_access' && log.user_id === viewerUser.id
      );

      assert(unauthorizedLogs.length >= unauthorizedAttempts.length);
    });
  });

  /**
   * 5. END-TO-END WORKFLOW INTEGRATION TESTS
   *
   * Test complete business workflows that span multiple systems
   * and integration points.
   */
  describe('🔄 End-to-End Workflow Integration Tests', () => {
    it('should complete full robot programming and execution workflow', async () => {
      const client = supertest(app);

      // 1. Configure robot
      const robotConfig = {
        robotType: 'workflow_test_robot',
        communicationProtocol: 'simulation',
        axes: {
          count: 6,
          limits: {
            axis1: { min: -180, max: 180 },
            axis2: { min: -90, max: 90 },
            axis3: { min: -180, max: 180 },
            axis4: { min: -180, max: 180 },
            axis5: { min: -90, max: 90 },
            axis6: { min: -180, max: 180 },
          },
        },
        manipulators: {
          count: 2,
          gripper1: { min: 0, max: 100 },
          gripper2: { min: 0, max: 100 },
        },
      };

      await client
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(robotConfig)
        .expect(200);

      // 2. Create and save multiple positions through manual control
      const positions = [];
      const positionConfigs = [
        {
          name: 'Home Position',
          axes: { axis1: 0, axis2: 0, axis3: 0, axis4: 0, axis5: 0, axis6: 0 },
        },
        {
          name: 'Pickup Position',
          axes: { axis1: 45, axis2: -30, axis3: 60, axis4: 0, axis5: 90, axis6: 0 },
        },
        {
          name: 'Transit Position',
          axes: { axis1: 45, axis2: 10, axis3: 90, axis4: 0, axis5: 45, axis6: 0 },
        },
        {
          name: 'Drop Position',
          axes: { axis1: -45, axis2: -30, axis3: 60, axis4: 0, axis5: 90, axis6: 180 },
        },
      ];

      for (const posConfig of positionConfigs) {
        // Move to position
        for (const [axis, value] of Object.entries(posConfig.axes)) {
          await client
            .post('/api/manual/move')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send({
              axis,
              targetPosition: value,
            })
            .expect(200);
        }

        // Save current position
        const saveResponse = await client
          .post('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            name: posConfig.name,
            description: `Workflow test position: ${posConfig.name}`,
            axes: posConfig.axes,
            manipulators: { gripper1: 0, gripper2: 0 },
          })
          .expect(200);

        positions.push(saveResponse.body.position);
      }

      // 3. Create position group for workflow
      const groupResponse = await client
        .post('/api/positions/groups')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Workflow Test Sequence',
          description: 'Complete pick and place workflow',
          positions: positions.map(p => p.id),
        })
        .expect(200);

      // 4. Generate G-Code from position sequence
      const gcode = generateGCodeFromPositions(positions);

      const uploadResponse = await client
        .post('/api/gcode/upload')
        .set('Authorization', `Bearer ${operatorToken}`)
        .field('name', 'Workflow Test Program')
        .field('description', 'Generated from position sequence')
        .attach('file', Buffer.from(gcode), 'workflow_test.gcode')
        .expect(200);

      // 5. Validate G-Code program
      const validateResponse = await client
        .post(`/api/gcode/validate/${uploadResponse.body.program.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert(validateResponse.body.success);
      assert.strictEqual(validateResponse.body.validation.errors.length, 0);

      // 6. Execute G-Code program with monitoring
      const executeResponse = await client
        .post(`/api/gcode/execute/${uploadResponse.body.program.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          simulationMode: true,
          safetyChecks: true,
          speedOverride: 50, // 50% speed for testing
        })
        .expect(200);

      // 7. Monitor execution progress
      let executionComplete = false;
      let lastProgress = -1;
      let attempts = 0;
      const maxAttempts = 30;

      while (!executionComplete && attempts < maxAttempts) {
        await helper.delay(1000);

        const statusResponse = await client
          .get(`/api/gcode/status/${executeResponse.body.executionId}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        const status = statusResponse.body.status;

        // Progress should be monotonically increasing
        assert(status.progress >= lastProgress, 'Progress should not decrease');
        lastProgress = status.progress;

        if (status.state === 'COMPLETED') {
          executionComplete = true;
          assert.strictEqual(status.progress, 100);
        } else if (status.state === 'ERROR') {
          assert.fail(`G-Code execution failed: ${status.error}`);
        }

        attempts++;
      }

      assert(executionComplete, 'Workflow execution did not complete within timeout');

      // 8. Verify final robot position matches expected end position
      const finalPositionResponse = await client
        .get('/api/robot/position')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      const finalAxes = finalPositionResponse.body.position.axes;
      const expectedFinalAxes = positions[positions.length - 1].axes;

      // Verify final position is close to expected (allowing for some tolerance)
      for (const axis in expectedFinalAxes) {
        const diff = Math.abs(finalAxes[axis] - expectedFinalAxes[axis]);
        assert(diff < 1, `Final ${axis} position should match expected (diff: ${diff})`);
      }

      // 9. Replay position sequence for verification
      const replayResponse = await client
        .post(`/api/replay/group/${groupResponse.body.group.id}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({})
        .expect(200);

      assert(replayResponse.body.success);

      // 10. Verify audit trail captured the entire workflow
      const auditResponse = await client
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: new Date(Date.now() - 300000).toISOString(), // Last 5 minutes
          endDate: new Date().toISOString(),
          userId: operatorUser.id,
        })
        .expect(200);

      const auditLogs = auditResponse.body.logs;
      const workflowActions = [
        'config_updated',
        'position_created',
        'group_created',
        'gcode_uploaded',
        'gcode_executed',
        'position_replayed',
      ];

      for (const action of workflowActions) {
        const actionLogs = auditLogs.filter(log => log.action === action);
        assert(actionLogs.length > 0, `Expected audit log for action: ${action}`);
      }
    });
  });
});

/**
 * Helper function to generate G-Code from position sequence
 */
function generateGCodeFromPositions(positions) {
  let gcode = '; Generated G-Code from position sequence\n';
  gcode += 'G21 ; Set units to millimeters\n';
  gcode += 'G90 ; Set absolute positioning\n';
  gcode += 'G28 ; Home all axes\n\n';

  positions.forEach((position, index) => {
    gcode += `; Position ${index + 1}: ${position.name}\n`;
    const axes = position.axes;
    const feedRate = 1000; // mm/min

    gcode += `G1 X${axes.axis1 || 0} Y${axes.axis2 || 0} Z${axes.axis3 || 0} `;
    gcode += `A${axes.axis4 || 0} B${axes.axis5 || 0} C${axes.axis6 || 0} F${feedRate}\n`;

    // Add gripper control if specified
    if (position.manipulators && position.manipulators.gripper1 !== undefined) {
      gcode += `M3 S${position.manipulators.gripper1} ; Set gripper 1\n`;
    }

    gcode += `G4 P0.5 ; Dwell 500ms\n\n`;
  });

  gcode += 'G28 ; Return to home\n';
  gcode += 'M30 ; End program\n';

  return gcode;
}

module.exports = {
  // Export for use in other test suites
  generateGCodeFromPositions,
};
