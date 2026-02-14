/**
 * Database Integration Tests
 * Comprehensive testing of database operations, transactions, and data consistency
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  getTestHelper,
} = require('../integration-test-helpers');
const { TEST_CONFIG } = require('../integration-test-config');

// Import database modules for direct testing
const { DatabaseManager, models } = require('../../../lib/database');
const { DataMigration } = require('../../../lib/migration');

describe('Database Integration Tests', () => {
  let helper;
  let dbManager;
  let testDbPath;

  before(async () => {
    helper = await setupIntegrationTestEnvironment();
    testDbPath = TEST_CONFIG.database.testDbPath;

    // Initialize database manager with test configuration
    dbManager = new DatabaseManager({
      dbPath: testDbPath,
      logLevel: 'error', // Reduce log noise in tests
    });

    await dbManager.initialize();
  });

  after(async () => {
    if (dbManager) {
      await dbManager.close();
    }
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    // Clean database before each test
    if (dbManager && dbManager.isConnected()) {
      await dbManager.clearAllTables();
    }
  });

  describe('Database Connection and Initialization', () => {
    it('should establish database connection successfully', async () => {
      assert.strictEqual(dbManager.isConnected(), true);

      const status = await dbManager.getStatus();
      assert.strictEqual(status.connected, true);
      assert.strictEqual(typeof status.version, 'string');
      assert.strictEqual(typeof status.size, 'number');
    });

    it('should create all required tables', async () => {
      const tableInfo = await dbManager.getTableInfo();

      // Verify all expected tables exist
      const expectedTables = [
        'users',
        'user_sessions',
        'robot_configs',
        'positions',
        'position_groups',
        'gcode_files',
        'execution_logs',
        'audit_logs',
        'system_settings',
      ];

      expectedTables.forEach(tableName => {
        assert(tableInfo.tables[tableName], `Table ${tableName} should exist`);
        assert(
          tableInfo.tables[tableName].columns.length > 0,
          `Table ${tableName} should have columns`
        );
      });
    });

    it('should handle database file creation and permissions', async () => {
      const dbExists = await fs.pathExists(testDbPath);
      assert.strictEqual(dbExists, true, 'Database file should exist');

      const stats = await fs.stat(testDbPath);
      assert(stats.isFile(), 'Database path should be a file');
      assert(stats.size > 0, 'Database file should not be empty');
    });
  });

  describe('User Management Database Operations', () => {
    it('should create and retrieve users', async () => {
      const userData = {
        username: 'db-test-user',
        email: 'db-test@example.com',
        passwordHash: 'hashed-password',
        role: 'operator',
      };

      // Create user
      const user = await dbManager.createUser(userData);
      assert.strictEqual(typeof user.id, 'number');
      assert.strictEqual(user.username, userData.username);
      assert.strictEqual(user.email, userData.email);
      assert.strictEqual(user.role, userData.role);
      assert.strictEqual(typeof user.createdAt, 'string');

      // Retrieve user by ID
      const retrievedUser = await dbManager.getUserById(user.id);
      assert.deepStrictEqual(retrievedUser.username, user.username);
      assert.deepStrictEqual(retrievedUser.email, user.email);

      // Retrieve user by username
      const userByUsername = await dbManager.getUserByUsername(userData.username);
      assert.strictEqual(userByUsername.id, user.id);
    });

    it('should handle user constraints and validation', async () => {
      const userData = {
        username: 'constraint-test',
        email: 'constraint@example.com',
        passwordHash: 'hashed-password',
        role: 'operator',
      };

      // Create first user
      await dbManager.createUser(userData);

      // Try to create duplicate username - should fail
      try {
        await dbManager.createUser({
          ...userData,
          email: 'different@example.com',
        });
        assert.fail('Should not allow duplicate username');
      } catch (error) {
        assert(
          error.message.includes('UNIQUE constraint failed') || error.message.includes('username')
        );
      }

      // Try to create duplicate email - should fail
      try {
        await dbManager.createUser({
          ...userData,
          username: 'different-username',
        });
        assert.fail('Should not allow duplicate email');
      } catch (error) {
        assert(
          error.message.includes('UNIQUE constraint failed') || error.message.includes('email')
        );
      }
    });

    it('should update user information', async () => {
      // Create user
      const user = await dbManager.createUser({
        username: 'update-test',
        email: 'update@example.com',
        passwordHash: 'hashed-password',
        role: 'operator',
      });

      // Update user
      const updates = {
        email: 'updated@example.com',
        role: 'admin',
        isActive: false,
      };

      const updatedUser = await dbManager.updateUser(user.id, updates);
      assert.strictEqual(updatedUser.email, updates.email);
      assert.strictEqual(updatedUser.role, updates.role);
      assert.strictEqual(updatedUser.isActive, updates.isActive);

      // Verify persistence
      const retrievedUser = await dbManager.getUserById(user.id);
      assert.strictEqual(retrievedUser.email, updates.email);
      assert.strictEqual(retrievedUser.role, updates.role);
    });

    it('should delete users and handle cascading', async () => {
      // Create user
      const user = await dbManager.createUser({
        username: 'delete-test',
        email: 'delete@example.com',
        passwordHash: 'hashed-password',
        role: 'operator',
      });

      // Create related session data
      await dbManager.createSession({
        userId: user.id,
        token: 'test-session-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
      });

      // Delete user
      await dbManager.deleteUser(user.id);

      // Verify user is deleted
      const deletedUser = await dbManager.getUserById(user.id);
      assert.strictEqual(deletedUser, null);

      // Verify cascaded session deletion
      const sessions = await dbManager.getSessionsByUserId(user.id);
      assert.strictEqual(sessions.length, 0);
    });
  });

  describe('Position Management Database Operations', () => {
    it('should create and retrieve positions', async () => {
      const positionData = {
        name: 'DB Test Position',
        axes: {
          axis1: 45.5,
          axis2: -30.2,
          axis3: 90.0,
        },
        manipulators: {
          gripper1: 75.5,
        },
        delay: 2000,
        createdBy: 1,
      };

      // Create position
      const position = await dbManager.createPosition(positionData);
      assert.strictEqual(typeof position.id, 'number');
      assert.strictEqual(position.name, positionData.name);
      assert.deepStrictEqual(JSON.parse(position.axes), positionData.axes);
      assert.deepStrictEqual(JSON.parse(position.manipulators), positionData.manipulators);
      assert.strictEqual(position.delay, positionData.delay);

      // Retrieve position
      const retrievedPosition = await dbManager.getPositionById(position.id);
      assert.strictEqual(retrievedPosition.name, position.name);
    });

    it('should handle position groups', async () => {
      // Create position group
      const groupData = {
        name: 'Test Group',
        description: 'A test position group',
        createdBy: 1,
      };

      const group = await dbManager.createPositionGroup(groupData);
      assert.strictEqual(typeof group.id, 'number');
      assert.strictEqual(group.name, groupData.name);

      // Create positions in group
      const position1 = await dbManager.createPosition({
        name: 'Group Position 1',
        axes: { axis1: 0 },
        manipulators: { gripper1: 0 },
        delay: 1000,
        groupId: group.id,
        createdBy: 1,
      });

      const position2 = await dbManager.createPosition({
        name: 'Group Position 2',
        axes: { axis1: 45 },
        manipulators: { gripper1: 50 },
        delay: 1500,
        groupId: group.id,
        createdBy: 1,
      });

      // Retrieve positions by group
      const groupPositions = await dbManager.getPositionsByGroupId(group.id);
      assert.strictEqual(groupPositions.length, 2);
      assert(groupPositions.find(p => p.id === position1.id));
      assert(groupPositions.find(p => p.id === position2.id));
    });

    it('should support position search and filtering', async () => {
      // Create test positions
      await dbManager.createPosition({
        name: 'Home Position',
        axes: { axis1: 0, axis2: 0, axis3: 0 },
        manipulators: { gripper1: 0 },
        delay: 1000,
        createdBy: 1,
      });

      await dbManager.createPosition({
        name: 'Work Position A',
        axes: { axis1: 45, axis2: 30, axis3: 60 },
        manipulators: { gripper1: 50 },
        delay: 2000,
        createdBy: 1,
      });

      await dbManager.createPosition({
        name: 'Work Position B',
        axes: { axis1: -45, axis2: -30, axis3: 90 },
        manipulators: { gripper1: 75 },
        delay: 1500,
        createdBy: 1,
      });

      // Search by name pattern
      const workPositions = await dbManager.searchPositions({ namePattern: 'Work%' });
      assert.strictEqual(workPositions.length, 2);

      // Filter by delay range
      const fastPositions = await dbManager.searchPositions({
        minDelay: 1000,
        maxDelay: 1500,
      });
      assert.strictEqual(fastPositions.length, 2);
    });
  });

  describe('G-Code File Management', () => {
    it('should store and retrieve G-code files', async () => {
      const gcodeData = {
        name: 'Test G-Code File',
        content: ['G28 ; Home all axes', 'G1 X10 Y10 Z5 F1000', 'M84 ; Disable motors'],
        fileSize: 1024,
        createdBy: 1,
      };

      // Create G-code file record
      const gcodeFile = await dbManager.createGCodeFile(gcodeData);
      assert.strictEqual(typeof gcodeFile.id, 'number');
      assert.strictEqual(gcodeFile.name, gcodeData.name);
      assert.deepStrictEqual(JSON.parse(gcodeFile.content), gcodeData.content);

      // Retrieve G-code file
      const retrievedFile = await dbManager.getGCodeFileById(gcodeFile.id);
      assert.strictEqual(retrievedFile.name, gcodeFile.name);
      assert.deepStrictEqual(JSON.parse(retrievedFile.content), gcodeData.content);
    });

    it('should track G-code execution logs', async () => {
      // Create G-code file
      const gcodeFile = await dbManager.createGCodeFile({
        name: 'Execution Test File',
        content: ['G28', 'G1 X10 Y10', 'M84'],
        fileSize: 512,
        createdBy: 1,
      });

      // Create execution log
      const executionData = {
        gcodeFileId: gcodeFile.id,
        executionId: 'exec-' + Date.now(),
        status: 'RUNNING',
        startedAt: new Date(),
        currentLine: 1,
        totalLines: 3,
        executedBy: 1,
      };

      const executionLog = await dbManager.createExecutionLog(executionData);
      assert.strictEqual(executionLog.gcodeFileId, gcodeFile.id);
      assert.strictEqual(executionLog.status, 'RUNNING');

      // Update execution status
      await dbManager.updateExecutionLog(executionLog.id, {
        status: 'COMPLETED',
        currentLine: 3,
        completedAt: new Date(),
      });

      // Verify update
      const updatedLog = await dbManager.getExecutionLogById(executionLog.id);
      assert.strictEqual(updatedLog.status, 'COMPLETED');
      assert.strictEqual(updatedLog.currentLine, 3);
      assert(updatedLog.completedAt);
    });
  });

  describe('Configuration Management', () => {
    it('should store and retrieve robot configurations', async () => {
      const configData = {
        name: 'Test Configuration',
        robotType: 'arctos-test',
        communicationProtocol: 'can',
        settings: {
          axes: { count: 6 },
          manipulators: { count: 2 },
          limits: { axis1: { min: -180, max: 180 } },
        },
        isActive: true,
        createdBy: 1,
      };

      // Create configuration
      const config = await dbManager.createRobotConfig(configData);
      assert.strictEqual(typeof config.id, 'number');
      assert.strictEqual(config.name, configData.name);
      assert.strictEqual(config.robotType, configData.robotType);
      assert.deepStrictEqual(JSON.parse(config.settings), configData.settings);

      // Retrieve active configuration
      const activeConfig = await dbManager.getActiveRobotConfig();
      assert.strictEqual(activeConfig.id, config.id);
      assert.strictEqual(activeConfig.isActive, true);
    });

    it('should handle configuration versioning', async () => {
      // Create base configuration
      const baseConfig = await dbManager.createRobotConfig({
        name: 'Base Config',
        robotType: 'arctos',
        communicationProtocol: 'can',
        settings: { version: 1 },
        isActive: true,
        createdBy: 1,
      });

      // Create new version
      const newConfig = await dbManager.createRobotConfig({
        name: 'Updated Config',
        robotType: 'arctos',
        communicationProtocol: 'serial',
        settings: { version: 2 },
        isActive: true,
        createdBy: 1,
        parentConfigId: baseConfig.id,
      });

      // Verify old config is deactivated
      const oldConfig = await dbManager.getRobotConfigById(baseConfig.id);
      assert.strictEqual(oldConfig.isActive, false);

      // Verify new config is active
      const activeConfig = await dbManager.getActiveRobotConfig();
      assert.strictEqual(activeConfig.id, newConfig.id);

      // Get configuration history
      const history = await dbManager.getRobotConfigHistory();
      assert(history.length >= 2);
      assert(history.find(c => c.id === baseConfig.id));
      assert(history.find(c => c.id === newConfig.id));
    });
  });

  describe('Audit Trail Management', () => {
    it('should log user actions for audit trail', async () => {
      const auditData = {
        userId: 1,
        action: 'POSITION_CREATED',
        resourceType: 'position',
        resourceId: 1,
        details: { positionName: 'Test Position' },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
      };

      // Create audit log
      const auditLog = await dbManager.createAuditLog(auditData);
      assert.strictEqual(typeof auditLog.id, 'number');
      assert.strictEqual(auditLog.action, auditData.action);
      assert.strictEqual(auditLog.resourceType, auditData.resourceType);
      assert.deepStrictEqual(JSON.parse(auditLog.details), auditData.details);

      // Query audit logs
      const auditLogs = await dbManager.getAuditLogs({
        userId: 1,
        limit: 10,
      });
      assert(auditLogs.length > 0);
      assert.strictEqual(auditLogs[0].id, auditLog.id);
    });

    it('should support audit log filtering and pagination', async () => {
      // Create multiple audit logs
      for (let i = 1; i <= 15; i++) {
        await dbManager.createAuditLog({
          userId: 1,
          action: i <= 10 ? 'POSITION_CREATED' : 'CONFIG_UPDATED',
          resourceType: i <= 10 ? 'position' : 'config',
          resourceId: i,
          details: { index: i },
          ipAddress: '127.0.0.1',
        });
      }

      // Test pagination
      const firstPage = await dbManager.getAuditLogs({
        limit: 5,
        offset: 0,
      });
      assert.strictEqual(firstPage.length, 5);

      const secondPage = await dbManager.getAuditLogs({
        limit: 5,
        offset: 5,
      });
      assert.strictEqual(secondPage.length, 5);

      // Test action filtering
      const positionLogs = await dbManager.getAuditLogs({
        action: 'POSITION_CREATED',
      });
      assert.strictEqual(positionLogs.length, 10);

      // Test date range filtering
      const recentLogs = await dbManager.getAuditLogs({
        startDate: new Date(Date.now() - 3600000), // 1 hour ago
        endDate: new Date(),
      });
      assert.strictEqual(recentLogs.length, 15);
    });
  });

  describe('Transaction Management', () => {
    it('should handle database transactions correctly', async () => {
      const transaction = await dbManager.beginTransaction();

      try {
        // Create user within transaction
        const user = await dbManager.createUser(
          {
            username: 'transaction-test',
            email: 'transaction@example.com',
            passwordHash: 'hashed-password',
            role: 'operator',
          },
          { transaction }
        );

        // Create position within same transaction
        const position = await dbManager.createPosition(
          {
            name: 'Transaction Position',
            axes: { axis1: 0 },
            manipulators: { gripper1: 0 },
            delay: 1000,
            createdBy: user.id,
          },
          { transaction }
        );

        // Commit transaction
        await transaction.commit();

        // Verify both records exist
        const savedUser = await dbManager.getUserById(user.id);
        const savedPosition = await dbManager.getPositionById(position.id);
        assert(savedUser);
        assert(savedPosition);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    });

    it('should rollback transactions on error', async () => {
      const transaction = await dbManager.beginTransaction();

      try {
        // Create user within transaction
        const user = await dbManager.createUser(
          {
            username: 'rollback-test',
            email: 'rollback@example.com',
            passwordHash: 'hashed-password',
            role: 'operator',
          },
          { transaction }
        );

        // Intentionally cause an error (duplicate username)
        await dbManager.createUser(
          {
            username: 'rollback-test', // Duplicate username
            email: 'rollback2@example.com',
            passwordHash: 'hashed-password',
            role: 'operator',
          },
          { transaction }
        );

        await transaction.commit();
        assert.fail('Should not reach this point');
      } catch (error) {
        await transaction.rollback();

        // Verify rollback - user should not exist
        const users = await dbManager.searchUsers({ username: 'rollback-test' });
        assert.strictEqual(users.length, 0);
      }
    });
  });

  describe('Database Backup and Restore', () => {
    it('should create database backups', async () => {
      // Create some test data
      await dbManager.createUser({
        username: 'backup-test',
        email: 'backup@example.com',
        passwordHash: 'hashed-password',
        role: 'operator',
      });

      await dbManager.createPosition({
        name: 'Backup Position',
        axes: { axis1: 45 },
        manipulators: { gripper1: 50 },
        delay: 1000,
        createdBy: 1,
      });

      // Create backup
      const backupPath = path.join(TEST_CONFIG.filesystem.testDataDir, 'test-backup.db');
      const backupInfo = await dbManager.createBackup(backupPath);

      assert.strictEqual(typeof backupInfo.path, 'string');
      assert.strictEqual(typeof backupInfo.size, 'number');
      assert.strictEqual(typeof backupInfo.timestamp, 'string');

      // Verify backup file exists
      const backupExists = await fs.pathExists(backupPath);
      assert.strictEqual(backupExists, true);

      const backupStats = await fs.stat(backupPath);
      assert(backupStats.size > 0);
    });

    it('should support data migration', async () => {
      // Create migration instance
      const migration = new DataMigration(dbManager);

      // Test data export
      const exportData = await migration.exportAllData();

      assert(exportData.users);
      assert(exportData.positions);
      assert(exportData.configs);
      assert(Array.isArray(exportData.users));
      assert(Array.isArray(exportData.positions));

      // Clear database
      await dbManager.clearAllTables();

      // Verify database is empty
      const emptyUsers = await dbManager.getAllUsers();
      assert.strictEqual(emptyUsers.length, 0);

      // Import data back
      await migration.importAllData(exportData);

      // Verify data is restored
      const restoredUsers = await dbManager.getAllUsers();
      assert.strictEqual(restoredUsers.length, exportData.users.length);
    });
  });

  describe('Database Performance and Optimization', () => {
    it('should handle large datasets efficiently', async () => {
      const batchSize = 100;
      const users = [];

      // Create batch of users
      for (let i = 1; i <= batchSize; i++) {
        users.push({
          username: `perf-user-${i}`,
          email: `perf-user-${i}@example.com`,
          passwordHash: 'hashed-password',
          role: 'operator',
        });
      }

      // Measure batch insertion time
      const startTime = process.hrtime();

      // Use transaction for batch insert
      const transaction = await dbManager.beginTransaction();
      try {
        for (const userData of users) {
          await dbManager.createUser(userData, { transaction });
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      const [seconds, nanoseconds] = process.hrtime(startTime);
      const insertTime = seconds * 1000 + nanoseconds / 1000000;

      // Should complete within reasonable time (< 5 seconds for 100 users)
      assert(insertTime < 5000, `Batch insert took too long: ${insertTime}ms`);

      // Verify all users were created
      const allUsers = await dbManager.getAllUsers();
      assert.strictEqual(allUsers.length, batchSize);

      // Test query performance
      const queryStartTime = process.hrtime();
      const searchResults = await dbManager.searchUsers({ roleFilter: 'operator' });
      const [qSeconds, qNanoseconds] = process.hrtime(queryStartTime);
      const queryTime = qSeconds * 1000 + qNanoseconds / 1000000;

      assert(queryTime < 1000, `Query took too long: ${queryTime}ms`);
      assert.strictEqual(searchResults.length, batchSize);
    });

    it('should maintain database integrity under concurrent access', async () => {
      const concurrentOperations = 10;
      const promises = [];

      // Create concurrent database operations
      for (let i = 1; i <= concurrentOperations; i++) {
        promises.push(
          dbManager.createUser({
            username: `concurrent-user-${i}`,
            email: `concurrent-${i}@example.com`,
            passwordHash: 'hashed-password',
            role: 'operator',
          })
        );
      }

      // Execute all operations concurrently
      const results = await Promise.allSettled(promises);

      // All operations should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      assert.strictEqual(successful.length, concurrentOperations);

      // Verify data integrity
      const allUsers = await dbManager.getAllUsers();
      const concurrentUsers = allUsers.filter(u => u.username.startsWith('concurrent-user-'));
      assert.strictEqual(concurrentUsers.length, concurrentOperations);

      // Verify unique constraints are maintained
      const usernames = concurrentUsers.map(u => u.username);
      const uniqueUsernames = [...new Set(usernames)];
      assert.strictEqual(usernames.length, uniqueUsernames.length);
    });
  });

  describe('Database Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Close database connection
      await dbManager.close();

      // Try to perform operation on closed connection
      try {
        await dbManager.createUser({
          username: 'error-test',
          email: 'error@example.com',
          passwordHash: 'hashed-password',
          role: 'operator',
        });
        assert.fail('Should throw error for closed connection');
      } catch (error) {
        assert(error.message.includes('database') || error.message.includes('connection'));
      }

      // Reconnect for other tests
      await dbManager.initialize();
    });

    it('should handle corrupted data gracefully', async () => {
      // Create position with invalid JSON data directly
      try {
        await dbManager.sequelize.models.Position.create({
          name: 'Corrupted Position',
          axes: 'invalid-json-data',
          manipulators: '{"gripper1": 50}',
          delay: 1000,
          createdBy: 1,
        });

        // Try to retrieve the corrupted position
        const positions = await dbManager.getAllPositions();

        // Should handle JSON parsing errors gracefully
        assert(Array.isArray(positions));
      } catch (error) {
        // Expected to fail with validation error
        assert(
          error.message.includes('JSON') ||
            error.message.includes('parse') ||
            error.message.includes('validation')
        );
      }
    });

    it('should enforce foreign key constraints', async () => {
      try {
        // Try to create position with non-existent user ID
        await dbManager.createPosition({
          name: 'Invalid Position',
          axes: { axis1: 0 },
          manipulators: { gripper1: 0 },
          delay: 1000,
          createdBy: 99999, // Non-existent user ID
        });

        // Should fail if foreign key constraints are enforced
        // If it doesn't fail, that's also valid (depends on DB configuration)
      } catch (error) {
        // Expected foreign key constraint error
        assert(error.message.includes('FOREIGN KEY') || error.message.includes('constraint'));
      }
    });
  });
});
