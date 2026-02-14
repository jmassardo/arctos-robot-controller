/**
 * Integration Test Configuration
 * Centralized configuration for all integration tests
 */

const path = require('path');
const fs = require('fs-extra');

// Test environment configuration
const TEST_CONFIG = {
  // Server configuration
  server: {
    port: process.env.TEST_PORT || 5001,
    host: 'localhost',
    protocol: 'http',
  },

  // Database configuration
  database: {
    testDbPath: path.join(__dirname, '../test-data/integration-test.db'),
    backupDbPath: path.join(__dirname, '../test-data/integration-test-backup.db'),
    seedDataPath: path.join(__dirname, '../fixtures/integration-seed-data.json'),
  },

  // File system paths for testing
  filesystem: {
    testConfigDir: path.join(__dirname, '../test-data/config'),
    testDataDir: path.join(__dirname, '../test-data/data'),
    testLogsDir: path.join(__dirname, '../test-data/logs'),
    testExportsDir: path.join(__dirname, '../test-data/exports'),
    testUploadsDir: path.join(__dirname, '../test-data/uploads'),
  },

  // Socket.IO configuration
  socketIO: {
    timeout: 5000,
    maxRetries: 3,
    retryDelay: 1000,
  },

  // Authentication test configuration
  auth: {
    testUsers: {
      admin: {
        username: 'test-admin',
        email: 'admin@test.com',
        password: 'TestPassword123!',
        role: 'admin',
      },
      operator: {
        username: 'test-operator',
        email: 'operator@test.com',
        password: 'TestPassword123!',
        role: 'operator',
      },
      viewer: {
        username: 'test-viewer',
        email: 'viewer@test.com',
        password: 'TestPassword123!',
        role: 'viewer',
      },
    },
    jwt: {
      secret: 'test-jwt-secret-key-for-integration-tests',
      expiresIn: '1h',
    },
  },

  // Hardware simulation configuration
  hardware: {
    mks42d: {
      simulationMode: true,
      mockResponses: true,
      responseDelay: 100,
    },
    mks57d: {
      simulationMode: true,
      mockControllers: [
        { id: 1, name: 'Test Controller 1' },
        { id: 2, name: 'Test Controller 2' },
      ],
    },
    canBus: {
      mockInterface: 'test-can0',
      baseCanId: 256,
    },
  },

  // Test timeouts
  timeouts: {
    api: 5000,
    database: 3000,
    socket: 5000,
    hardware: 2000,
    integration: 10000,
  },

  // Performance test thresholds
  performance: {
    apiResponseTime: 500, // ms
    databaseQueryTime: 200, // ms
    socketEmitTime: 100, // ms
    memoryUsageThreshold: 100 * 1024 * 1024, // 100MB
    cpuUsageThreshold: 80, // percentage
  },

  // Test data volumes for load testing
  loadTesting: {
    concurrentUsers: 10,
    requestsPerSecond: 50,
    testDuration: 30000, // 30 seconds
    positions: {
      count: 100,
      batchSize: 10,
    },
    gcodeCommands: {
      count: 1000,
      complexity: 'medium',
    },
  },
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'ci') {
  TEST_CONFIG.timeouts.integration = 30000; // Longer timeout for CI
  TEST_CONFIG.performance.apiResponseTime = 1000; // Relaxed CI thresholds
}

/**
 * Initialize test environment directories and files
 */
async function initializeTestEnvironment() {
  const dirs = Object.values(TEST_CONFIG.filesystem);

  // Create test directories
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }

  // Create test database directory
  await fs.ensureDir(path.dirname(TEST_CONFIG.database.testDbPath));

  // Clean up any existing test files
  await cleanupTestEnvironment();

  console.log('Integration test environment initialized');
}

/**
 * Clean up test environment
 */
async function cleanupTestEnvironment() {
  try {
    // Remove test database files
    if (await fs.pathExists(TEST_CONFIG.database.testDbPath)) {
      await fs.remove(TEST_CONFIG.database.testDbPath);
    }

    if (await fs.pathExists(TEST_CONFIG.database.backupDbPath)) {
      await fs.remove(TEST_CONFIG.database.backupDbPath);
    }

    // Clean test directories
    for (const dir of Object.values(TEST_CONFIG.filesystem)) {
      if (await fs.pathExists(dir)) {
        await fs.emptyDir(dir);
      }
    }

    console.log('Integration test environment cleaned up');
  } catch (error) {
    console.error('Error cleaning up test environment:', error);
  }
}

/**
 * Get test server URL
 */
function getTestServerUrl() {
  return `${TEST_CONFIG.server.protocol}://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`;
}

/**
 * Get test API URL
 */
function getTestApiUrl() {
  return `${getTestServerUrl()}/api`;
}

/**
 * Create test user data
 */
function createTestUserData(userType = 'operator') {
  const userData = TEST_CONFIG.auth.testUsers[userType];
  if (!userData) {
    throw new Error(`Unknown test user type: ${userType}`);
  }

  return {
    ...userData,
    id: Math.floor(Math.random() * 10000),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create test robot configuration
 */
function createTestRobotConfig() {
  return {
    robotType: 'arctos-test',
    communicationProtocol: 'can',
    serialConfig: {
      port: '/dev/ttyTest',
      baudRate: 115200,
    },
    canConfig: {
      interface: TEST_CONFIG.hardware.canBus.mockInterface,
      baseCanId: TEST_CONFIG.hardware.canBus.baseCanId,
    },
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
    mks42d: {
      enabled: true,
      simulationMode: true,
      controllers: TEST_CONFIG.hardware.mks57d.mockControllers,
    },
    testMode: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create test position data
 */
function createTestPosition(id = 1, name = 'Test Position') {
  return {
    id,
    name,
    axes: {
      axis1: Math.random() * 360 - 180,
      axis2: Math.random() * 180 - 90,
      axis3: Math.random() * 360 - 180,
      axis4: Math.random() * 360 - 180,
      axis5: Math.random() * 180 - 90,
      axis6: Math.random() * 360 - 180,
    },
    manipulators: {
      gripper1: Math.random() * 100,
      gripper2: Math.random() * 100,
    },
    delay: 1000,
    timestamp: new Date().toISOString(),
    groupId: null,
  };
}

/**
 * Create test G-code
 */
function createTestGCode(complexity = 'simple') {
  const gcodeTemplates = {
    simple: [
      'G28 ; Home all axes',
      'G1 X10 Y10 Z5 F1000',
      'G1 X20 Y20 Z10 F1500',
      'M84 ; Disable motors',
    ],
    medium: [
      'G28 ; Home all axes',
      'G1 X0 Y0 Z0 F1000',
      'G1 X50 Y0 Z0 F1500',
      'G2 X50 Y50 I0 J25 F1000',
      'G1 X0 Y50 Z0 F1500',
      'G1 X0 Y0 Z0 F1000',
      'M84 ; Disable motors',
    ],
    complex: [
      'G28 ; Home all axes',
      'G90 ; Absolute positioning',
      'G1 X0 Y0 Z0 F1000',
      'G1 X100 Y0 Z0 F1500',
      'G2 X100 Y100 I0 J50 F1200',
      'G3 X0 Y100 I-50 J0 F1200',
      'G1 X0 Y0 Z0 F1500',
      'G1 Z10 F500',
      'M84 ; Disable motors',
    ],
  };

  return gcodeTemplates[complexity] || gcodeTemplates.simple;
}

module.exports = {
  TEST_CONFIG,
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getTestServerUrl,
  getTestApiUrl,
  createTestUserData,
  createTestRobotConfig,
  createTestPosition,
  createTestGCode,
};
