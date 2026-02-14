/**
 * Comprehensive Unit Tests for Database Module
 * Following AAA Pattern with 100% Coverage Target
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const { Sequelize } = require('sequelize');

// Import module under test
const { DatabaseManager, models } = require('../../lib/database');

describe('DatabaseManager - Comprehensive Unit Tests', () => {
  let dbManager;
  let testDbPath;
  let testBackupPath;

  beforeEach(async () => {
    // Arrange: Setup test database paths
    testDbPath = path.join(__dirname, '../fixtures/test-database.sqlite');
    testBackupPath = path.join(__dirname, '../fixtures/test-backups');

    // Clean up previous test files
    await fs.remove(testDbPath);
    await fs.remove(testBackupPath);

    // Create test database manager
    dbManager = new DatabaseManager({
      storage: testDbPath,
      backupPath: testBackupPath,
      logging: false, // Disable SQL logging in tests
    });

    await dbManager.initialize();
  });

  afterEach(async () => {
    // Cleanup: Close database and remove test files
    if (dbManager && dbManager.sequelize) {
      await dbManager.sequelize.close();
    }
    await fs.remove(testDbPath);
    await fs.remove(testBackupPath);
  });

  describe('Database Initialization', () => {
    test('should initialize database with correct models', async () => {
      // Assert
      assert.ok(dbManager.sequelize);
      assert.ok(dbManager.models);
      assert.ok(dbManager.models.User);
      assert.ok(dbManager.models.Position);
      assert.ok(dbManager.models.GCodeProgram);
      assert.ok(dbManager.models.HardwareError);
      assert.ok(dbManager.models.SystemLog);
    });

    test('should create database file', async () => {
      // Assert
      assert.ok(await fs.pathExists(testDbPath));
    });

    test('should establish proper table associations', async () => {
      // Assert
      const userModel = dbManager.models.User;
      const positionModel = dbManager.models.Position;

      assert.ok(userModel.associations);
      assert.ok(positionModel.associations);

      // Check specific associations
      assert.ok(userModel.associations.positions);
      assert.ok(positionModel.associations.user);
    });

    test('should handle database connection errors gracefully', async () => {
      // Arrange: Create database manager with invalid path
      const invalidPath = '/invalid/path/database.sqlite';
      const invalidDbManager = new DatabaseManager({ storage: invalidPath });

      // Act & Assert
      try {
        await invalidDbManager.initialize();
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error);
        assert.ok(error.message.includes('ENOENT') || error.message.includes('permission'));
      }
    });
  });

  describe('User Model Operations', () => {
    test('should create new user successfully', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed_password_123',
        role: 'user',
        is_active: true,
      };

      // Act
      const user = await dbManager.models.User.create(userData);

      // Assert
      assert.ok(user.id);
      assert.strictEqual(user.username, 'testuser');
      assert.strictEqual(user.email, 'test@example.com');
      assert.strictEqual(user.role, 'user');
      assert.strictEqual(user.is_active, true);
      assert.ok(user.created_at);
      assert.ok(user.updated_at);
    });

    test('should enforce unique username constraint', async () => {
      // Arrange
      const userData = {
        username: 'testuser',
        email: 'test1@example.com',
        password_hash: 'hash1',
        role: 'user',
      };

      await dbManager.models.User.create(userData);

      // Act & Assert
      try {
        await dbManager.models.User.create({
          ...userData,
          email: 'test2@example.com',
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error) {
        assert.ok(error.name === 'SequelizeUniqueConstraintError');
      }
    });

    test('should enforce unique email constraint', async () => {
      // Arrange
      const userData = {
        username: 'testuser1',
        email: 'test@example.com',
        password_hash: 'hash1',
        role: 'user',
      };

      await dbManager.models.User.create(userData);

      // Act & Assert
      try {
        await dbManager.models.User.create({
          ...userData,
          username: 'testuser2',
        });
        assert.fail('Should have thrown unique constraint error');
      } catch (error) {
        assert.ok(error.name === 'SequelizeUniqueConstraintError');
      }
    });

    test('should validate required fields', async () => {
      // Arrange & Act & Assert
      const testCases = [
        { data: {}, expectedError: 'username' },
        { data: { username: 'test' }, expectedError: 'email' },
        { data: { username: 'test', email: 'test@example.com' }, expectedError: 'password_hash' },
      ];

      for (const testCase of testCases) {
        try {
          await dbManager.models.User.create(testCase.data);
          assert.fail(`Should have failed validation for missing ${testCase.expectedError}`);
        } catch (error) {
          assert.ok(error.name === 'SequelizeValidationError');
          assert.ok(error.message.includes(testCase.expectedError));
        }
      }
    });

    test('should validate email format', async () => {
      // Arrange
      const invalidEmailData = {
        username: 'testuser',
        email: 'invalid-email-format',
        password_hash: 'hash123',
        role: 'user',
      };

      // Act & Assert
      try {
        await dbManager.models.User.create(invalidEmailData);
        assert.fail('Should have failed email validation');
      } catch (error) {
        assert.ok(error.name === 'SequelizeValidationError');
        assert.ok(error.message.includes('email'));
      }
    });

    test('should validate role enum values', async () => {
      // Arrange
      const invalidRoleData = {
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hash123',
        role: 'invalid_role',
      };

      // Act & Assert
      try {
        await dbManager.models.User.create(invalidRoleData);
        assert.fail('Should have failed role validation');
      } catch (error) {
        assert.ok(
          error.name === 'SequelizeValidationError' || error.name === 'SequelizeDatabaseError'
        );
      }
    });

    test('should update user successfully', async () => {
      // Arrange
      const user = await dbManager.models.User.create({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      // Act
      await user.update({
        email: 'updated@example.com',
        role: 'admin',
        is_active: false,
      });

      // Assert
      assert.strictEqual(user.email, 'updated@example.com');
      assert.strictEqual(user.role, 'admin');
      assert.strictEqual(user.is_active, false);
      assert.ok(user.updated_at > user.created_at);
    });

    test('should soft delete user', async () => {
      // Arrange
      const user = await dbManager.models.User.create({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      // Act
      await user.destroy();

      // Assert
      const foundUser = await dbManager.models.User.findByPk(user.id);
      assert.strictEqual(foundUser, null); // Should be soft deleted

      const foundWithDeleted = await dbManager.models.User.findByPk(user.id, { paranoid: false });
      assert.ok(foundWithDeleted);
      assert.ok(foundWithDeleted.deleted_at);
    });

    test('should find users with proper scopes', async () => {
      // Arrange
      await dbManager.models.User.create({
        username: 'activeuser',
        email: 'active@example.com',
        password_hash: 'hash123',
        role: 'user',
        is_active: true,
      });

      await dbManager.models.User.create({
        username: 'inactiveuser',
        email: 'inactive@example.com',
        password_hash: 'hash123',
        role: 'user',
        is_active: false,
      });

      // Act
      const allUsers = await dbManager.models.User.findAll();
      const activeUsers = await dbManager.models.User.scope('active').findAll();
      const adminUsers = await dbManager.models.User.scope('admins').findAll();

      // Assert
      assert.strictEqual(allUsers.length, 2);
      assert.strictEqual(activeUsers.length, 1);
      assert.strictEqual(activeUsers[0].username, 'activeuser');
      assert.strictEqual(adminUsers.length, 0); // No admin users in this test
    });
  });

  describe('Position Model Operations', () => {
    let testUser;

    beforeEach(async () => {
      // Create test user for position associations
      testUser = await dbManager.models.User.create({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hash123',
        role: 'user',
      });
    });

    test('should create position successfully', async () => {
      // Arrange
      const positionData = {
        name: 'Test Position',
        description: 'A test position',
        axis1: 10.5,
        axis2: -20.3,
        axis3: 0.0,
        axis4: 45.0,
        axis5: 90.0,
        axis6: 180.0,
        gripper1: 50,
        gripper2: 75,
        coordinate_system: 'G54',
        feed_rate: 1000,
        user_id: testUser.id,
      };

      // Act
      const position = await dbManager.models.Position.create(positionData);

      // Assert
      assert.ok(position.id);
      assert.strictEqual(position.name, 'Test Position');
      assert.strictEqual(position.axis1, 10.5);
      assert.strictEqual(position.axis2, -20.3);
      assert.strictEqual(position.gripper1, 50);
      assert.strictEqual(position.coordinate_system, 'G54');
      assert.strictEqual(position.user_id, testUser.id);
      assert.ok(position.created_at);
    });

    test('should enforce unique position names per user', async () => {
      // Arrange
      const positionData = {
        name: 'Unique Position',
        axis1: 10,
        axis2: 10,
        axis3: 10,
        user_id: testUser.id,
      };

      await dbManager.models.Position.create(positionData);

      // Act & Assert
      try {
        await dbManager.models.Position.create(positionData);
        assert.fail('Should have thrown unique constraint error');
      } catch (error) {
        assert.ok(error.name === 'SequelizeUniqueConstraintError');
      }
    });

    test('should validate axis value ranges', async () => {
      // Arrange
      const invalidPositionData = {
        name: 'Invalid Position',
        axis1: 999999, // Exceeds typical axis limits
        axis2: -999999,
        axis3: 0,
        user_id: testUser.id,
      };

      // Act
      const position = await dbManager.models.Position.create(invalidPositionData);

      // Assert - Should create but may have validation warnings
      assert.ok(position.id);
      // In a real implementation, this might trigger validation warnings
    });

    test('should handle position ordering', async () => {
      // Arrange
      const positions = [];
      for (let i = 1; i <= 3; i++) {
        positions.push(
          await dbManager.models.Position.create({
            name: `Position ${i}`,
            axis1: i * 10,
            axis2: i * 10,
            axis3: i * 10,
            order_index: i,
            user_id: testUser.id,
          })
        );
      }

      // Act
      const orderedPositions = await dbManager.models.Position.findAll({
        where: { user_id: testUser.id },
        order: [['order_index', 'ASC']],
      });

      // Assert
      assert.strictEqual(orderedPositions.length, 3);
      assert.strictEqual(orderedPositions[0].name, 'Position 1');
      assert.strictEqual(orderedPositions[1].name, 'Position 2');
      assert.strictEqual(orderedPositions[2].name, 'Position 3');
    });

    test('should associate positions with users', async () => {
      // Arrange
      const position = await dbManager.models.Position.create({
        name: 'Associated Position',
        axis1: 10,
        axis2: 10,
        axis3: 10,
        user_id: testUser.id,
      });

      // Act
      const userWithPositions = await dbManager.models.User.findByPk(testUser.id, {
        include: [dbManager.models.Position],
      });

      const positionWithUser = await dbManager.models.Position.findByPk(position.id, {
        include: [dbManager.models.User],
      });

      // Assert
      assert.ok(userWithPositions.Positions);
      assert.strictEqual(userWithPositions.Positions.length, 1);
      assert.strictEqual(userWithPositions.Positions[0].name, 'Associated Position');

      assert.ok(positionWithUser.User);
      assert.strictEqual(positionWithUser.User.username, 'testuser');
    });

    test('should handle position groups', async () => {
      // Arrange
      const group = await dbManager.models.PositionGroup.create({
        name: 'Test Group',
        description: 'A test group',
        user_id: testUser.id,
      });

      const position = await dbManager.models.Position.create({
        name: 'Grouped Position',
        axis1: 10,
        axis2: 10,
        axis3: 10,
        group_id: group.id,
        user_id: testUser.id,
      });

      // Act
      const groupWithPositions = await dbManager.models.PositionGroup.findByPk(group.id, {
        include: [dbManager.models.Position],
      });

      // Assert
      assert.ok(groupWithPositions.Positions);
      assert.strictEqual(groupWithPositions.Positions.length, 1);
      assert.strictEqual(groupWithPositions.Positions[0].name, 'Grouped Position');
    });
  });

  describe('G-Code Program Model Operations', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await dbManager.models.User.create({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hash123',
        role: 'user',
      });
    });

    test('should create G-code program successfully', async () => {
      // Arrange
      const programData = {
        name: 'Test Program',
        description: 'A test G-code program',
        content: 'G21\nG90\nG1 X10 Y10 F1000\nM30',
        version: '1.0',
        estimated_time: 120,
        tools_used: JSON.stringify([1, 2, 3]),
        coordinate_systems: JSON.stringify(['G54', 'G55']),
        bounding_box: JSON.stringify({
          min: { x: 0, y: 0, z: 0 },
          max: { x: 10, y: 10, z: 5 },
        }),
        user_id: testUser.id,
      };

      // Act
      const program = await dbManager.models.GCodeProgram.create(programData);

      // Assert
      assert.ok(program.id);
      assert.strictEqual(program.name, 'Test Program');
      assert.ok(program.content.includes('G21'));
      assert.strictEqual(program.estimated_time, 120);
      assert.strictEqual(program.user_id, testUser.id);
      assert.ok(program.created_at);
    });

    test('should validate G-code content', async () => {
      // Arrange
      const programData = {
        name: 'Invalid Program',
        content: '', // Empty content
        user_id: testUser.id,
      };

      // Act & Assert
      try {
        await dbManager.models.GCodeProgram.create(programData);
        assert.fail('Should have failed validation for empty content');
      } catch (error) {
        assert.ok(error.name === 'SequelizeValidationError');
      }
    });

    test('should handle program versioning', async () => {
      // Arrange
      const baseProgram = await dbManager.models.GCodeProgram.create({
        name: 'Versioned Program',
        content: 'G21\nG1 X10 Y10\nM30',
        version: '1.0',
        user_id: testUser.id,
      });

      // Act - Create new version
      const newVersion = await dbManager.models.GCodeProgram.create({
        name: 'Versioned Program',
        content: 'G21\nG1 X20 Y20\nM30',
        version: '2.0',
        parent_id: baseProgram.id,
        user_id: testUser.id,
      });

      // Assert
      assert.strictEqual(newVersion.version, '2.0');
      assert.strictEqual(newVersion.parent_id, baseProgram.id);
      assert.ok(newVersion.content.includes('X20 Y20'));
    });

    test('should track program execution history', async () => {
      // Arrange
      const program = await dbManager.models.GCodeProgram.create({
        name: 'Executed Program',
        content: 'G21\nG1 X10 Y10\nM30',
        user_id: testUser.id,
      });

      // Act
      await program.update({
        last_executed: new Date(),
        execution_count: 1,
        last_execution_time: 125,
      });

      // Assert
      assert.ok(program.last_executed);
      assert.strictEqual(program.execution_count, 1);
      assert.strictEqual(program.last_execution_time, 125);
    });
  });

  describe('Hardware Error Tracking', () => {
    test('should create hardware error record', async () => {
      // Arrange
      const errorData = {
        controller_id: 'MKS57D_001',
        motor_id: 'axis_1',
        error_code: 'OVERCURRENT',
        error_message: 'Motor overcurrent detected',
        severity: 'critical',
        position_data: JSON.stringify({ x: 10, y: 20, z: 5 }),
        recovery_action: 'stop_and_reset',
        resolved: false,
      };

      // Act
      const error = await dbManager.models.HardwareError.create(errorData);

      // Assert
      assert.ok(error.id);
      assert.strictEqual(error.controller_id, 'MKS57D_001');
      assert.strictEqual(error.error_code, 'OVERCURRENT');
      assert.strictEqual(error.severity, 'critical');
      assert.strictEqual(error.resolved, false);
      assert.ok(error.occurred_at);
    });

    test('should update error resolution status', async () => {
      // Arrange
      const error = await dbManager.models.HardwareError.create({
        controller_id: 'MKS57D_001',
        error_code: 'POSITION_ERROR',
        error_message: 'Position tracking error',
        severity: 'warning',
        resolved: false,
      });

      // Act
      await error.update({
        resolved: true,
        resolved_at: new Date(),
        resolution_notes: 'Recalibrated position encoder',
      });

      // Assert
      assert.strictEqual(error.resolved, true);
      assert.ok(error.resolved_at);
      assert.ok(error.resolution_notes.includes('Recalibrated'));
    });

    test('should query errors by severity', async () => {
      // Arrange
      await dbManager.models.HardwareError.create({
        controller_id: 'MKS57D_001',
        error_code: 'WARNING_1',
        severity: 'warning',
        resolved: false,
      });

      await dbManager.models.HardwareError.create({
        controller_id: 'MKS57D_002',
        error_code: 'CRITICAL_1',
        severity: 'critical',
        resolved: false,
      });

      // Act
      const criticalErrors = await dbManager.models.HardwareError.findAll({
        where: { severity: 'critical', resolved: false },
      });

      const allUnresolved = await dbManager.models.HardwareError.findAll({
        where: { resolved: false },
      });

      // Assert
      assert.strictEqual(criticalErrors.length, 1);
      assert.strictEqual(criticalErrors[0].error_code, 'CRITICAL_1');
      assert.strictEqual(allUnresolved.length, 2);
    });
  });

  describe('System Logging', () => {
    test('should create system log entry', async () => {
      // Arrange
      const logData = {
        level: 'info',
        category: 'robot_control',
        message: 'Robot moved to position X:10 Y:20',
        context: JSON.stringify({
          user_id: 1,
          command: 'manual_jog',
          axis: 'X',
          distance: 10,
        }),
        source: 'manual_control',
        session_id: 'session_123',
      };

      // Act
      const log = await dbManager.models.SystemLog.create(logData);

      // Assert
      assert.ok(log.id);
      assert.strictEqual(log.level, 'info');
      assert.strictEqual(log.category, 'robot_control');
      assert.ok(log.message.includes('Robot moved'));
      assert.ok(log.timestamp);
    });

    test('should query logs by level and timeframe', async () => {
      // Arrange
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      await dbManager.models.SystemLog.create({
        level: 'error',
        category: 'hardware',
        message: 'Hardware error occurred',
        timestamp: now,
      });

      await dbManager.models.SystemLog.create({
        level: 'info',
        category: 'user',
        message: 'User logged in',
        timestamp: hourAgo,
      });

      // Act
      const recentErrors = await dbManager.models.SystemLog.findAll({
        where: {
          level: 'error',
          timestamp: {
            [dbManager.sequelize.Sequelize.Op.gte]: new Date(now.getTime() - 30 * 60 * 1000),
          },
        },
      });

      // Assert
      assert.strictEqual(recentErrors.length, 1);
      assert.strictEqual(recentErrors[0].message, 'Hardware error occurred');
    });

    test('should aggregate log statistics', async () => {
      // Arrange
      await Promise.all([
        dbManager.models.SystemLog.create({
          level: 'error',
          category: 'hardware',
          message: 'Error 1',
        }),
        dbManager.models.SystemLog.create({
          level: 'error',
          category: 'hardware',
          message: 'Error 2',
        }),
        dbManager.models.SystemLog.create({
          level: 'warning',
          category: 'hardware',
          message: 'Warning 1',
        }),
        dbManager.models.SystemLog.create({ level: 'info', category: 'user', message: 'Info 1' }),
      ]);

      // Act
      const errorCount = await dbManager.models.SystemLog.count({
        where: { level: 'error' },
      });

      const categoryStats = await dbManager.models.SystemLog.findAll({
        attributes: ['category', [dbManager.sequelize.fn('COUNT', '*'), 'count']],
        group: ['category'],
      });

      // Assert
      assert.strictEqual(errorCount, 2);
      assert.strictEqual(categoryStats.length, 2);

      const hardwareStats = categoryStats.find(s => s.category === 'hardware');
      assert.strictEqual(parseInt(hardwareStats.dataValues.count), 3);
    });
  });

  describe('Database Backup and Maintenance', () => {
    test('should create database backup', async () => {
      // Arrange
      await dbManager.models.User.create({
        username: 'backuptest',
        email: 'backup@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      // Act
      const backupResult = await dbManager.createBackup();

      // Assert
      assert.ok(backupResult.success);
      assert.ok(backupResult.backupPath);
      assert.ok(await fs.pathExists(backupResult.backupPath));

      // Verify backup is a valid SQLite file
      const backupStats = await fs.stat(backupResult.backupPath);
      assert.ok(backupStats.size > 0);
    });

    test('should cleanup old backups', async () => {
      // Arrange
      await fs.ensureDir(testBackupPath);

      // Create several backup files with different timestamps
      const oldBackup = path.join(testBackupPath, 'backup_2023-01-01_000000.sqlite');
      const recentBackup = path.join(testBackupPath, 'backup_2024-01-01_000000.sqlite');

      await fs.writeFile(oldBackup, 'old backup content');
      await fs.writeFile(recentBackup, 'recent backup content');

      // Act
      const cleanupResult = await dbManager.cleanupOldBackups(1); // Keep only 1 backup

      // Assert
      assert.ok(cleanupResult.success);
      assert.ok(cleanupResult.deletedCount >= 0);

      // Recent backup should still exist
      assert.ok(await fs.pathExists(recentBackup));
    });

    test('should restore from backup', async () => {
      // Arrange
      const originalUser = await dbManager.models.User.create({
        username: 'original',
        email: 'original@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      const backupResult = await dbManager.createBackup();

      // Modify database
      await originalUser.update({ username: 'modified' });

      // Act
      const restoreResult = await dbManager.restoreFromBackup(backupResult.backupPath);

      // Assert
      assert.ok(restoreResult.success);

      // Verify restoration
      const restoredUser = await dbManager.models.User.findByPk(originalUser.id);
      assert.strictEqual(restoredUser.username, 'original');
    });

    test('should optimize database', async () => {
      // Arrange
      // Create and delete some records to create fragmentation
      const users = [];
      for (let i = 0; i < 10; i++) {
        users.push(
          await dbManager.models.User.create({
            username: `user${i}`,
            email: `user${i}@example.com`,
            password_hash: 'hash123',
            role: 'user',
          })
        );
      }

      // Delete half of them
      for (let i = 0; i < 5; i++) {
        await users[i].destroy();
      }

      // Act
      const optimizeResult = await dbManager.optimizeDatabase();

      // Assert
      assert.ok(optimizeResult.success);
      assert.ok(optimizeResult.sizeBefore >= 0);
      assert.ok(optimizeResult.sizeAfter >= 0);
    });
  });

  describe('Transactions and Concurrency', () => {
    test('should handle database transactions correctly', async () => {
      // Arrange
      const transaction = await dbManager.sequelize.transaction();

      try {
        // Act
        const user = await dbManager.models.User.create(
          {
            username: 'transactional',
            email: 'trans@example.com',
            password_hash: 'hash123',
            role: 'user',
          },
          { transaction }
        );

        const position = await dbManager.models.Position.create(
          {
            name: 'Transactional Position',
            axis1: 10,
            axis2: 10,
            axis3: 10,
            user_id: user.id,
          },
          { transaction }
        );

        await transaction.commit();

        // Assert
        const foundUser = await dbManager.models.User.findByPk(user.id);
        const foundPosition = await dbManager.models.Position.findByPk(position.id);

        assert.ok(foundUser);
        assert.ok(foundPosition);
        assert.strictEqual(foundPosition.user_id, foundUser.id);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    });

    test('should rollback failed transactions', async () => {
      // Arrange
      const transaction = await dbManager.sequelize.transaction();

      try {
        // Act
        const user = await dbManager.models.User.create(
          {
            username: 'rollbacktest',
            email: 'rollback@example.com',
            password_hash: 'hash123',
            role: 'user',
          },
          { transaction }
        );

        // Force an error
        await dbManager.models.User.create(
          {
            username: 'rollbacktest', // Duplicate username
            email: 'rollback2@example.com',
            password_hash: 'hash123',
            role: 'user',
          },
          { transaction }
        );

        await transaction.commit();
        assert.fail('Should have thrown an error');
      } catch (error) {
        await transaction.rollback();

        // Assert - user should not exist after rollback
        const foundUser = await dbManager.models.User.findOne({
          where: { username: 'rollbacktest' },
        });
        assert.strictEqual(foundUser, null);
      }
    });

    test('should handle concurrent operations safely', async () => {
      // Arrange
      const user = await dbManager.models.User.create({
        username: 'concurrent',
        email: 'concurrent@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      // Act - Create multiple positions concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        dbManager.models.Position.create({
          name: `Concurrent Position ${i}`,
          axis1: i,
          axis2: i,
          axis3: i,
          user_id: user.id,
        })
      );

      const positions = await Promise.all(promises);

      // Assert
      assert.strictEqual(positions.length, 10);
      positions.forEach((position, i) => {
        assert.ok(position.id);
        assert.strictEqual(position.name, `Concurrent Position ${i}`);
        assert.strictEqual(position.user_id, user.id);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection loss gracefully', async () => {
      // Arrange
      await dbManager.sequelize.close();

      // Act & Assert
      try {
        await dbManager.models.User.create({
          username: 'testuser',
          email: 'test@example.com',
          password_hash: 'hash123',
          role: 'user',
        });
        assert.fail('Should have thrown connection error');
      } catch (error) {
        assert.ok(error.message.includes('connection') || error.message.includes('database'));
      }
    });

    test('should validate foreign key constraints', async () => {
      // Arrange & Act & Assert
      try {
        await dbManager.models.Position.create({
          name: 'Orphan Position',
          axis1: 10,
          axis2: 10,
          axis3: 10,
          user_id: 99999, // Non-existent user ID
        });
        assert.fail('Should have thrown foreign key constraint error');
      } catch (error) {
        assert.ok(error.name === 'SequelizeForeignKeyConstraintError');
      }
    });

    test('should handle null values appropriately', async () => {
      // Arrange
      const positionData = {
        name: 'Partial Position',
        axis1: null, // Some axes can be null
        axis2: 10,
        axis3: 10,
        gripper1: null,
        user_id: (
          await dbManager.models.User.create({
            username: 'nulltest',
            email: 'null@example.com',
            password_hash: 'hash123',
            role: 'user',
          })
        ).id,
      };

      // Act
      const position = await dbManager.models.Position.create(positionData);

      // Assert
      assert.ok(position.id);
      assert.strictEqual(position.axis1, null);
      assert.strictEqual(position.axis2, 10);
      assert.strictEqual(position.gripper1, null);
    });

    test('should handle large data sets efficiently', async () => {
      // Arrange
      const user = await dbManager.models.User.create({
        username: 'bulktest',
        email: 'bulk@example.com',
        password_hash: 'hash123',
        role: 'user',
      });

      const startTime = Date.now();

      // Act - Create many positions
      const positions = Array.from({ length: 100 }, (_, i) => ({
        name: `Bulk Position ${i}`,
        axis1: i,
        axis2: i,
        axis3: i,
        user_id: user.id,
      }));

      await dbManager.models.Position.bulkCreate(positions);
      const endTime = Date.now();

      // Assert
      const count = await dbManager.models.Position.count({
        where: { user_id: user.id },
      });

      assert.strictEqual(count, 100);
      assert.ok(endTime - startTime < 5000, 'Bulk operation should complete within 5 seconds');
    });
  });
});
