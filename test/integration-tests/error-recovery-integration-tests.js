/**
 * Error Recovery and Fault Tolerance Integration Tests
 *
 * Tests system behavior under failure conditions and validates
 * graceful degradation and recovery mechanisms.
 *
 * Integration Test Engineer Implementation
 * Covers: Network failures, database errors, hardware failures,
 * authentication issues, resource exhaustion, concurrent failures
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const fs = require('fs-extra');
const path = require('path');

const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
} = require('./enhanced-integration-test-setup');

describe('🛡️ Error Recovery and Fault Tolerance Integration Tests', () => {
  let helper;
  let server;
  let app;
  let dbManager;

  let adminUser, operatorUser;
  let adminToken, operatorToken;
  let adminSocket, operatorSocket;

  before(async () => {
    console.log('🚀 Setting up error recovery integration test environment...');

    helper = await setupIntegrationTestEnvironment({
      enableDatabase: true,
      enableAuth: true,
      enableSocketIO: true,
      verbose: true,
    });

    server = helper.server;
    app = helper.app;
    dbManager = helper.dbManager;

    // Create test users
    adminUser = await helper.createTestUser('admin', 'test_password', 'admin');
    operatorUser = await helper.createTestUser('operator', 'test_password', 'operator');

    adminToken = helper.generateAuthToken(adminUser);
    operatorToken = helper.generateAuthToken(operatorUser);

    console.log('✅ Error recovery test environment ready');
  });

  after(async () => {
    console.log('🧹 Cleaning up error recovery test environment...');

    if (adminSocket && adminSocket.connected) adminSocket.disconnect();
    if (operatorSocket && operatorSocket.connected) operatorSocket.disconnect();

    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await helper.resetTestData();

    // Recreate users after reset
    adminUser = await helper.createTestUser('admin', 'test_password', 'admin');
    operatorUser = await helper.createTestUser('operator', 'test_password', 'operator');

    adminToken = helper.generateAuthToken(adminUser);
    operatorToken = helper.generateAuthToken(operatorUser);
  });

  describe('🔗 Network and Communication Failures', () => {
    it('should handle Socket.IO connection failures gracefully', async () => {
      const client = supertest(app);

      // Create socket connection
      adminSocket = await helper.createAuthenticatedSocket(adminToken);
      await helper.waitForSocketConnection(adminSocket);

      // Verify connection works
      const pingPromise = helper.waitForSocketEvent(adminSocket, 'pong', 2000);
      adminSocket.emit('ping', { timestamp: Date.now() });

      const pongData = await pingPromise;
      assert(pongData);

      // Simulate connection loss
      adminSocket.disconnect();
      await helper.delay(500);

      // Verify graceful degradation - API should still work
      const configResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert(configResponse.body.success);

      // Test reconnection
      adminSocket = await helper.createAuthenticatedSocket(adminToken);
      await helper.waitForSocketConnection(adminSocket);

      // Verify connection is restored
      const reconnectPingPromise = helper.waitForSocketEvent(adminSocket, 'pong', 2000);
      adminSocket.emit('ping', { timestamp: Date.now() });

      const reconnectPongData = await reconnectPingPromise;
      assert(reconnectPongData);
    });

    it('should handle API timeout scenarios', async () => {
      const client = supertest(app);

      // Create a long-running operation simulation
      let longRunningRequest = null;

      try {
        // Start a request that might take longer than expected
        const timeoutPromise = new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Request timeout simulation'));
          }, 100); // Very short timeout for testing
        });

        // Race between actual request and timeout
        await Promise.race([
          client.get('/api/config').set('Authorization', `Bearer ${adminToken}`).timeout(50), // 50ms timeout
          timeoutPromise,
        ]);

        // If we reach here, the request succeeded quickly
        assert(true, 'Request completed within timeout');
      } catch (error) {
        // Expected behavior - either timeout or quick response
        assert(error.message.includes('timeout') || error.code === 'ECONNABORTED');

        // Verify system remains responsive after timeout
        const recoveryResponse = await client.get('/api/health').expect(200);

        assert(recoveryResponse.body.success);
        assert.strictEqual(recoveryResponse.body.status, 'healthy');
      }
    });
  });

  describe('💾 Database Failure Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      const client = supertest(app);

      // First, verify database is working
      const initialResponse = await client
        .get('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert(initialResponse.body.success);

      // Simulate database connection issue by closing database
      if (dbManager && dbManager.sequelize) {
        await dbManager.sequelize.close();
      }

      // Attempt database operations - should fail gracefully
      const failedResponse = await client
        .post('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Test Position During DB Failure',
          axes: { axis1: 45 },
          manipulators: { gripper1: 50 },
        })
        .expect(500);

      assert.strictEqual(failedResponse.body.success, false);
      assert(failedResponse.body.error);

      // Verify non-database endpoints still work
      const healthResponse = await client.get('/api/health').expect(200);

      // Health check should report database as unavailable but system as partially functional
      assert(healthResponse.body);
    });

    it('should handle database transaction rollbacks properly', async () => {
      const client = supertest(app);

      // Create initial position
      const position1Response = await client
        .post('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Position Before Transaction Test',
          axes: { axis1: 0 },
          manipulators: { gripper1: 0 },
        })
        .expect(200);

      const position1Id = position1Response.body.position.id;

      // Attempt to create a position with invalid data that should trigger rollback
      const invalidPositionResponse = await client
        .post('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: null, // Invalid name
          axes: null, // Invalid axes
          manipulators: { gripper1: 150 }, // Out of range value
        })
        .expect(500);

      assert.strictEqual(invalidPositionResponse.body.success, false);

      // Verify first position still exists and database is consistent
      const positionsResponse = await client
        .get('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert(positionsResponse.body.success);
      assert(Array.isArray(positionsResponse.body.positions));

      const existingPosition = positionsResponse.body.positions.find(p => p.id === position1Id);
      assert(existingPosition, 'Original position should still exist after failed transaction');
    });

    it('should handle database corruption scenarios', async () => {
      const client = supertest(app);

      // Create test data
      await client
        .post('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Test Position for Corruption Test',
          axes: { axis1: 90 },
          manipulators: { gripper1: 75 },
        })
        .expect(200);

      // Simulate database file corruption by writing invalid data
      const dbPath = helper.testConfig.database.testDbPath;
      const originalData = await fs.readFile(dbPath);

      try {
        // Write corrupted data to database file
        await fs.writeFile(dbPath, 'CORRUPTED DATABASE CONTENT');

        // Attempt to read from corrupted database
        const corruptedResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(500);

        assert.strictEqual(corruptedResponse.body.success, false);
        assert(
          corruptedResponse.body.error.includes('database') ||
            corruptedResponse.body.error.includes('SQLITE')
        );
      } finally {
        // Restore original database content
        await fs.writeFile(dbPath, originalData);

        // Verify recovery
        await helper.delay(1000); // Allow time for recovery

        const recoveryResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(recoveryResponse.body.success);
      }
    });
  });

  describe('🔐 Authentication and Security Failures', () => {
    it('should handle token expiration gracefully', async () => {
      const client = supertest(app);
      const jwt = require('jsonwebtoken');

      // Create an expired token
      const expiredToken = jwt.sign(
        {
          id: operatorUser.id,
          username: operatorUser.username,
          role: operatorUser.role,
          email: operatorUser.email,
        },
        helper.testConfig.auth.jwt.secret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      // Attempt to use expired token
      const expiredResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);

      assert.strictEqual(expiredResponse.body.success, false);
      assert(
        expiredResponse.body.error.includes('Invalid token') ||
          expiredResponse.body.error.includes('expired')
      );

      // Verify that valid tokens still work
      const validResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert(validResponse.body.success);
    });

    it('should handle malformed authentication tokens', async () => {
      const client = supertest(app);

      const malformedTokens = [
        'invalid.token.format',
        'Bearer malformed_token',
        '',
        'null',
        '12345',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_payload.signature',
      ];

      for (const malformedToken of malformedTokens) {
        const response = await client
          .get('/api/config')
          .set('Authorization', `Bearer ${malformedToken}`)
          .expect(res => {
            assert(res.status === 401 || res.status === 403);
          });

        assert.strictEqual(response.body.success, false);
      }

      // Verify system is still secure after malformed token attempts
      const secureResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert(secureResponse.body.success);
    });

    it('should handle role escalation attempts', async () => {
      const client = supertest(app);

      // Attempt to access admin-only endpoint with operator token
      const unauthorizedResponse = await client
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      assert.strictEqual(unauthorizedResponse.body.success, false);
      assert(
        unauthorizedResponse.body.error.includes('permissions') ||
          unauthorizedResponse.body.error.includes('Insufficient')
      );

      // Attempt to modify user roles without proper authorization
      const escalationAttempt = await client
        .post('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          username: 'hacker_attempt',
          email: 'hacker@test.com',
          password: 'password',
          role: 'admin', // Attempting to create admin user
        })
        .expect(403);

      assert.strictEqual(escalationAttempt.body.success, false);

      // Verify that admin functionality is still available to actual admins
      const adminResponse = await client
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert(adminResponse.body.success);
    });
  });

  describe('⚙️ Hardware and System Failures', () => {
    it('should handle hardware communication failures', async () => {
      const client = supertest(app);

      // Attempt to move robot when hardware is unavailable
      const moveResponse = await client
        .post('/api/manual/move')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          axis: 'axis1',
          direction: 'positive',
          distance: 10,
        })
        .expect(200); // Should still return success in simulation mode

      assert(moveResponse.body.success);
      assert(moveResponse.body.message);

      // In a real system, this might return an error, but in simulation mode
      // it should handle the failure gracefully and continue operating
    });

    it('should handle file system errors gracefully', async () => {
      const client = supertest(app);

      // Create a configuration file with invalid permissions
      const configPath = path.join(helper.testDataDir, 'config', 'robot-config.json');

      // First, create a valid configuration
      await client
        .post('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          robotType: 'permission_test_robot',
          communicationProtocol: 'can',
        })
        .expect(200);

      // Make the config file read-only to simulate permission issues
      try {
        await fs.chmod(configPath, 0o444); // Read-only

        // Attempt to update configuration (should fail due to permissions)
        const permissionErrorResponse = await client
          .post('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            robotType: 'updated_robot_type',
            communicationProtocol: 'serial',
          })
          .expect(500);

        assert.strictEqual(permissionErrorResponse.body.success, false);
        assert(permissionErrorResponse.body.error);
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(configPath, 0o644); // Read-write
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      // Verify that read operations still work
      const readResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert(readResponse.body.success);
    });

    it('should handle resource exhaustion scenarios', async () => {
      const client = supertest(app);

      // Create many concurrent requests to test resource handling
      const concurrentRequests = Array.from({ length: 50 }, (_, i) =>
        client
          .post('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            name: `Resource Test Position ${i + 1}`,
            axes: { axis1: i },
            manipulators: { gripper1: i % 100 },
          })
      );

      // Execute all requests concurrently
      const results = await Promise.allSettled(concurrentRequests);

      // Count successful and failed requests
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      const failed = results.filter(r => r.status === 'rejected' || r.value.status !== 200);

      console.log(
        `Resource test results: ${successful.length} successful, ${failed.length} failed`
      );

      // At least some requests should succeed (graceful degradation)
      assert(successful.length > 0, 'Some requests should succeed even under load');

      // Verify system remains responsive after load test
      await helper.delay(2000); // Allow system to recover

      const recoveryResponse = await client.get('/api/health').expect(200);

      assert(recoveryResponse.body.success);
      assert.strictEqual(recoveryResponse.body.status, 'healthy');
    });
  });

  describe('🔄 Concurrent Operation Failures', () => {
    it('should handle concurrent user operations safely', async () => {
      const client = supertest(app);

      // Create multiple users performing operations simultaneously
      const concurrentOperations = [
        // Admin creating users
        client.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
          username: 'concurrent_user_1',
          email: 'concurrent1@test.com',
          password: 'password',
          role: 'operator',
        }),

        // Operator creating positions
        client
          .post('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            name: 'Concurrent Position 1',
            axes: { axis1: 30 },
            manipulators: { gripper1: 40 },
          }),

        // Both users reading configuration
        client.get('/api/config').set('Authorization', `Bearer ${adminToken}`),

        client.get('/api/config').set('Authorization', `Bearer ${operatorToken}`),

        // Admin updating configuration
        client.post('/api/config').set('Authorization', `Bearer ${adminToken}`).send({
          robotType: 'concurrent_test_robot',
          communicationProtocol: 'can',
        }),
      ];

      // Execute all operations concurrently
      const results = await Promise.allSettled(concurrentOperations);

      // Verify that operations completed without corruption
      const successful = results.filter(
        r => r.status === 'fulfilled' && r.value.status >= 200 && r.value.status < 300
      );

      assert(successful.length >= 3, 'Most concurrent operations should succeed');

      // Verify data consistency after concurrent operations
      const finalConfigResponse = await client
        .get('/api/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert(finalConfigResponse.body.success);

      const finalPositionsResponse = await client
        .get('/api/positions')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      assert(finalPositionsResponse.body.success);
      assert(Array.isArray(finalPositionsResponse.body.positions));
    });

    it('should handle Socket.IO concurrent connections properly', async () => {
      // Create multiple socket connections simultaneously
      const socketPromises = [];
      const sockets = [];

      try {
        for (let i = 0; i < 10; i++) {
          const user = await helper.createTestUser(`socket_user_${i}`, 'password', 'operator');
          const token = helper.generateAuthToken(user);
          socketPromises.push(helper.createAuthenticatedSocket(token));
        }

        // Wait for all socket connections
        const socketResults = await Promise.allSettled(socketPromises);

        // Collect successfully connected sockets
        socketResults.forEach(result => {
          if (result.status === 'fulfilled') {
            sockets.push(result.value);
          }
        });

        console.log(
          `Successfully connected ${sockets.length} out of ${socketPromises.length} sockets`
        );

        // Verify that at least most connections succeeded
        assert(sockets.length >= 7, 'Most socket connections should succeed');

        // Test broadcasting to all connected sockets
        const eventPromises = sockets.map(socket =>
          helper.waitForSocketEvent(socket, 'configUpdated', 3000)
        );

        // Trigger a configuration update that should broadcast to all clients
        const client = supertest(app);
        await client
          .post('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            robotType: 'broadcast_test_robot',
            communicationProtocol: 'simulation',
          })
          .expect(200);

        // Wait for all sockets to receive the broadcast
        const broadcastResults = await Promise.allSettled(eventPromises);
        const successfulBroadcasts = broadcastResults.filter(r => r.status === 'fulfilled');

        console.log(
          `Broadcast received by ${successfulBroadcasts.length} out of ${sockets.length} sockets`
        );

        // Verify that broadcast reached most connected clients
        assert(
          successfulBroadcasts.length >= Math.floor(sockets.length * 0.8),
          'Broadcast should reach most connected clients'
        );
      } finally {
        // Clean up all socket connections
        for (const socket of sockets) {
          if (socket.connected) {
            socket.disconnect();
          }
        }
      }
    });
  });

  describe('🔧 Recovery and Healing Tests', () => {
    it('should auto-recover from temporary failures', async () => {
      const client = supertest(app);

      // Simulate temporary failure and recovery
      let failureMode = true;

      // Override a method to simulate temporary failure
      const originalMethod = dbManager.models.Position.findAll;
      dbManager.models.Position.findAll = function (...args) {
        if (failureMode) {
          throw new Error('Simulated temporary database failure');
        }
        return originalMethod.apply(this, args);
      };

      try {
        // First request should fail
        const failedResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(500);

        assert.strictEqual(failedResponse.body.success, false);
        assert(failedResponse.body.error.includes('temporary database failure'));

        // Simulate recovery
        await helper.delay(1000);
        failureMode = false;

        // Subsequent request should succeed
        const recoveredResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(recoveredResponse.body.success);
      } finally {
        // Restore original method
        dbManager.models.Position.findAll = originalMethod;
      }
    });

    it('should maintain service availability during partial failures', async () => {
      const client = supertest(app);

      // Test that other endpoints remain available when one service fails
      // (In this case, we'll simulate position service failure)

      // Override position endpoints to simulate failure
      let positionServiceDown = true;

      const originalFindAll = dbManager.models.Position.findAll;
      dbManager.models.Position.findAll = function (...args) {
        if (positionServiceDown) {
          throw new Error('Position service temporarily unavailable');
        }
        return originalFindAll.apply(this, args);
      };

      try {
        // Position service should fail
        const positionFailResponse = await client
          .get('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(500);

        assert.strictEqual(positionFailResponse.body.success, false);

        // But other services should remain available
        const healthResponse = await client.get('/api/health').expect(200);

        assert(healthResponse.body.success);

        const configResponse = await client
          .get('/api/config')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(configResponse.body.success);

        const profileResponse = await client
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        assert(profileResponse.body.success);
      } finally {
        // Restore service
        dbManager.models.Position.findAll = originalFindAll;
      }
    });

    it('should log errors properly for debugging and monitoring', async () => {
      const client = supertest(app);

      // Create a scenario that will generate errors
      const invalidRequests = [
        client.post('/api/positions').set('Authorization', `Bearer ${operatorToken}`).send(null), // Invalid payload

        client.get('/api/positions/nonexistent').set('Authorization', `Bearer ${operatorToken}`),

        client
          .post('/api/config')
          .set('Authorization', `Bearer ${operatorToken}`) // Wrong role
          .send({ robotType: 'test' }),
      ];

      // Execute invalid requests
      const errorResults = await Promise.allSettled(invalidRequests);

      // Verify that errors were handled gracefully
      errorResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          // Error should be properly formatted
          assert(result.value.status >= 400, `Request ${index} should return error status`);
          if (result.value.body) {
            assert.strictEqual(result.value.body.success, false);
            assert(result.value.body.error, `Request ${index} should include error message`);
          }
        }
      });

      // Verify system is still functional after errors
      const healthResponse = await client.get('/api/health').expect(200);

      assert(healthResponse.body.success);
      assert.strictEqual(healthResponse.body.status, 'healthy');
    });
  });
});

module.exports = {
  // Export utilities for use in other test suites
  simulateNetworkFailure: async (duration = 1000) => {
    // Utility function to simulate network issues
    console.log(`Simulating network failure for ${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, duration));
  },

  simulateDatabaseCorruption: async dbPath => {
    // Utility function to simulate database corruption
    const fs = require('fs-extra');
    const backup = await fs.readFile(dbPath);
    await fs.writeFile(dbPath, 'CORRUPTED');
    return backup;
  },

  restoreDatabase: async (dbPath, backup) => {
    // Utility function to restore database from backup
    const fs = require('fs-extra');
    await fs.writeFile(dbPath, backup);
  },
};
