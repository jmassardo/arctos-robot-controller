/**
 * Test Helpers and Utilities
 * Common testing utilities and helper functions
 */

const path = require('path');
const fs = require('fs-extra');
const { randomBytes } = require('crypto');

/**
 * Test Data Factory
 * Creates consistent test data objects
 */
class TestDataFactory {
  /**
   * Generate test user data
   */
  static createUser(overrides = {}) {
    const id = overrides.id || Math.floor(Math.random() * 10000) + 1;
    return {
      id,
      username: overrides.username || `testuser_${id}`,
      email: overrides.email || `test${id}@example.com`,
      password: overrides.password || 'TestPassword123!',
      password_hash: overrides.password_hash || '$2a$12$hashedpassword',
      role: overrides.role || 'user',
      is_active: overrides.is_active !== undefined ? overrides.is_active : true,
      created_at: overrides.created_at || new Date().toISOString(),
      updated_at: overrides.updated_at || new Date().toISOString(),
      last_login: overrides.last_login || null,
      login_attempts: overrides.login_attempts || 0,
      lockout_until: overrides.lockout_until || null,
      ...overrides,
    };
  }

  /**
   * Generate test position data
   */
  static createPosition(overrides = {}) {
    const id = overrides.id || Math.floor(Math.random() * 10000) + 1;
    return {
      id,
      name: overrides.name || `Position_${id}`,
      description: overrides.description || `Test position ${id}`,
      axis1: overrides.axis1 !== undefined ? overrides.axis1 : Math.random() * 100 - 50,
      axis2: overrides.axis2 !== undefined ? overrides.axis2 : Math.random() * 100 - 50,
      axis3: overrides.axis3 !== undefined ? overrides.axis3 : Math.random() * 50 - 25,
      axis4: overrides.axis4 !== undefined ? overrides.axis4 : Math.random() * 360 - 180,
      axis5: overrides.axis5 !== undefined ? overrides.axis5 : Math.random() * 180 - 90,
      axis6: overrides.axis6 !== undefined ? overrides.axis6 : Math.random() * 360 - 180,
      gripper1:
        overrides.gripper1 !== undefined ? overrides.gripper1 : Math.floor(Math.random() * 101),
      gripper2: overrides.gripper2 !== undefined ? overrides.gripper2 : null,
      coordinate_system: overrides.coordinate_system || 'G54',
      feed_rate: overrides.feed_rate || 1000,
      order_index: overrides.order_index || id,
      user_id: overrides.user_id || 1,
      group_id: overrides.group_id || null,
      created_at: overrides.created_at || new Date().toISOString(),
      updated_at: overrides.updated_at || new Date().toISOString(),
      ...overrides,
    };
  }

  /**
   * Generate test robot configuration
   */
  static createRobotConfig(overrides = {}) {
    return {
      robot: {
        type: overrides.type || '6-axis-robotic-arm',
        name: overrides.name || 'Test Robot',
        description: overrides.description || 'Test robot configuration',
        communication: {
          protocol: overrides.protocol || 'CAN_BUS',
          interface: overrides.interface || 'can0',
          baudRate: overrides.baudRate || 1000000,
          timeout: overrides.timeout || 1000,
          ...overrides.communication,
        },
        axes: {
          axis1: { min: -180, max: 180, stepsPerMM: 80, maxSpeed: 5000 },
          axis2: { min: -120, max: 120, stepsPerMM: 80, maxSpeed: 5000 },
          axis3: { min: -90, max: 90, stepsPerMM: 80, maxSpeed: 5000 },
          axis4: { min: -180, max: 180, stepsPerMM: 80, maxSpeed: 5000 },
          axis5: { min: -90, max: 90, stepsPerMM: 80, maxSpeed: 5000 },
          axis6: { min: -180, max: 180, stepsPerMM: 80, maxSpeed: 5000 },
          ...overrides.axes,
        },
        manipulators: {
          gripper1: { min: 0, max: 100, type: 'servo', pin: 9 },
          ...overrides.manipulators,
        },
        safety: {
          emergencyStop: true,
          positionLimits: true,
          speedLimits: true,
          collisionDetection: false,
          ...overrides.safety,
        },
        ...overrides.robot,
      },
    };
  }

  /**
   * Generate test G-code program
   */
  static createGCodeProgram(overrides = {}) {
    const defaultGCode = [
      'G21 ; Set units to millimeters',
      'G90 ; Absolute positioning',
      'G17 ; Select XY plane',
      'G0 X0 Y0 Z5 ; Move to start position',
      'G1 Z-2 F500 ; Plunge at feed rate',
      'G1 X10 Y0 F1000',
      'G1 X10 Y10',
      'G1 X0 Y10',
      'G1 X0 Y0',
      'G0 Z5 ; Retract',
      'M30 ; End program',
    ].join('\\n');

    const id = overrides.id || Math.floor(Math.random() * 10000) + 1;
    return {
      id,
      name: overrides.name || `GCode_Program_${id}`,
      description: overrides.description || `Test G-code program ${id}`,
      content: overrides.content || defaultGCode,
      version: overrides.version || '1.0',
      estimated_time: overrides.estimated_time || 60,
      tools_used: overrides.tools_used || JSON.stringify([1]),
      coordinate_systems: overrides.coordinate_systems || JSON.stringify(['G54']),
      bounding_box:
        overrides.bounding_box ||
        JSON.stringify({
          min: { x: 0, y: 0, z: -2 },
          max: { x: 10, y: 10, z: 5 },
        }),
      created_at: overrides.created_at || new Date().toISOString(),
      updated_at: overrides.updated_at || new Date().toISOString(),
      user_id: overrides.user_id || 1,
      parent_id: overrides.parent_id || null,
      ...overrides,
    };
  }

  /**
   * Generate test hardware error
   */
  static createHardwareError(overrides = {}) {
    const errorCodes = [
      'OVERCURRENT',
      'POSITION_ERROR',
      'COMMUNICATION_TIMEOUT',
      'ENCODER_FAULT',
      'TEMPERATURE_HIGH',
    ];
    const severities = ['info', 'warning', 'critical'];

    const id = overrides.id || Math.floor(Math.random() * 10000) + 1;
    return {
      id,
      controller_id: overrides.controller_id || `MKS57D_${Math.floor(Math.random() * 6) + 1}`,
      motor_id: overrides.motor_id || `axis_${Math.floor(Math.random() * 6) + 1}`,
      error_code: overrides.error_code || errorCodes[Math.floor(Math.random() * errorCodes.length)],
      error_message: overrides.error_message || `Test error message ${id}`,
      severity: overrides.severity || severities[Math.floor(Math.random() * severities.length)],
      position_data:
        overrides.position_data ||
        JSON.stringify({
          x: Math.random() * 100,
          y: Math.random() * 100,
          z: Math.random() * 50,
        }),
      recovery_action: overrides.recovery_action || 'stop_and_reset',
      resolved: overrides.resolved !== undefined ? overrides.resolved : false,
      occurred_at: overrides.occurred_at || new Date().toISOString(),
      resolved_at: overrides.resolved_at || null,
      resolution_notes: overrides.resolution_notes || null,
      ...overrides,
    };
  }

  /**
   * Generate batch of test data
   */
  static createBatch(type, count, overrides = {}) {
    const factories = {
      user: this.createUser,
      position: this.createPosition,
      gcode: this.createGCodeProgram,
      error: this.createHardwareError,
    };

    const factory = factories[type];
    if (!factory) {
      throw new Error(`Unknown test data type: ${type}`);
    }

    return Array.from({ length: count }, (_, i) =>
      factory({ ...overrides, id: (overrides.startId || 1) + i })
    );
  }
}

/**
 * Test Database Helper
 * Manages test database setup and cleanup
 */
class TestDatabaseHelper {
  constructor(testId = null) {
    this.testId = testId || randomBytes(4).toString('hex');
    this.testDir = path.join(__dirname, '../fixtures', `test-db-${this.testId}`);
    this.dbPath = path.join(this.testDir, 'test.sqlite');
  }

  /**
   * Setup test database
   */
  async setup() {
    await fs.ensureDir(this.testDir);

    // Create minimal database structure for testing
    const { Sequelize, DataTypes } = require('sequelize');

    this.sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: this.dbPath,
      logging: false,
    });

    // Define minimal test models
    this.User = this.sequelize.define('User', {
      username: { type: DataTypes.STRING, unique: true },
      email: { type: DataTypes.STRING, unique: true },
      password_hash: DataTypes.STRING,
      role: DataTypes.STRING,
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    });

    this.Position = this.sequelize.define('Position', {
      name: DataTypes.STRING,
      axis1: DataTypes.FLOAT,
      axis2: DataTypes.FLOAT,
      axis3: DataTypes.FLOAT,
      axis4: DataTypes.FLOAT,
      axis5: DataTypes.FLOAT,
      axis6: DataTypes.FLOAT,
      gripper1: DataTypes.INTEGER,
      user_id: DataTypes.INTEGER,
    });

    await this.sequelize.sync();
    return this.sequelize;
  }

  /**
   * Seed test data
   */
  async seed(data = {}) {
    if (data.users) {
      await this.User.bulkCreate(data.users);
    }
    if (data.positions) {
      await this.Position.bulkCreate(data.positions);
    }
  }

  /**
   * Cleanup test database
   */
  async cleanup() {
    if (this.sequelize) {
      await this.sequelize.close();
    }
    await fs.remove(this.testDir);
  }
}

/**
 * Mock Response Helper
 * Creates mock Express response objects
 */
class MockResponseHelper {
  static create() {
    const mockRes = {
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.jsonData = data;
        return this;
      },
      send: function (data) {
        this.sentData = data;
        return this;
      },
      cookie: function (name, value, options) {
        this.cookies = this.cookies || {};
        this.cookies[name] = { value, options };
        return this;
      },
      clearCookie: function (name) {
        this.clearedCookies = this.clearedCookies || [];
        this.clearedCookies.push(name);
        return this;
      },
      redirect: function (url) {
        this.redirectUrl = url;
        return this;
      },
      end: function () {
        this.ended = true;
        return this;
      },
    };

    // Add spy functions
    mockRes.statusSpy = jest ? jest.fn(mockRes.status) : mockRes.status;
    mockRes.jsonSpy = jest ? jest.fn(mockRes.json) : mockRes.json;
    mockRes.sendSpy = jest ? jest.fn(mockRes.send) : mockRes.send;

    return mockRes;
  }
}

/**
 * Mock Request Helper
 * Creates mock Express request objects
 */
class MockRequestHelper {
  static create(options = {}) {
    return {
      params: options.params || {},
      query: options.query || {},
      body: options.body || {},
      headers: options.headers || {},
      cookies: options.cookies || {},
      user: options.user || null,
      session: options.session || {},
      ip: options.ip || '127.0.0.1',
      method: options.method || 'GET',
      url: options.url || '/',
      path: options.path || '/',
      ...options,
    };
  }
}

/**
 * File System Test Helper
 * Manages test files and directories
 */
class FileSystemTestHelper {
  constructor(testId = null) {
    this.testId = testId || randomBytes(4).toString('hex');
    this.testDir = path.join(__dirname, '../fixtures', `fs-test-${this.testId}`);
  }

  /**
   * Setup test directory
   */
  async setup() {
    await fs.ensureDir(this.testDir);
    return this.testDir;
  }

  /**
   * Create test file
   */
  async createFile(relativePath, content) {
    const filePath = path.join(this.testDir, relativePath);
    await fs.ensureDir(path.dirname(filePath));

    if (typeof content === 'object') {
      await fs.writeJson(filePath, content, { spaces: 2 });
    } else {
      await fs.writeFile(filePath, content);
    }

    return filePath;
  }

  /**
   * Create multiple test files
   */
  async createFiles(fileMap) {
    const createdFiles = {};

    for (const [relativePath, content] of Object.entries(fileMap)) {
      createdFiles[relativePath] = await this.createFile(relativePath, content);
    }

    return createdFiles;
  }

  /**
   * Get test file path
   */
  getPath(relativePath = '') {
    return path.join(this.testDir, relativePath);
  }

  /**
   * Cleanup test directory
   */
  async cleanup() {
    await fs.remove(this.testDir);
  }
}

/**
 * Async Test Helper
 * Utilities for testing asynchronous operations
 */
class AsyncTestHelper {
  /**
   * Wait for condition to be true
   */
  static async waitFor(condition, options = {}) {
    const timeout = options.timeout || 5000;
    const interval = options.interval || 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await this.sleep(interval);
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Sleep for specified milliseconds
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a deferred promise
   */
  static createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /**
   * Timeout wrapper for promises
   */
  static timeout(promise, ms, message = 'Operation timed out') {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }
}

/**
 * Validation Test Helper
 * Common validation testing utilities
 */
class ValidationTestHelper {
  /**
   * Test invalid inputs for a function
   */
  static async testInvalidInputs(testFunction, invalidInputs, expectedError = null) {
    const results = [];

    for (const input of invalidInputs) {
      try {
        await testFunction(input);
        results.push({
          input,
          success: false,
          error: 'Expected function to throw error but it succeeded',
        });
      } catch (error) {
        const isExpectedError = expectedError
          ? error.message.includes(expectedError) || error.name === expectedError
          : true;

        results.push({
          input,
          success: isExpectedError,
          error: isExpectedError ? null : `Unexpected error: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Test valid inputs for a function
   */
  static async testValidInputs(testFunction, validInputs) {
    const results = [];

    for (const input of validInputs) {
      try {
        const result = await testFunction(input);
        results.push({
          input,
          success: true,
          result,
          error: null,
        });
      } catch (error) {
        results.push({
          input,
          success: false,
          result: null,
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = {
  TestDataFactory,
  TestDatabaseHelper,
  MockResponseHelper,
  MockRequestHelper,
  FileSystemTestHelper,
  AsyncTestHelper,
  ValidationTestHelper,
};
