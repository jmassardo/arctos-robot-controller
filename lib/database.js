const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs-extra');
const bcrypt = require('bcryptjs');
const { logger } = require('./logger');

// Database configuration
const DB_PATH = path.join(__dirname, '../data/database.sqlite');
const DB_BACKUP_PATH = path.join(__dirname, '../data/backups');

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: DB_PATH,
  logging: (msg) => logger.database(msg),
  define: {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Define Models
// =============

// User model with authentication and roles
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 30],
      is: /^[a-zA-Z0-9_-]+$/
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'operator', 'viewer'),
    defaultValue: 'viewer',
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true
  },
  two_factor_secret: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  two_factor_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  backup_codes: {
    type: DataTypes.JSON,
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSON,
    defaultValue: {
      theme: 'light',
      language: 'en',
      notifications: true
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'users',
  indexes: [
    { fields: ['username'] },
    { fields: ['email'] },
    { fields: ['role'] },
    { fields: ['is_active'] }
  ]
});

// Robot Configuration model
const RobotConfig = sequelize.define('RobotConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  robot_type: {
    type: DataTypes.ENUM('MKS57D', 'MKS42D', 'custom'),
    defaultValue: 'MKS57D'
  },
  communication_protocol: {
    type: DataTypes.ENUM('serial', 'can', 'rs485', 'tcp'),
    defaultValue: 'serial'
  },
  connection_settings: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  axis_configuration: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  manipulator_configuration: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  safety_limits: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'robot_configs',
  indexes: [
    { fields: ['name'] },
    { fields: ['robot_type'] },
    { fields: ['is_active'] },
    { fields: ['created_by'] }
  ]
});

// Saved Positions model
const Position = sequelize.define('Position', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  axes: {
    type: DataTypes.JSON,
    allowNull: false
  },
  manipulators: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'position_groups',
      key: 'id'
    }
  },
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_favorite: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  robot_config_id: {
    type: DataTypes.UUID,
    references: {
      model: RobotConfig,
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'positions',
  indexes: [
    { fields: ['name'] },
    { fields: ['group_id'] },
    { fields: ['order_index'] },
    { fields: ['is_favorite'] },
    { fields: ['created_by'] },
    { fields: ['robot_config_id'] }
  ]
});

// Position Groups model
const PositionGroup = sequelize.define('PositionGroup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#3498db',
    validate: {
      is: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    }
  },
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'position_groups',
  indexes: [
    { fields: ['name'] },
    { fields: ['order_index'] },
    { fields: ['created_by'] }
  ]
});

// G-code Programs model
const GCodeProgram = sequelize.define('GCodeProgram', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  line_count: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  is_valid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  validation_errors: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  validation_warnings: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  parse_metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  execution_stats: {
    type: DataTypes.JSON,
    defaultValue: {
      total_executions: 0,
      successful_executions: 0,
      failed_executions: 0,
      total_execution_time: 0,
      average_execution_time: 0
    }
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  robot_config_id: {
    type: DataTypes.UUID,
    references: {
      model: RobotConfig,
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'gcode_programs',
  indexes: [
    { fields: ['name'] },
    { fields: ['is_valid'] },
    { fields: ['created_by'] },
    { fields: ['robot_config_id'] }
  ]
});

// Execution History model
const ExecutionHistory = sequelize.define('ExecutionHistory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  execution_type: {
    type: DataTypes.ENUM('gcode', 'position_replay', 'manual_command'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('started', 'completed', 'failed', 'stopped', 'paused'),
    allowNull: false
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  progress: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  lines_executed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_lines: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  error_line: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  execution_data: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  user_id: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  gcode_program_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: GCodeProgram,
      key: 'id'
    }
  },
  robot_config_id: {
    type: DataTypes.UUID,
    references: {
      model: RobotConfig,
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'execution_history',
  indexes: [
    { fields: ['execution_type'] },
    { fields: ['status'] },
    { fields: ['started_at'] },
    { fields: ['user_id'] },
    { fields: ['gcode_program_id'] },
    { fields: ['robot_config_id'] }
  ]
});

// Audit Log model
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  resource_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  resource_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  session_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: User,
      key: 'id'
    }
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    { fields: ['action'] },
    { fields: ['resource_type'] },
    { fields: ['timestamp'] },
    { fields: ['user_id'] },
    { fields: ['ip_address'] }
  ]
});

// Define Associations
// ===================

// User associations
User.hasMany(RobotConfig, { foreignKey: 'created_by', as: 'robotConfigs' });
User.hasMany(Position, { foreignKey: 'created_by', as: 'positions' });
User.hasMany(PositionGroup, { foreignKey: 'created_by', as: 'positionGroups' });
User.hasMany(GCodeProgram, { foreignKey: 'created_by', as: 'gcodePrograms' });
User.hasMany(ExecutionHistory, { foreignKey: 'user_id', as: 'executionHistory' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });

// RobotConfig associations
RobotConfig.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
RobotConfig.hasMany(Position, { foreignKey: 'robot_config_id', as: 'positions' });
RobotConfig.hasMany(GCodeProgram, { foreignKey: 'robot_config_id', as: 'gcodePrograms' });
RobotConfig.hasMany(ExecutionHistory, { foreignKey: 'robot_config_id', as: 'executionHistory' });

// Position associations
Position.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Position.belongsTo(RobotConfig, { foreignKey: 'robot_config_id', as: 'robotConfig' });
Position.belongsTo(PositionGroup, { foreignKey: 'group_id', as: 'group' });

// PositionGroup associations
PositionGroup.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
PositionGroup.hasMany(Position, { foreignKey: 'group_id', as: 'positions' });

// GCodeProgram associations
GCodeProgram.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
GCodeProgram.belongsTo(RobotConfig, { foreignKey: 'robot_config_id', as: 'robotConfig' });
GCodeProgram.hasMany(ExecutionHistory, { foreignKey: 'gcode_program_id', as: 'executionHistory' });

// ExecutionHistory associations
ExecutionHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ExecutionHistory.belongsTo(GCodeProgram, { foreignKey: 'gcode_program_id', as: 'gcodeProgram' });
ExecutionHistory.belongsTo(RobotConfig, { foreignKey: 'robot_config_id', as: 'robotConfig' });

// AuditLog associations
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Database Management Class
// =========================

class DatabaseManager {
  constructor() {
    this.sequelize = sequelize;
    this.models = {
      User,
      RobotConfig,
      Position,
      PositionGroup,
      GCodeProgram,
      ExecutionHistory,
      AuditLog
    };
  }

  /**
   * Initialize database connection and sync models
   */
  async initialize() {
    try {
      // Ensure data directory exists
      await fs.ensureDir(path.dirname(DB_PATH));
      await fs.ensureDir(DB_BACKUP_PATH);

      // Test connection
      await sequelize.authenticate();
      logger.info('Database connection established successfully');

      // Sync models (create tables if they don't exist)
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');

      // Create default admin user if none exists
      await this.createDefaultAdmin();

      return true;
    } catch (error) {
      logger.error('Failed to initialize database', { error: error.message });
      throw error;
    }
  }

  /**
   * Create default admin user
   */
  async createDefaultAdmin() {
    try {
      const adminCount = await User.count({ where: { role: 'admin' } });
      
      if (adminCount === 0) {
        const hashedPassword = await bcrypt.hash('admin123!', 12);
        
        await User.create({
          username: 'admin',
          email: 'admin@example.com',
          password_hash: hashedPassword,
          role: 'admin',
          is_active: true,
          metadata: {
            created_by: 'system',
            initial_setup: true
          }
        });
        
        logger.info('Default admin user created', {
          username: 'admin',
          email: 'admin@example.com'
        });
      }
    } catch (error) {
      logger.error('Failed to create default admin user', { error: error.message });
    }
  }

  /**
   * Create database backup
   */
  async createBackup(name = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = name || `backup-${timestamp}.sqlite`;
      const backupPath = path.join(DB_BACKUP_PATH, backupName);

      await fs.copy(DB_PATH, backupPath);
      
      logger.info('Database backup created', { 
        backupPath,
        size: (await fs.stat(backupPath)).size 
      });
      
      return backupPath;
    } catch (error) {
      logger.error('Failed to create database backup', { error: error.message });
      throw error;
    }
  }

  /**
   * Restore database from backup
   */
  async restoreBackup(backupPath) {
    try {
      if (!await fs.pathExists(backupPath)) {
        throw new Error('Backup file not found');
      }

      // Close current connection
      await sequelize.close();

      // Copy backup to current database
      await fs.copy(backupPath, DB_PATH);

      // Reconnect
      await sequelize.authenticate();
      
      logger.info('Database restored from backup', { backupPath });
      
      return true;
    } catch (error) {
      logger.error('Failed to restore database backup', { 
        error: error.message,
        backupPath 
      });
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics() {
    try {
      const stats = {
        users: await User.count(),
        robotConfigs: await RobotConfig.count(),
        positions: await Position.count(),
        positionGroups: await PositionGroup.count(),
        gcodePrograms: await GCodeProgram.count(),
        executionHistory: await ExecutionHistory.count(),
        auditLogs: await AuditLog.count(),
        databaseSize: 0
      };

      // Get database file size
      if (await fs.pathExists(DB_PATH)) {
        const stat = await fs.stat(DB_PATH);
        stats.databaseSize = stat.size;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get database statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean up old records
   */
  async cleanup(options = {}) {
    const {
      auditLogDays = 90,
      executionHistoryDays = 365,
      inactiveUserDays = 730
    } = options;

    try {
      const now = new Date();
      let cleanedCount = 0;

      // Clean old audit logs
      if (auditLogDays > 0) {
        const auditCutoff = new Date(now.getTime() - (auditLogDays * 24 * 60 * 60 * 1000));
        const auditDeleted = await AuditLog.destroy({
          where: { timestamp: { [sequelize.Op.lt]: auditCutoff } }
        });
        cleanedCount += auditDeleted;
        logger.info(`Cleaned ${auditDeleted} old audit log entries`);
      }

      // Clean old execution history
      if (executionHistoryDays > 0) {
        const execCutoff = new Date(now.getTime() - (executionHistoryDays * 24 * 60 * 60 * 1000));
        const execDeleted = await ExecutionHistory.destroy({
          where: { started_at: { [sequelize.Op.lt]: execCutoff } }
        });
        cleanedCount += execDeleted;
        logger.info(`Cleaned ${execDeleted} old execution history entries`);
      }

      // Clean inactive users (but keep admins)
      if (inactiveUserDays > 0) {
        const userCutoff = new Date(now.getTime() - (inactiveUserDays * 24 * 60 * 60 * 1000));
        const userDeleted = await User.destroy({
          where: {
            last_login_at: { [sequelize.Op.lt]: userCutoff },
            role: { [sequelize.Op.ne]: 'admin' },
            is_active: false
          }
        });
        cleanedCount += userDeleted;
        logger.info(`Cleaned ${userDeleted} inactive users`);
      }

      logger.info(`Database cleanup completed: ${cleanedCount} records removed`);
      return cleanedCount;
    } catch (error) {
      logger.error('Database cleanup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    try {
      await sequelize.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Failed to close database connection', { error: error.message });
    }
  }
}

// Export everything
module.exports = {
  sequelize,
  DatabaseManager,
  models: {
    User,
    RobotConfig,
    Position,
    PositionGroup,
    GCodeProgram,
    ExecutionHistory,
    AuditLog
  }
};