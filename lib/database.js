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
  logging: msg => logger.database(msg),
  define: {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Define Models
// =============

// Hardware Error Models
// ====================

// Hardware errors tracking table
const HardwareError = sequelize.define(
  'HardwareError',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    controller_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'controller_id',
    },
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'motor_id',
    },
    error_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'error_code',
    },
    error_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'error_type',
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical', 'fatal'),
      allowNull: false,
      defaultValue: 'info',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    first_occurrence: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'first_occurrence',
    },
    last_occurrence: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'last_occurrence',
    },
    occurrence_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'occurrence_count',
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    resolution_method: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_method',
    },
    resolved_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'resolved_by',
    },
  },
  {
    tableName: 'hardware_errors',
    indexes: [
      {
        fields: ['controller_id', 'error_code'],
      },
      {
        fields: ['first_occurrence'],
      },
      {
        fields: ['severity'],
      },
    ],
  }
);

// Error code definitions table
const ErrorCodeDefinition = sequelize.define(
  'ErrorCodeDefinition',
  {
    controller_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true,
      field: 'controller_type',
    },
    error_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      primaryKey: true,
      field: 'error_code',
    },
    error_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'error_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical', 'fatal'),
      allowNull: false,
    },
    causes: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON array of possible causes',
    },
    solutions: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON array of solutions',
    },
    recovery_procedure: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'recovery_procedure',
    },
    documentation_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'documentation_url',
    },
  },
  {
    tableName: 'error_code_definitions',
    timestamps: false,
  }
);

// Error recovery log table
const ErrorRecoveryLog = sequelize.define(
  'ErrorRecoveryLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    error_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: HardwareError,
        key: 'id',
      },
      field: 'error_id',
    },
    recovery_method: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'recovery_method',
    },
    recovery_success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'recovery_success',
    },
    recovery_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'recovery_time_ms',
    },
    recovery_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'recovery_notes',
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'error_recovery_log',
    timestamps: false,
  }
);

// Define associations
HardwareError.hasMany(ErrorRecoveryLog, { foreignKey: 'error_id' });
ErrorRecoveryLog.belongsTo(HardwareError, { foreignKey: 'error_id' });

// User model with authentication and roles
const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 30],
        is: /^[a-zA-Z0-9_-]+$/,
      },
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('admin', 'operator', 'viewer'),
      defaultValue: 'viewer',
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    login_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    two_factor_secret: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    backup_codes: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    preferences: {
      type: DataTypes.JSON,
      defaultValue: {
        theme: 'light',
        language: 'en',
        notifications: true,
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'users',
    indexes: [
      { fields: ['username'] },
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
    ],
  }
);

// Robot Configuration model
const RobotConfig = sequelize.define(
  'RobotConfig',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    robot_type: {
      type: DataTypes.ENUM('MKS57D', 'MKS42D', 'custom'),
      defaultValue: 'MKS57D',
    },
    communication_protocol: {
      type: DataTypes.ENUM('serial', 'can', 'rs485', 'tcp'),
      defaultValue: 'serial',
    },
    connection_settings: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    axis_configuration: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    manipulator_configuration: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    safety_limits: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'robot_configs',
    indexes: [
      { fields: ['name'] },
      { fields: ['robot_type'] },
      { fields: ['is_active'] },
      { fields: ['created_by'] },
    ],
  }
);

// Saved Positions model
const Position = sequelize.define(
  'Position',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    axes: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    manipulators: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'position_groups',
        key: 'id',
      },
    },
    order_index: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_favorite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    created_by: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: 'id',
      },
    },
    robot_config_id: {
      type: DataTypes.UUID,
      references: {
        model: RobotConfig,
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'positions',
    indexes: [
      { fields: ['name'] },
      { fields: ['group_id'] },
      { fields: ['order_index'] },
      { fields: ['is_favorite'] },
      { fields: ['created_by'] },
      { fields: ['robot_config_id'] },
    ],
  }
);

// Position Groups model
const PositionGroup = sequelize.define(
  'PositionGroup',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(7),
      defaultValue: '#3498db',
      validate: {
        is: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
      },
    },
    order_index: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    created_by: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'position_groups',
    indexes: [{ fields: ['name'] }, { fields: ['order_index'] }, { fields: ['created_by'] }],
  }
);

// G-code Programs model
const GCodeProgram = sequelize.define(
  'GCodeProgram',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    file_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    line_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    is_valid: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    validation_errors: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    validation_warnings: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    parse_metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    execution_stats: {
      type: DataTypes.JSON,
      defaultValue: {
        total_executions: 0,
        successful_executions: 0,
        failed_executions: 0,
        total_execution_time: 0,
        average_execution_time: 0,
      },
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    created_by: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: 'id',
      },
    },
    robot_config_id: {
      type: DataTypes.UUID,
      references: {
        model: RobotConfig,
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'gcode_programs',
    indexes: [
      { fields: ['name'] },
      { fields: ['is_valid'] },
      { fields: ['created_by'] },
      { fields: ['robot_config_id'] },
    ],
  }
);

// Execution History model
const ExecutionHistory = sequelize.define(
  'ExecutionHistory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    execution_type: {
      type: DataTypes.ENUM('gcode', 'position_replay', 'manual_command'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('started', 'completed', 'failed', 'stopped', 'paused'),
      allowNull: false,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    progress: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    lines_executed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    total_lines: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    error_line: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    execution_data: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    user_id: {
      type: DataTypes.UUID,
      references: {
        model: User,
        key: 'id',
      },
    },
    gcode_program_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: GCodeProgram,
        key: 'id',
      },
    },
    robot_config_id: {
      type: DataTypes.UUID,
      references: {
        model: RobotConfig,
        key: 'id',
      },
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'execution_history',
    indexes: [
      { fields: ['execution_type'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
      { fields: ['user_id'] },
      { fields: ['gcode_program_id'] },
      { fields: ['robot_config_id'] },
    ],
  }
);

// Audit Log model
const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    resource_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    resource_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    details: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'audit_logs',
    timestamps: false,
    indexes: [
      { fields: ['action'] },
      { fields: ['resource_type'] },
      { fields: ['timestamp'] },
      { fields: ['user_id'] },
      { fields: ['ip_address'] },
    ],
  }
);

// Macro model
const Macro = sequelize.define(
  'Macro',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        len: [1, 100],
        is: /^[A-Za-z0-9_]+$/,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    parameters: {
      type: DataTypes.JSON,
      defaultValue: [],
      validate: {
        isValidParameters(value) {
          if (!Array.isArray(value)) {
            throw new Error('Parameters must be an array');
          }
        },
      },
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    is_builtin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    category: {
      type: DataTypes.STRING(50),
      defaultValue: 'custom',
    },
    version: {
      type: DataTypes.STRING(20),
      defaultValue: '1.0',
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    usage_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'macros',
    indexes: [
      { fields: ['name'] },
      { fields: ['category'] },
      { fields: ['is_builtin'] },
      { fields: ['created_by'] },
      { fields: ['usage_count'] },
    ],
  }
);

// Macro Library model - for organizing macros into categories
const MacroCategory = sequelize.define(
  'MacroCategory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(50),
      defaultValue: 'folder',
    },
    color: {
      type: DataTypes.STRING(7),
      defaultValue: '#3498db',
      validate: {
        is: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
      },
    },
    order_index: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_builtin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
  },
  {
    tableName: 'macro_categories',
    indexes: [{ fields: ['name'] }, { fields: ['order_index'] }, { fields: ['is_builtin'] }],
  }
);

// Macro Execution History model
const MacroExecutionHistory = sequelize.define(
  'MacroExecutionHistory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    macro_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Macro,
        key: 'id',
      },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    parameters_used: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    execution_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('success', 'error', 'cancelled'),
      allowNull: false,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lines_processed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    variables_final: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    executed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'macro_execution_history',
    timestamps: false,
    indexes: [
      { fields: ['macro_id'] },
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['executed_at'] },
    ],
  }
);

// Temperature Readings model
const TemperatureReading = sequelize.define(
  'TemperatureReading',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    temperature: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: {
        min: -50,
        max: 200,
      },
    },
    temp_type: {
      type: DataTypes.ENUM('motor', 'driver', 'ambient'),
      allowNull: false,
      defaultValue: 'motor',
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    alert_level: {
      type: DataTypes.ENUM('normal', 'warning', 'critical', 'emergency'),
      allowNull: false,
      defaultValue: 'normal',
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    tableName: 'temperature_readings',
    timestamps: false,
    indexes: [
      { fields: ['motor_id'] },
      { fields: ['timestamp'] },
      { fields: ['motor_id', 'timestamp'] },
      { fields: ['alert_level'] },
      { fields: ['temp_type'] },
    ],
  }
);

// Temperature Thresholds model
const TemperatureThreshold = sequelize.define(
  'TemperatureThreshold',
  {
    motor_id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    warning_temp: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 60.0,
      validate: {
        min: 0,
        max: 200,
      },
    },
    critical_temp: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 75.0,
      validate: {
        min: 0,
        max: 200,
      },
    },
    emergency_temp: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 85.0,
      validate: {
        min: 0,
        max: 200,
      },
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
  },
  {
    tableName: 'temperature_thresholds',
    timestamps: false,
    indexes: [{ fields: ['motor_id'] }, { fields: ['created_by'] }, { fields: ['updated_at'] }],
  }
);

// Define Associations
// ===================

// User associations
User.hasMany(RobotConfig, { foreignKey: 'created_by', as: 'robotConfigs' });
User.hasMany(Position, { foreignKey: 'created_by', as: 'positions' });
User.hasMany(PositionGroup, { foreignKey: 'created_by', as: 'positionGroups' });
User.hasMany(GCodeProgram, { foreignKey: 'created_by', as: 'gcodePrograms' });
User.hasMany(ExecutionHistory, { foreignKey: 'user_id', as: 'executionHistory' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
User.hasMany(Macro, { foreignKey: 'created_by', as: 'macros' });
User.hasMany(MacroCategory, { foreignKey: 'created_by', as: 'macroCategories' });
User.hasMany(MacroExecutionHistory, { foreignKey: 'user_id', as: 'macroExecutionHistory' });

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

// Macro associations
Macro.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Macro.hasMany(MacroExecutionHistory, { foreignKey: 'macro_id', as: 'executionHistory' });

// MacroCategory associations
MacroCategory.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// MacroExecutionHistory associations
MacroExecutionHistory.belongsTo(Macro, { foreignKey: 'macro_id', as: 'macro' });
MacroExecutionHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// TemperatureThreshold associations
TemperatureThreshold.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// User associations for temperature
User.hasMany(TemperatureThreshold, { foreignKey: 'created_by', as: 'temperatureThresholds' });

// Torque and Load Monitoring Models
// ================================

// TorqueReading model - stores real-time torque measurements
const TorqueReading = sequelize.define(
  'TorqueReading',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 50],
      },
    },
    torque_nm: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      comment: 'Torque in Newton-meters',
    },
    load_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: {
        min: 0,
        max: 200,
      },
      comment: 'Load as % of rated torque',
    },
    motor_current: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: true,
      comment: 'Motor current in Amperes',
    },
    motor_speed: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Motor speed in RPM',
    },
    position: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: true,
      comment: 'Motor position',
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'torque_readings',
    timestamps: false,
    indexes: [
      { fields: ['motor_id', 'timestamp'] },
      { fields: ['motor_id'] },
      { fields: ['timestamp'] },
      { fields: ['load_percentage'] },
    ],
  }
);

// LoadEvent model - stores load-related events (overloads, stalls, etc.)
const LoadEvent = sequelize.define(
  'LoadEvent',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 50],
      },
    },
    event_type: {
      type: DataTypes.ENUM('overload', 'stall', 'slip', 'undervoltage', 'overcurrent', 'thermal'),
      allowNull: false,
    },
    peak_torque: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'Peak torque during event (Nm)',
    },
    duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Event duration in milliseconds',
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'medium',
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'load_events',
    timestamps: false,
    indexes: [
      { fields: ['motor_id', 'timestamp'] },
      { fields: ['event_type'] },
      { fields: ['severity'] },
      { fields: ['resolved_at'] },
    ],
  }
);

// MotorSpecification model - stores motor specifications for torque calculations
const MotorSpecification = sequelize.define(
  'MotorSpecification',
  {
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true,
      validate: {
        notEmpty: true,
        len: [1, 50],
      },
    },
    motor_model: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    rated_torque_nm: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      validate: {
        min: 0.001,
      },
      comment: 'Rated continuous torque (Nm)',
    },
    max_continuous_torque: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'Maximum continuous torque (Nm)',
    },
    peak_torque_nm: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
      comment: 'Peak torque capability (Nm)',
    },
    torque_constant: {
      type: DataTypes.DECIMAL(8, 5),
      allowNull: false,
      comment: 'Torque constant (Nm/A)',
    },
    inertia: {
      type: DataTypes.DECIMAL(12, 8),
      allowNull: true,
      comment: 'Rotor inertia (kg⋅m²)',
    },
    efficiency: {
      type: DataTypes.DECIMAL(5, 3),
      allowNull: false,
      defaultValue: 0.85,
      validate: {
        min: 0.1,
        max: 1.0,
      },
    },
    warning_level: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 80.0,
      comment: 'Warning threshold (% of rated torque)',
    },
    critical_level: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 95.0,
      comment: 'Critical threshold (% of rated torque)',
    },
    emergency_level: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 110.0,
      comment: 'Emergency stop threshold (% of rated torque)',
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
  },
  {
    tableName: 'motor_specifications',
    timestamps: false,
    indexes: [{ fields: ['motor_id'] }, { fields: ['created_by'] }, { fields: ['updated_at'] }],
  }
);

// TorqueCalibration model - stores calibration data for torque sensors
const TorqueCalibration = sequelize.define(
  'TorqueCalibration',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    motor_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 50],
      },
    },
    calibration_type: {
      type: DataTypes.ENUM('zero_offset', 'known_load', 'multi_point'),
      allowNull: false,
    },
    reference_torque: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      comment: 'Reference/known torque value (Nm)',
    },
    measured_current: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      comment: 'Measured current at reference torque (A)',
    },
    calculated_constant: {
      type: DataTypes.DECIMAL(8, 5),
      allowNull: false,
      comment: 'Calculated torque constant (Nm/A)',
    },
    calibration_error: {
      type: DataTypes.DECIMAL(5, 3),
      allowNull: true,
      comment: 'Calibration error percentage',
    },
    environmental_conditions: {
      type: DataTypes.JSON,
      defaultValue: {},
      comment: 'Temperature, humidity, etc. during calibration',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: 'id',
      },
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'torque_calibrations',
    timestamps: false,
    indexes: [
      { fields: ['motor_id', 'timestamp'] },
      { fields: ['calibration_type'] },
      { fields: ['is_active'] },
      { fields: ['created_by'] },
    ],
  }
);

// Torque and Load Model Associations
// =================================

// MotorSpecification associations
MotorSpecification.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
MotorSpecification.hasMany(TorqueReading, {
  foreignKey: 'motor_id',
  sourceKey: 'motor_id',
  as: 'torqueReadings',
});
MotorSpecification.hasMany(LoadEvent, {
  foreignKey: 'motor_id',
  sourceKey: 'motor_id',
  as: 'loadEvents',
});
MotorSpecification.hasMany(TorqueCalibration, {
  foreignKey: 'motor_id',
  sourceKey: 'motor_id',
  as: 'calibrations',
});

// TorqueReading associations
TorqueReading.belongsTo(MotorSpecification, {
  foreignKey: 'motor_id',
  targetKey: 'motor_id',
  as: 'motorSpec',
});

// LoadEvent associations
LoadEvent.belongsTo(MotorSpecification, {
  foreignKey: 'motor_id',
  targetKey: 'motor_id',
  as: 'motorSpec',
});

// TorqueCalibration associations
TorqueCalibration.belongsTo(MotorSpecification, {
  foreignKey: 'motor_id',
  targetKey: 'motor_id',
  as: 'motorSpec',
});
TorqueCalibration.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// User associations for torque monitoring
User.hasMany(MotorSpecification, { foreignKey: 'created_by', as: 'motorSpecifications' });
User.hasMany(TorqueCalibration, { foreignKey: 'created_by', as: 'torqueCalibrations' });

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
      AuditLog,
      Macro,
      MacroCategory,
      MacroExecutionHistory,
      TemperatureReading,
      TemperatureThreshold,
      TorqueReading,
      LoadEvent,
      MotorSpecification,
      TorqueCalibration,
      HardwareError,
      ErrorCodeDefinition,
      ErrorRecoveryLog,
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
            initial_setup: true,
          },
        });

        logger.info('Default admin user created', {
          username: 'admin',
          email: 'admin@example.com',
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
        size: (await fs.stat(backupPath)).size,
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
      if (!(await fs.pathExists(backupPath))) {
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
        backupPath,
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
        macros: await Macro.count(),
        macroCategories: await MacroCategory.count(),
        macroExecutionHistory: await MacroExecutionHistory.count(),
        torqueReadings: await TorqueReading.count(),
        loadEvents: await LoadEvent.count(),
        motorSpecifications: await MotorSpecification.count(),
        torqueCalibrations: await TorqueCalibration.count(),
        databaseSize: 0,
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
      inactiveUserDays = 730,
      torqueReadingDays = 30, // Keep torque readings for 30 days by default
      resolvedLoadEventDays = 90, // Keep resolved load events for 90 days
    } = options;

    try {
      const now = new Date();
      let cleanedCount = 0;

      // Clean old audit logs
      if (auditLogDays > 0) {
        const auditCutoff = new Date(now.getTime() - auditLogDays * 24 * 60 * 60 * 1000);
        const auditDeleted = await AuditLog.destroy({
          where: { timestamp: { [sequelize.Op.lt]: auditCutoff } },
        });
        cleanedCount += auditDeleted;
        logger.info(`Cleaned ${auditDeleted} old audit log entries`);
      }

      // Clean old execution history
      if (executionHistoryDays > 0) {
        const execCutoff = new Date(now.getTime() - executionHistoryDays * 24 * 60 * 60 * 1000);
        const execDeleted = await ExecutionHistory.destroy({
          where: { started_at: { [sequelize.Op.lt]: execCutoff } },
        });
        cleanedCount += execDeleted;
        logger.info(`Cleaned ${execDeleted} old execution history entries`);
      }

      // Clean old torque readings
      if (torqueReadingDays > 0) {
        const torqueCutoff = new Date(now.getTime() - torqueReadingDays * 24 * 60 * 60 * 1000);
        const torqueDeleted = await TorqueReading.destroy({
          where: { timestamp: { [sequelize.Op.lt]: torqueCutoff } },
        });
        cleanedCount += torqueDeleted;
        logger.info(`Cleaned ${torqueDeleted} old torque reading entries`);
      }

      // Clean resolved load events
      if (resolvedLoadEventDays > 0) {
        const loadEventCutoff = new Date(
          now.getTime() - resolvedLoadEventDays * 24 * 60 * 60 * 1000
        );
        const loadEventDeleted = await LoadEvent.destroy({
          where: {
            timestamp: { [sequelize.Op.lt]: loadEventCutoff },
            resolved_at: { [sequelize.Op.ne]: null },
          },
        });
        cleanedCount += loadEventDeleted;
        logger.info(`Cleaned ${loadEventDeleted} old resolved load events`);
      }

      // Clean inactive users (but keep admins)
      if (inactiveUserDays > 0) {
        const userCutoff = new Date(now.getTime() - inactiveUserDays * 24 * 60 * 60 * 1000);
        const userDeleted = await User.destroy({
          where: {
            last_login_at: { [sequelize.Op.lt]: userCutoff },
            role: { [sequelize.Op.ne]: 'admin' },
            is_active: false,
          },
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
    AuditLog,
    Macro,
    MacroCategory,
    MacroExecutionHistory,
    TemperatureReading,
    TemperatureThreshold,
    TorqueReading,
    LoadEvent,
    MotorSpecification,
    TorqueCalibration,
    HardwareError,
    ErrorCodeDefinition,
    ErrorRecoveryLog,
  },
};
