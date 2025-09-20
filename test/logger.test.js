const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Import logging system
const Logger = require('../lib/logger');

test('Logger - Basic Functionality', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs');
  await fs.ensureDir(testLogDir);
  
  const logger = new Logger(testLogDir);

  await t.test('should create log files', async () => {
    logger.info('Test log message');
    
    // Wait a moment for file write
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const logFiles = await fs.readdir(testLogDir);
    assert.ok(logFiles.some(file => file.includes('combined')));
    assert.ok(logFiles.some(file => file.includes('error')));
  });

  await t.test('should write different log levels', async () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');
    logger.error('Error message');

    await new Promise(resolve => setTimeout(resolve, 100));

    const combinedLogPath = path.join(testLogDir, 'combined.log');
    const logContent = await fs.readFile(combinedLogPath, 'utf8');

    assert.ok(logContent.includes('Debug message'));
    assert.ok(logContent.includes('Info message'));
    assert.ok(logContent.includes('Warning message'));
    assert.ok(logContent.includes('Error message'));
  });

  await t.test('should format logs as JSON', async () => {
    logger.info('JSON test', { key: 'value', number: 42 });

    await new Promise(resolve => setTimeout(resolve, 100));

    const combinedLogPath = path.join(testLogDir, 'combined.log');
    const logContent = await fs.readFile(combinedLogPath, 'utf8');
    const lines = logContent.trim().split('\\n');
    const lastLine = lines[lines.length - 1];

    const logEntry = JSON.parse(lastLine);
    assert.strictEqual(logEntry.message, 'JSON test');
    assert.strictEqual(logEntry.key, 'value');
    assert.strictEqual(logEntry.number, 42);
    assert.ok(logEntry.timestamp);
    assert.ok(logEntry.level);
  });

  // Cleanup
  await fs.remove(testLogDir);
});

test('Logger - Specialized Logging Methods', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs-specialized');
  await fs.ensureDir(testLogDir);
  
  const logger = new Logger(testLogDir);

  await t.test('should log audit events', async () => {
    logger.audit('User login attempt', {
      username: 'testuser',
      ip: '127.0.0.1',
      success: true
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const auditLogPath = path.join(testLogDir, 'audit.log');
    const logContent = await fs.readFile(auditLogPath, 'utf8');
    const logEntry = JSON.parse(logContent.trim());

    assert.strictEqual(logEntry.message, 'User login attempt');
    assert.strictEqual(logEntry.category, 'audit');
    assert.strictEqual(logEntry.username, 'testuser');
    assert.ok(logEntry.timestamp);
  });

  await t.test('should log security events', async () => {
    logger.security('Potential brute force attack', {
      ip: '192.168.1.100',
      attempts: 5,
      timeWindow: '5 minutes'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const securityLogPath = path.join(testLogDir, 'security.log');
    const logContent = await fs.readFile(securityLogPath, 'utf8');
    const logEntry = JSON.parse(logContent.trim());

    assert.strictEqual(logEntry.message, 'Potential brute force attack');
    assert.strictEqual(logEntry.category, 'security');
    assert.strictEqual(logEntry.ip, '192.168.1.100');
  });

  await t.test('should log performance metrics', async () => {
    logger.performance('API response time', {
      endpoint: '/api/config',
      method: 'GET',
      responseTime: 150,
      statusCode: 200
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const performanceLogPath = path.join(testLogDir, 'performance.log');
    const logContent = await fs.readFile(performanceLogPath, 'utf8');
    const logEntry = JSON.parse(logContent.trim());

    assert.strictEqual(logEntry.message, 'API response time');
    assert.strictEqual(logEntry.category, 'performance');
    assert.strictEqual(logEntry.endpoint, '/api/config');
    assert.strictEqual(logEntry.responseTime, 150);
  });

  await t.test('should log robot operations', async () => {
    logger.robot('Robot movement command', {
      command: 'move',
      axes: { x: 100, y: 200, z: 50 },
      user: 'operator1'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const robotLogPath = path.join(testLogDir, 'robot.log');
    const logContent = await fs.readFile(robotLogPath, 'utf8');
    const logEntry = JSON.parse(logContent.trim());

    assert.strictEqual(logEntry.message, 'Robot movement command');
    assert.strictEqual(logEntry.category, 'robot');
    assert.strictEqual(logEntry.command, 'move');
    assert.deepStrictEqual(logEntry.axes, { x: 100, y: 200, z: 50 });
  });

  await t.test('should log hardware events', async () => {
    logger.hardware('Serial connection established', {
      port: 'COM3',
      baudRate: 115200,
      protocol: 'serial'
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const combinedLogPath = path.join(testLogDir, 'combined.log');
    const logContent = await fs.readFile(combinedLogPath, 'utf8');
    const lines = logContent.trim().split('\\n');
    const lastLine = lines[lines.length - 1];
    const logEntry = JSON.parse(lastLine);

    assert.strictEqual(logEntry.message, 'Serial connection established');
    assert.strictEqual(logEntry.category, 'hardware');
    assert.strictEqual(logEntry.port, 'COM3');
  });

  // Cleanup
  await fs.remove(testLogDir);
});

test('Logger - Express Middleware', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs-middleware');
  await fs.ensureDir(testLogDir);
  
  const logger = new Logger(testLogDir);
  const express = require('express');
  const request = require('supertest');

  await t.test('should log HTTP requests', async () => {
    const app = express();
    app.use(logger.requestMiddleware());
    app.get('/test', (req, res) => {
      res.json({ success: true });
    });

    await request(app)
      .get('/test')
      .expect(200);

    await new Promise(resolve => setTimeout(resolve, 100));

    const combinedLogPath = path.join(testLogDir, 'combined.log');
    const logContent = await fs.readFile(combinedLogPath, 'utf8');

    assert.ok(logContent.includes('HTTP Request'));
    assert.ok(logContent.includes('GET'));
    assert.ok(logContent.includes('/test'));
    assert.ok(logContent.includes('200'));
  });

  await t.test('should log request timing', async () => {
    const app = express();
    app.use(logger.requestMiddleware());
    app.get('/slow', (req, res) => {
      // Simulate slow endpoint
      setTimeout(() => {
        res.json({ success: true });
      }, 50);
    });

    await request(app)
      .get('/slow')
      .expect(200);

    await new Promise(resolve => setTimeout(resolve, 150));

    const performanceLogPath = path.join(testLogDir, 'performance.log');
    const logContent = await fs.readFile(performanceLogPath, 'utf8');
    const lines = logContent.trim().split('\\n');
    const lastLine = lines[lines.length - 1];
    const logEntry = JSON.parse(lastLine);

    assert.ok(logEntry.responseTime > 0);
    assert.strictEqual(logEntry.method, 'GET');
    assert.strictEqual(logEntry.endpoint, '/slow');
  });

  // Cleanup
  await fs.remove(testLogDir);
});

test('Logger - Error Handling', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs-errors');
  await fs.ensureDir(testLogDir);
  
  const logger = new Logger(testLogDir);
  const express = require('express');
  const request = require('supertest');

  await t.test('should log application errors', async () => {
    const testError = new Error('Test error message');
    testError.stack = 'Error: Test error message\\n    at test.js:123:45';

    logger.error('Application error occurred', testError);

    await new Promise(resolve => setTimeout(resolve, 100));

    const errorLogPath = path.join(testLogDir, 'error.log');
    const logContent = await fs.readFile(errorLogPath, 'utf8');
    const logEntry = JSON.parse(logContent.trim());

    assert.strictEqual(logEntry.message, 'Application error occurred');
    assert.strictEqual(logEntry.level, 'error');
    assert.ok(logEntry.stack.includes('Test error message'));
  });

  await t.test('should use error middleware', async () => {
    const app = express();
    app.use(logger.requestMiddleware());
    
    app.get('/error', (req, res, next) => {
      const error = new Error('Route error');
      next(error);
    });

    app.use(logger.errorMiddleware());

    const response = await request(app)
      .get('/error')
      .expect(500);

    await new Promise(resolve => setTimeout(resolve, 100));

    const errorLogPath = path.join(testLogDir, 'error.log');
    const logContent = await fs.readFile(errorLogPath, 'utf8');

    assert.ok(logContent.includes('Route error'));
    assert.ok(logContent.includes('GET'));
    assert.ok(logContent.includes('/error'));
  });

  // Cleanup
  await fs.remove(testLogDir);
});

test('Logger - Log Rotation', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs-rotation');
  await fs.ensureDir(testLogDir);
  
  const logger = new Logger(testLogDir, {
    maxSize: '1k', // Very small for testing
    maxFiles: 3
  });

  await t.test('should rotate logs when size limit reached', async () => {
    // Write enough data to trigger rotation
    for (let i = 0; i < 100; i++) {
      logger.info(`Log entry ${i} with some additional content to increase file size`);
    }

    // Wait for file operations
    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = await fs.readdir(testLogDir);
    const combinedFiles = logFiles.filter(file => file.startsWith('combined'));

    // Should have multiple log files due to rotation
    assert.ok(combinedFiles.length > 1);
  });

  // Cleanup
  await fs.remove(testLogDir);
});

test('Logger - Configuration', async (t) => {
  const testLogDir = path.join(__dirname, 'test-logs-config');
  await fs.ensureDir(testLogDir);

  await t.test('should accept custom configuration', () => {
    const customConfig = {
      level: 'warn',
      maxSize: '10m',
      maxFiles: 10,
      datePattern: 'YYYY-MM-DD-HH'
    };

    const logger = new Logger(testLogDir, customConfig);
    assert.ok(logger);

    // Debug and info should not be logged with warn level
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');

    // Only warning should be logged
  });

  await t.test('should handle invalid log directory gracefully', () => {
    const invalidDir = '/invalid/path/that/does/not/exist';
    
    // Should not throw error
    assert.doesNotThrow(() => {
      new Logger(invalidDir);
    });
  });

  // Cleanup
  await fs.remove(testLogDir);
});