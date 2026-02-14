/**
 * Performance Integration Tests
 *
 * Tests system performance under various load conditions and validates
 * response times, throughput, and resource utilization across all
 * integration points.
 *
 * Integration Test Engineer Implementation
 * Covers: API response times, Socket.IO latency, Database performance,
 * Concurrent user load, Memory usage, Resource scaling
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const { performance } = require('perf_hooks');

const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
} = require('./enhanced-integration-test-setup');

describe('⚡ Performance Integration Tests', () => {
  let helper;
  let server;
  let app;
  let dbManager;

  let adminUser, operatorUser;
  let adminToken, operatorToken;

  // Performance thresholds (in milliseconds)
  const PERFORMANCE_THRESHOLDS = {
    API_RESPONSE_TIME: 200,
    SOCKET_LATENCY: 50,
    DATABASE_QUERY_TIME: 100,
    CONCURRENT_REQUEST_AVG: 300,
    MEMORY_GROWTH_LIMIT: 50 * 1024 * 1024, // 50MB
  };

  before(async () => {
    console.log('🚀 Setting up performance integration test environment...');

    helper = await setupIntegrationTestEnvironment({
      enableDatabase: true,
      enableAuth: true,
      enableSocketIO: true,
      verbose: false, // Reduce logging for performance tests
    });

    server = helper.server;
    app = helper.app;
    dbManager = helper.dbManager;

    // Create test users
    adminUser = await helper.createTestUser('admin', 'test_password', 'admin');
    operatorUser = await helper.createTestUser('operator', 'test_password', 'operator');

    adminToken = helper.generateAuthToken(adminUser);
    operatorToken = helper.generateAuthToken(operatorUser);

    console.log('✅ Performance test environment ready');
  });

  after(async () => {
    console.log('🧹 Cleaning up performance test environment...');
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    // Reset test data but keep users for performance consistency
    await helper.resetTestData();

    // Recreate users
    adminUser = await helper.createTestUser('admin', 'test_password', 'admin');
    operatorUser = await helper.createTestUser('operator', 'test_password', 'operator');

    adminToken = helper.generateAuthToken(adminUser);
    operatorToken = helper.generateAuthToken(operatorUser);

    // Force garbage collection to ensure clean memory state
    if (global.gc) {
      global.gc();
    }
  });

  describe('🌐 API Performance Tests', () => {
    it('should meet API response time thresholds for all endpoints', async () => {
      const client = supertest(app);
      const performanceResults = [];

      // Test critical API endpoints
      const apiEndpoints = [
        { method: 'get', url: '/api/health', auth: false },
        { method: 'get', url: '/api/config', auth: true },
        { method: 'get', url: '/api/positions', auth: true },
        { method: 'get', url: '/api/auth/profile', auth: true },
        {
          method: 'post',
          url: '/api/manual/move',
          auth: true,
          body: { axis: 'axis1', direction: 'positive', distance: 10 },
        },
      ];

      for (const endpoint of apiEndpoints) {
        const startTime = performance.now();

        let request = client[endpoint.method](endpoint.url);

        if (endpoint.auth) {
          request = request.set('Authorization', `Bearer ${operatorToken}`);
        }

        if (endpoint.body) {
          request = request.send(endpoint.body);
        }

        const response = await request.expect(res => {
          assert(
            res.status >= 200 && res.status < 400,
            `Expected success status for ${endpoint.method.toUpperCase()} ${endpoint.url}`
          );
        });

        const endTime = performance.now();
        const responseTime = endTime - startTime;

        performanceResults.push({
          endpoint: `${endpoint.method.toUpperCase()} ${endpoint.url}`,
          responseTime,
          status: response.status,
        });

        console.log(
          `${endpoint.method.toUpperCase()} ${endpoint.url}: ${responseTime.toFixed(2)}ms`
        );

        // Verify response time meets threshold
        assert(
          responseTime <= PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME,
          `API response time ${responseTime.toFixed(2)}ms exceeds threshold ${PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME}ms for ${endpoint.method.toUpperCase()} ${endpoint.url}`
        );
      }

      // Calculate average response time
      const avgResponseTime =
        performanceResults.reduce((sum, result) => sum + result.responseTime, 0) /
        performanceResults.length;
      console.log(`Average API response time: ${avgResponseTime.toFixed(2)}ms`);

      assert(
        avgResponseTime <= PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME,
        `Average API response time ${avgResponseTime.toFixed(2)}ms exceeds threshold ${PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME}ms`
      );
    });

    it('should handle high-frequency API requests efficiently', async () => {
      const client = supertest(app);
      const requestCount = 100;
      const concurrency = 10;

      console.log(`Testing ${requestCount} requests with concurrency ${concurrency}`);

      const batchSize = requestCount / concurrency;
      const batches = [];

      // Create batches of requests
      for (let i = 0; i < concurrency; i++) {
        const batchRequests = [];

        for (let j = 0; j < batchSize; j++) {
          batchRequests.push(
            measureRequestTime(() =>
              client.get('/api/config').set('Authorization', `Bearer ${operatorToken}`).expect(200)
            )
          );
        }

        batches.push(batchRequests);
      }

      const startTime = performance.now();

      // Execute all batches in parallel
      const batchResults = await Promise.all(batches.map(batch => Promise.all(batch)));

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Flatten results
      const allResults = batchResults.flat();
      const responseTimes = allResults.map(result => result.responseTime);

      // Calculate statistics
      const avgResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const minResponseTime = Math.min(...responseTimes);
      const maxResponseTime = Math.max(...responseTimes);
      const throughput = requestCount / (totalTime / 1000); // requests per second

      console.log(`Performance Statistics:`);
      console.log(`  Total requests: ${requestCount}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`  Min response time: ${minResponseTime.toFixed(2)}ms`);
      console.log(`  Max response time: ${maxResponseTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} requests/second`);

      // Verify performance criteria
      assert(
        avgResponseTime <= PERFORMANCE_THRESHOLDS.CONCURRENT_REQUEST_AVG,
        `Average response time under load ${avgResponseTime.toFixed(2)}ms exceeds threshold ${PERFORMANCE_THRESHOLDS.CONCURRENT_REQUEST_AVG}ms`
      );

      assert(throughput >= 10, 'Throughput should be at least 10 requests per second');

      // Verify system stability after load test
      const healthResponse = await client.get('/api/health').expect(200);

      assert(healthResponse.body.success);
      assert.strictEqual(healthResponse.body.status, 'healthy');
    });

    it('should maintain performance with large payloads', async () => {
      const client = supertest(app);

      // Create positions with increasingly large data payloads
      const payloadSizes = [1, 10, 50, 100]; // Number of positions to create in batch

      for (const size of payloadSizes) {
        console.log(`Testing payload size: ${size} positions`);

        const positions = Array.from({ length: size }, (_, i) => ({
          name: `Performance Test Position ${i + 1}`,
          description: `Large payload test position with extensive metadata. `.repeat(20), // ~1KB of text per position
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
            created_by: 'performance_test',
            batch_size: size,
            test_data: Array.from({ length: 100 }, (_, j) => `test_value_${j}`).join(','),
          },
        }));

        const startTime = performance.now();

        // Create all positions in the batch
        const createPromises = positions.map(position =>
          client
            .post('/api/positions')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send(position)
            .expect(200)
        );

        const results = await Promise.all(createPromises);
        const endTime = performance.now();

        const totalTime = endTime - startTime;
        const avgTimePerPosition = totalTime / size;

        console.log(
          `  Batch size ${size}: ${totalTime.toFixed(2)}ms total, ${avgTimePerPosition.toFixed(2)}ms per position`
        );

        // Verify all positions were created successfully
        assert(
          results.every(result => result.body.success),
          `All positions should be created successfully for batch size ${size}`
        );

        // Verify performance doesn't degrade significantly with larger payloads
        assert(
          avgTimePerPosition <= PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME,
          `Average time per position ${avgTimePerPosition.toFixed(2)}ms exceeds threshold for batch size ${size}`
        );
      }
    });
  });

  describe('🔌 Socket.IO Performance Tests', () => {
    it('should meet Socket.IO latency thresholds', async () => {
      const socketCount = 10;
      const sockets = [];
      const latencyResults = [];

      try {
        // Create multiple socket connections
        console.log(`Creating ${socketCount} socket connections...`);

        for (let i = 0; i < socketCount; i++) {
          const user = await helper.createTestUser(`perf_user_${i}`, 'password', 'operator');
          const token = helper.generateAuthToken(user);
          const socket = await helper.createAuthenticatedSocket(token);
          sockets.push(socket);
        }

        console.log(`Testing socket latency with ${socketCount} connections...`);

        // Test ping-pong latency for each socket
        for (let i = 0; i < sockets.length; i++) {
          const socket = sockets[i];
          const pingCount = 10;
          const socketLatencies = [];

          for (let j = 0; j < pingCount; j++) {
            const startTime = performance.now();

            const pongPromise = helper.waitForSocketEvent(socket, 'pong', 2000);
            socket.emit('ping', { timestamp: Date.now(), pingId: `${i}-${j}` });

            const pongData = await pongPromise;
            const endTime = performance.now();

            const latency = endTime - startTime;
            socketLatencies.push(latency);

            assert(pongData, `Socket ${i} should receive pong for ping ${j}`);
            await helper.delay(10); // Small delay between pings
          }

          const avgLatency =
            socketLatencies.reduce((sum, lat) => sum + lat, 0) / socketLatencies.length;
          latencyResults.push(avgLatency);

          console.log(`Socket ${i} average latency: ${avgLatency.toFixed(2)}ms`);

          assert(
            avgLatency <= PERFORMANCE_THRESHOLDS.SOCKET_LATENCY,
            `Socket ${i} latency ${avgLatency.toFixed(2)}ms exceeds threshold ${PERFORMANCE_THRESHOLDS.SOCKET_LATENCY}ms`
          );
        }

        // Calculate overall statistics
        const overallAvgLatency =
          latencyResults.reduce((sum, lat) => sum + lat, 0) / latencyResults.length;
        const minLatency = Math.min(...latencyResults);
        const maxLatency = Math.max(...latencyResults);

        console.log(`Socket.IO Performance Statistics:`);
        console.log(`  Connections tested: ${socketCount}`);
        console.log(`  Average latency: ${overallAvgLatency.toFixed(2)}ms`);
        console.log(`  Min latency: ${minLatency.toFixed(2)}ms`);
        console.log(`  Max latency: ${maxLatency.toFixed(2)}ms`);

        assert(
          overallAvgLatency <= PERFORMANCE_THRESHOLDS.SOCKET_LATENCY,
          `Overall average socket latency ${overallAvgLatency.toFixed(2)}ms exceeds threshold`
        );
      } finally {
        // Clean up socket connections
        for (const socket of sockets) {
          if (socket.connected) {
            socket.disconnect();
          }
        }
      }
    });

    it('should handle broadcast performance efficiently', async () => {
      const client = supertest(app);
      const socketCount = 20;
      const sockets = [];

      try {
        // Create multiple socket connections
        console.log(`Setting up ${socketCount} sockets for broadcast test...`);

        for (let i = 0; i < socketCount; i++) {
          const user = await helper.createTestUser(`broadcast_user_${i}`, 'password', 'operator');
          const token = helper.generateAuthToken(user);
          const socket = await helper.createAuthenticatedSocket(token);
          sockets.push(socket);
        }

        console.log(`Testing broadcast performance to ${socketCount} clients...`);

        // Set up event listeners on all sockets
        const eventPromises = sockets.map(socket =>
          helper.waitForSocketEvent(socket, 'configUpdated', 3000)
        );

        // Measure broadcast time
        const startTime = performance.now();

        // Trigger broadcast event
        await client
          .post('/api/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            robotType: 'broadcast_performance_test',
            communicationProtocol: 'simulation',
            timestamp: Date.now(),
          })
          .expect(200);

        // Wait for all sockets to receive the broadcast
        const broadcastResults = await Promise.allSettled(eventPromises);
        const endTime = performance.now();

        const broadcastTime = endTime - startTime;
        const successfulBroadcasts = broadcastResults.filter(r => r.status === 'fulfilled').length;
        const failedBroadcasts = broadcastResults.filter(r => r.status === 'rejected').length;

        console.log(`Broadcast Performance Results:`);
        console.log(`  Total broadcast time: ${broadcastTime.toFixed(2)}ms`);
        console.log(`  Successful deliveries: ${successfulBroadcasts}/${socketCount}`);
        console.log(`  Failed deliveries: ${failedBroadcasts}/${socketCount}`);
        console.log(`  Success rate: ${((successfulBroadcasts / socketCount) * 100).toFixed(1)}%`);

        // Verify broadcast performance
        assert(
          broadcastTime <= 1000, // 1 second threshold for broadcast
          `Broadcast time ${broadcastTime.toFixed(2)}ms exceeds 1000ms threshold`
        );

        assert(
          successfulBroadcasts >= socketCount * 0.95, // 95% success rate
          `Broadcast success rate ${((successfulBroadcasts / socketCount) * 100).toFixed(1)}% is below 95%`
        );
      } finally {
        // Clean up socket connections
        for (const socket of sockets) {
          if (socket.connected) {
            socket.disconnect();
          }
        }
      }
    });
  });

  describe('💾 Database Performance Tests', () => {
    it('should meet database query performance thresholds', async () => {
      console.log('Testing database query performance...');

      // Create test data for performance testing
      const testDataCount = 1000;
      const testPositions = [];

      console.log(`Creating ${testDataCount} test positions...`);
      const createStartTime = performance.now();

      for (let i = 0; i < testDataCount; i++) {
        const position = await dbManager.models.Position.create({
          name: `Performance Test Position ${i + 1}`,
          description: `Test position ${i + 1} for database performance testing`,
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
          created_by: operatorUser.id,
          created_at: new Date().toISOString(),
        });
        testPositions.push(position);
      }

      const createEndTime = performance.now();
      const createTime = createEndTime - createStartTime;
      const avgCreateTime = createTime / testDataCount;

      console.log(
        `Database creation performance: ${createTime.toFixed(2)}ms total, ${avgCreateTime.toFixed(2)}ms average per record`
      );

      // Test various query types
      const queryTests = [
        {
          name: 'Find All',
          query: () => dbManager.models.Position.findAll(),
        },
        {
          name: 'Find by ID',
          query: () =>
            dbManager.models.Position.findByPk(
              testPositions[Math.floor(Math.random() * testPositions.length)].id
            ),
        },
        {
          name: 'Count All',
          query: () => dbManager.models.Position.count(),
        },
        {
          name: 'Find with Limit',
          query: () =>
            dbManager.models.Position.findAll({ limit: 100, order: [['created_at', 'DESC']] }),
        },
        {
          name: 'Search by Name',
          query: () =>
            dbManager.models.Position.findAll({
              where: {
                name: { [dbManager.sequelize.Op.like]: '%Performance Test%' },
              },
              limit: 50,
            }),
        },
      ];

      for (const test of queryTests) {
        const iterations = 10;
        const queryTimes = [];

        for (let i = 0; i < iterations; i++) {
          const queryStartTime = performance.now();
          const result = await test.query();
          const queryEndTime = performance.now();

          const queryTime = queryEndTime - queryStartTime;
          queryTimes.push(queryTime);

          assert(
            result !== null && result !== undefined,
            `Query ${test.name} should return valid result`
          );
        }

        const avgQueryTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
        const minQueryTime = Math.min(...queryTimes);
        const maxQueryTime = Math.max(...queryTimes);

        console.log(
          `${test.name} query performance: ${avgQueryTime.toFixed(2)}ms average (min: ${minQueryTime.toFixed(2)}ms, max: ${maxQueryTime.toFixed(2)}ms)`
        );

        assert(
          avgQueryTime <= PERFORMANCE_THRESHOLDS.DATABASE_QUERY_TIME,
          `${test.name} average query time ${avgQueryTime.toFixed(2)}ms exceeds threshold ${PERFORMANCE_THRESHOLDS.DATABASE_QUERY_TIME}ms`
        );
      }
    });

    it('should handle concurrent database operations efficiently', async () => {
      const concurrency = 50;
      const operationsPerConnection = 10;

      console.log(
        `Testing ${concurrency} concurrent database operations with ${operationsPerConnection} operations each...`
      );

      const startTime = performance.now();

      // Create concurrent database operations
      const concurrentOperations = Array.from({ length: concurrency }, async (_, i) => {
        const operations = [];

        for (let j = 0; j < operationsPerConnection; j++) {
          operations.push(
            dbManager.models.Position.create({
              name: `Concurrent Test Position ${i}-${j}`,
              description: `Concurrent operation test position`,
              axes: {
                axis1: Math.random() * 180 - 90,
                axis2: Math.random() * 180 - 90,
                axis3: Math.random() * 180 - 90,
              },
              manipulators: {
                gripper1: Math.random() * 100,
              },
              created_by: operatorUser.id,
              created_at: new Date().toISOString(),
            })
          );
        }

        return Promise.all(operations);
      });

      // Execute all concurrent operations
      const results = await Promise.allSettled(concurrentOperations);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const totalOperations = concurrency * operationsPerConnection;
      const successfulOperations = results
        .filter(r => r.status === 'fulfilled')
        .reduce((sum, result) => sum + result.value.length, 0);

      const throughput = totalOperations / (totalTime / 1000); // operations per second

      console.log(`Concurrent Database Performance:`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Successful operations: ${successfulOperations}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} operations/second`);
      console.log(
        `  Success rate: ${((successfulOperations / totalOperations) * 100).toFixed(1)}%`
      );

      // Verify concurrent operation performance
      assert(
        successfulOperations >= totalOperations * 0.95,
        `Database concurrent operation success rate should be at least 95%`
      );

      assert(
        throughput >= 50,
        `Database throughput ${throughput.toFixed(2)} operations/second should be at least 50`
      );

      // Verify database consistency after concurrent operations
      const finalCount = await dbManager.models.Position.count();
      assert(
        finalCount >= successfulOperations,
        'Database should maintain consistency after concurrent operations'
      );
    });
  });

  describe('🧠 Memory and Resource Performance Tests', () => {
    it('should not have significant memory leaks under load', async () => {
      const client = supertest(app);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      console.log(`Initial memory usage: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);

      // Perform memory-intensive operations
      const operationCount = 200;
      console.log(`Performing ${operationCount} memory-intensive operations...`);

      for (let i = 0; i < operationCount; i++) {
        // Create and delete positions to test memory handling
        const createResponse = await client
          .post('/api/positions')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            name: `Memory Test Position ${i}`,
            description: `Memory test position with large description. ${'Large data payload. '.repeat(100)}`,
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
              large_data: Array.from({ length: 1000 }, (_, j) => `data_${j}`).join(','),
            },
          })
          .expect(200);

        const positionId = createResponse.body.position.id;

        // Delete the position to test cleanup
        await client
          .delete(`/api/positions/${positionId}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(200);

        // Check memory every 50 operations
        if (i % 50 === 0 && i > 0) {
          const currentMemory = process.memoryUsage();
          const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;

          console.log(
            `After ${i} operations: ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB (growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB)`
          );

          // Force garbage collection periodically
          if (global.gc) {
            global.gc();
          }
        }
      }

      // Final memory check
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Final memory usage: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
      console.log(`Total memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB`);

      // Verify memory growth is within acceptable limits
      assert(
        memoryGrowth <= PERFORMANCE_THRESHOLDS.MEMORY_GROWTH_LIMIT,
        `Memory growth ${Math.round(memoryGrowth / 1024 / 1024)}MB exceeds threshold ${Math.round(PERFORMANCE_THRESHOLDS.MEMORY_GROWTH_LIMIT / 1024 / 1024)}MB`
      );

      // Verify system is still responsive
      const healthResponse = await client.get('/api/health').expect(200);

      assert(healthResponse.body.success);
    });

    it('should handle resource scaling efficiently', async () => {
      const client = supertest(app);

      // Test scaling from low to high resource usage
      const scalingLevels = [10, 25, 50, 100, 200];
      const scalingResults = [];

      for (const level of scalingLevels) {
        console.log(`Testing resource scaling at level ${level}...`);

        const startTime = performance.now();
        const startMemory = process.memoryUsage();

        // Create concurrent requests at this scaling level
        const requests = Array.from({ length: level }, (_, i) =>
          client
            .post('/api/positions')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send({
              name: `Scaling Test Position ${level}-${i}`,
              axes: { axis1: i * 2, axis2: i * -2, axis3: i },
              manipulators: { gripper1: i % 100 },
            })
            .expect(200)
        );

        const results = await Promise.allSettled(requests);

        const endTime = performance.now();
        const endMemory = process.memoryUsage();

        const duration = endTime - startTime;
        const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
        const successRate = results.filter(r => r.status === 'fulfilled').length / level;
        const throughput = level / (duration / 1000);

        scalingResults.push({
          level,
          duration,
          memoryUsed,
          successRate,
          throughput,
        });

        console.log(
          `  Level ${level}: ${duration.toFixed(2)}ms, ${throughput.toFixed(2)} req/s, ${(successRate * 100).toFixed(1)}% success`
        );

        // Verify scaling performance
        assert(
          successRate >= 0.95,
          `Success rate should be at least 95% at scaling level ${level}`
        );
        assert(duration <= level * 10, `Duration should scale reasonably with request count`);

        // Clean up created positions to prevent database growth
        const positionsToDelete = results
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value.body.position.id);

        for (const positionId of positionsToDelete) {
          await client
            .delete(`/api/positions/${positionId}`)
            .set('Authorization', `Bearer ${operatorToken}`)
            .expect(200);
        }

        // Brief pause between scaling levels
        await helper.delay(500);
      }

      // Analyze scaling characteristics
      console.log('\nScaling Analysis:');
      scalingResults.forEach(result => {
        console.log(
          `Level ${result.level}: ${result.throughput.toFixed(2)} req/s, ${(result.successRate * 100).toFixed(1)}% success`
        );
      });

      // Verify throughput doesn't degrade significantly with scale
      const throughputs = scalingResults.map(r => r.throughput);
      const minThroughput = Math.min(...throughputs);
      const maxThroughput = Math.max(...throughputs);
      const throughputRatio = minThroughput / maxThroughput;

      console.log(`Throughput ratio (min/max): ${throughputRatio.toFixed(3)}`);

      // Throughput shouldn't degrade by more than 50% across scaling levels
      assert(
        throughputRatio >= 0.5,
        `Throughput degradation is too significant: ratio ${throughputRatio.toFixed(3)} < 0.5`
      );
    });
  });
});

/**
 * Utility function to measure request time
 */
async function measureRequestTime(requestFunction) {
  const startTime = performance.now();

  try {
    const response = await requestFunction();
    const endTime = performance.now();

    return {
      response,
      responseTime: endTime - startTime,
      success: true,
    };
  } catch (error) {
    const endTime = performance.now();

    return {
      error,
      responseTime: endTime - startTime,
      success: false,
    };
  }
}

module.exports = {
  PERFORMANCE_THRESHOLDS,
  measureRequestTime,
};
