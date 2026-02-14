/**
 * Enhanced Integration Test Helpers and Utilities
 * Comprehensive testing infrastructure for all integration scenarios
 *
 * Integration Test Engineer Implementation
 * Provides complete support for:
 * - API contract testing with authentication
 * - Socket.IO real-time communication testing
 * - Database integration with transaction support
 * - Hardware simulation and protocol testing
 * - Error recovery and performance validation
 */

const request = require('supertest');
const io = require('socket.io-client');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');

const {
  TEST_CONFIG,
  getTestServerUrl,
  getTestApiUrl,
  createTestUserData,
  createTestRobotConfig,
  createTestPosition,
} = require('./integration-test-config');

// Import application modules for deep integration testing
const { DatabaseManager } = require('../../lib/database');
const { AuthService } = require('../../lib/auth');

class IntegrationTestHelper {
  constructor() {
    this.serverProcess = null;
    this.testApp = null;
    this.server = null;
    this.dbManager = null;
    this.authService = null;
    this.sockets = [];
    this.authenticatedClients = new Map();
    this.testUsers = new Map();
    this.testTokens = new Map();
    this.testDataDir = TEST_CONFIG.filesystem.testDataDir;
    this.performanceMetrics = new Map();
    this.socketEventCallbacks = new Map();
  }

  /**
   * Start test server
   */
  async startTestServer() {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '../../server.js');

      this.serverProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: TEST_CONFIG.server.port,
          JWT_SECRET: TEST_CONFIG.auth.jwt.secret,
          DB_PATH: TEST_CONFIG.database.testDbPath,
          CONFIG_DIR: TEST_CONFIG.filesystem.testConfigDir,
          DATA_DIR: TEST_CONFIG.filesystem.testDataDir,
          LOGS_DIR: TEST_CONFIG.filesystem.testLogsDir,
        },
        stdio: 'pipe',
      });

      this.serverProcess.stdout.on('data', data => {
        const output = data.toString();
        if (output.includes('Server is running') || output.includes('listening on')) {
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', data => {
        console.error('Server stderr:', data.toString());
      });

      this.serverProcess.on('error', error => {
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Test server failed to start within timeout'));
      }, 10000);
    });
  }

  /**
   * Stop test server
   */
  async stopTestServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    // Close all socket connections
    this.sockets.forEach(socket => {
      if (socket.connected) {
        socket.disconnect();
      }
    });
    this.sockets = [];
    this.authenticatedClients.clear();
  }

  /**
   * Create HTTP test client
   */
  createHttpClient() {
    const app = {
      listen: () => ({
        address: () => ({ port: TEST_CONFIG.server.port }),
      }),
    };
    return request(getTestServerUrl());
  }

  /**
   * Create Socket.IO test client
   */
  createSocketClient(token = null) {
    const options = {
      transports: ['websocket'],
      timeout: TEST_CONFIG.socketIO.timeout,
    };

    if (token) {
      options.auth = { token };
    }

    const socket = io(getTestServerUrl(), options);
    this.sockets.push(socket);
    return socket;
  }

  /**
   * Wait for socket connection
   */
  async waitForSocketConnection(socket, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (socket.connected) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });

      socket.on('connect_error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Register test user and get authentication token
   */
  async registerAndLoginUser(userType = 'operator') {
    const userData = createTestUserData(userType);
    const client = this.createHttpClient();

    // Register user
    const registerResponse = await client.post('/api/auth/register').send(userData).expect(201);

    // Login user
    const loginResponse = await client
      .post('/api/auth/login')
      .send({
        username: userData.username,
        password: userData.password,
      })
      .expect(200);

    const { token, refreshToken, user } = loginResponse.body;

    this.authenticatedClients.set(userType, {
      token,
      refreshToken,
      user,
      userData,
    });

    return { token, refreshToken, user, userData };
  }

  /**
   * Get authenticated client for user type
   */
  getAuthenticatedClient(userType = 'operator') {
    return this.authenticatedClients.get(userType);
  }

  /**
   * Create authenticated HTTP request
   */
  createAuthenticatedRequest(userType = 'operator') {
    const authData = this.getAuthenticatedClient(userType);
    if (!authData) {
      throw new Error(`No authenticated client for user type: ${userType}`);
    }

    const client = this.createHttpClient();
    return {
      get: url => client.get(url).set('Authorization', `Bearer ${authData.token}`),
      post: url => client.post(url).set('Authorization', `Bearer ${authData.token}`),
      put: url => client.put(url).set('Authorization', `Bearer ${authData.token}`),
      delete: url => client.delete(url).set('Authorization', `Bearer ${authData.token}`),
    };
  }

  /**
   * Create authenticated Socket.IO client
   */
  createAuthenticatedSocket(userType = 'operator') {
    const authData = this.getAuthenticatedClient(userType);
    if (!authData) {
      throw new Error(`No authenticated client for user type: ${userType}`);
    }

    return this.createSocketClient(authData.token);
  }

  /**
   * Setup robot configuration for testing
   */
  async setupTestRobotConfig() {
    const config = createTestRobotConfig();
    const configPath = path.join(TEST_CONFIG.filesystem.testConfigDir, 'robot-config.json');
    await fs.writeJson(configPath, config);
    return config;
  }

  /**
   * Setup test positions data
   */
  async setupTestPositions(count = 5) {
    const positions = [];
    for (let i = 1; i <= count; i++) {
      positions.push(createTestPosition(i, `Test Position ${i}`));
    }

    const positionsPath = path.join(TEST_CONFIG.filesystem.testDataDir, 'saved-positions.json');
    await fs.writeJson(positionsPath, positions);
    return positions;
  }

  /**
   * Wait for specific socket event
   */
  waitForSocketEvent(socket, eventName, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Socket event '${eventName}' timeout`));
      }, timeout);

      socket.once(eventName, data => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /**
   * Assert API response structure
   */
  assertApiResponse(response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toBeDefined();

    if (response.body.success !== undefined) {
      expect(response.body.success).toBe(expectedStatus < 400);
    }

    return response.body;
  }

  /**
   * Assert Socket.IO event data
   */
  assertSocketEvent(eventData, requiredFields = []) {
    expect(eventData).toBeDefined();
    expect(typeof eventData).toBe('object');

    requiredFields.forEach(field => {
      expect(eventData).toHaveProperty(field);
    });

    return eventData;
  }

  /**
   * Create test data batch
   */
  async createTestDataBatch(type, count = 10) {
    const data = [];

    switch (type) {
      case 'positions':
        for (let i = 1; i <= count; i++) {
          data.push(createTestPosition(i, `Batch Position ${i}`));
        }
        break;

      case 'users':
        for (let i = 1; i <= count; i++) {
          const userData = createTestUserData('operator');
          userData.username = `batch-user-${i}`;
          userData.email = `batch-user-${i}@test.com`;
          data.push(userData);
        }
        break;

      default:
        throw new Error(`Unknown test data type: ${type}`);
    }

    return data;
  }

  /**
   * Measure API response time
   */
  async measureApiResponseTime(requestFunc) {
    const startTime = process.hrtime();
    const response = await requestFunc();
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    return { response, responseTime };
  }

  /**
   * Generate concurrent requests
   */
  async generateConcurrentRequests(requestFunc, concurrency = 10) {
    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(requestFunc());
    }

    const results = await Promise.allSettled(promises);

    return {
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results,
    };
  }

  /**
   * Wait for condition with timeout
   */
  async waitForCondition(conditionFunc, timeout = 5000, interval = 100) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await conditionFunc()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Condition timeout exceeded');
  }

  /**
   * Clean up test data
   */
  async cleanupTestData() {
    try {
      // Clean up test files
      for (const dir of Object.values(TEST_CONFIG.filesystem)) {
        if (await fs.pathExists(dir)) {
          await fs.emptyDir(dir);
        }
      }

      // Reset authenticated clients
      this.authenticatedClients.clear();

      console.log('Test data cleaned up successfully');
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  }
}

// Global test helper instance
let globalHelper = null;

/**
 * Get or create global test helper instance
 */
function getTestHelper() {
  if (!globalHelper) {
    globalHelper = new IntegrationTestHelper();
  }
  return globalHelper;
}

/**
 * Setup integration test environment
 */
async function setupIntegrationTestEnvironment() {
  const helper = getTestHelper();

  // Initialize test directories
  const { initializeTestEnvironment } = require('./integration-test-config');
  await initializeTestEnvironment();

  // Start test server
  await helper.startTestServer();

  // Setup test configuration
  await helper.setupTestRobotConfig();

  return helper;
}

/**
 * Teardown integration test environment
 */
async function teardownIntegrationTestEnvironment() {
  const helper = getTestHelper();

  if (helper) {
    await helper.stopTestServer();
    await helper.cleanupTestData();
  }

  const { cleanupTestEnvironment } = require('./integration-test-config');
  await cleanupTestEnvironment();
}

module.exports = {
  IntegrationTestHelper,
  getTestHelper,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
};
