const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Import logging system
const { Logger, logger } = require('../lib/logger');

test('Logger - Fixed Unit Tests', async t => {
  const testLogDir = path.join(__dirname, 'test-logs-fixed');

  await t.beforeEach(async () => {
    // Clean up test directory
    await fs.remove(testLogDir);
    await fs.ensureDir(testLogDir);
  });

  await t.test('should create logger instance', async () => {
    const testLogger = new Logger(testLogDir);
    assert.ok(testLogger, 'Logger should be created successfully');
  });

  await t.test('should write log messages', async () => {
    const testLogger = new Logger(testLogDir);

    testLogger.info('Test log message');
    testLogger.warn('Test warning message');
    testLogger.error('Test error message');

    // Wait for async file operations
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if log directory has files
    const logFiles = await fs.readdir(testLogDir);
    assert.ok(logFiles.length > 0, 'Log files should be created');
  });

  await t.test('should handle different log levels', async () => {
    const testLogger = new Logger(testLogDir);

    // Test all log levels
    testLogger.debug('Debug message');
    testLogger.info('Info message');
    testLogger.warn('Warning message');
    testLogger.error('Error message');

    // Wait for file writes
    await new Promise(resolve => setTimeout(resolve, 300));

    const logFiles = await fs.readdir(testLogDir);
    assert.ok(logFiles.length > 0, 'Log files should contain entries');
  });

  await t.test('should use default logger instance', async () => {
    // Test the default exported logger
    assert.ok(logger, 'Default logger should be available');
    assert.ok(typeof logger.info === 'function', 'Logger should have info method');
    assert.ok(typeof logger.error === 'function', 'Logger should have error method');
    assert.ok(typeof logger.warn === 'function', 'Logger should have warn method');
  });

  await t.afterEach(async () => {
    // Clean up after each test
    await fs.remove(testLogDir).catch(() => {});
  });
});

test('Logger - Performance and Specialized Logging', async t => {
  const testLogDir = path.join(__dirname, 'test-logs-specialized-fixed');

  await t.beforeEach(async () => {
    await fs.remove(testLogDir);
    await fs.ensureDir(testLogDir);
  });

  await t.test('should handle performance logging', async () => {
    const testLogger = new Logger(testLogDir);

    // Simulate performance logging
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    const endTime = Date.now();

    testLogger.info(`Performance: Operation took ${endTime - startTime}ms`);

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = await fs.readdir(testLogDir);
    assert.ok(logFiles.length > 0, 'Performance logs should be written');
  });

  await t.test('should handle error logging with context', async () => {
    const testLogger = new Logger(testLogDir);

    const error = new Error('Test error');
    testLogger.error('Test error occurred', {
      error: error.message,
      stack: error.stack,
      context: 'unit-test',
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    const logFiles = await fs.readdir(testLogDir);
    assert.ok(logFiles.length > 0, 'Error logs should be written with context');
  });

  await t.afterEach(async () => {
    await fs.remove(testLogDir).catch(() => {});
  });
});
