const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { DatabaseManager, models } = require('./database');
const { logger } = require('./logger');

// Migration utilities for transferring JSON data to SQLite database
class DataMigration {
  constructor() {
    this.db = new DatabaseManager();
    this.jsonDataPath = path.join(__dirname, '../data');
    this.configPath = path.join(__dirname, '../config');
  }

  /**
   * Run complete migration from JSON files to database
   */
  async migrate() {
    try {
      logger.info('Starting data migration from JSON to database...');

      // Initialize database first
      await this.db.initialize();

      // Create migration user for data attribution
      const migrationUser = await this.createMigrationUser();

      // Migrate robot configuration
      const robotConfig = await this.migrateRobotConfig(migrationUser.id);

      // Migrate position groups
      await this.migratePositionGroups(migrationUser.id);

      // Migrate saved positions
      await this.migratePositions(migrationUser.id, robotConfig?.id);

      // Create backup of JSON files
      await this.backupJsonFiles();

      logger.info('Data migration completed successfully');
      return true;
    } catch (error) {
      logger.error('Data migration failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Create system user for migration attribution
   */
  async createMigrationUser() {
    try {
      const [user, created] = await models.User.findOrCreate({
        where: { username: 'system' },
        defaults: {
          username: 'system',
          email: 'system@arctos-robot.local',
          password_hash: 'disabled', // System user cannot login
          role: 'admin',
          is_active: false, // Disabled for login
          metadata: {
            type: 'system',
            purpose: 'data_migration',
            created_at: new Date().toISOString()
          }
        }
      });

      if (created) {
        logger.info('Created system user for migration');
      }

      return user;
    } catch (error) {
      logger.error('Failed to create migration user', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate robot configuration from JSON
   */
  async migrateRobotConfig(userId) {
    try {
      const configFile = path.join(this.configPath, 'robot-config.json');
      
      if (!await fs.pathExists(configFile)) {
        logger.info('No robot configuration file found, skipping migration');
        return null;
      }

      const configData = await fs.readJson(configFile);
      logger.info('Found robot configuration file', { 
        axes: Object.keys(configData.axes || {}).length,
        manipulators: Object.keys(configData.manipulators || {}).length
      });

      // Create robot configuration record
      const robotConfig = await models.RobotConfig.create({
        name: configData.name || 'Migrated Configuration',
        robot_type: this.mapRobotType(configData.robotType),
        communication_protocol: this.mapCommProtocol(configData.communicationProtocol),
        connection_settings: {
          port: configData.port,
          baudRate: configData.baudRate,
          interface: configData.interface,
          nodeId: configData.nodeId,
          ...configData.connectionSettings
        },
        axis_configuration: {
          axes: configData.axes || {},
          axisLimits: configData.axisLimits || {},
          homingSettings: configData.homingSettings || {}
        },
        manipulator_configuration: {
          manipulators: configData.manipulators || {},
          manipulatorLimits: configData.manipulatorLimits || {}
        },
        safety_limits: {
          maxSpeed: configData.maxSpeed,
          maxAcceleration: configData.maxAcceleration,
          safetySettings: configData.safetySettings || {}
        },
        is_active: true,
        created_by: userId,
        metadata: {
          migrated_from: 'json',
          migration_timestamp: new Date().toISOString(),
          original_file: configFile
        }
      });

      logger.info('Robot configuration migrated', { 
        id: robotConfig.id, 
        name: robotConfig.name 
      });

      return robotConfig;
    } catch (error) {
      logger.error('Failed to migrate robot configuration', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate position groups from JSON
   */
  async migratePositionGroups(userId) {
    try {
      const groupsFile = path.join(this.jsonDataPath, 'position-groups.json');
      
      if (!await fs.pathExists(groupsFile)) {
        logger.info('No position groups file found, skipping migration');
        return [];
      }

      const groupsData = await fs.readJson(groupsFile);
      logger.info('Found position groups file', { 
        groups: groupsData.groups?.length || 0 
      });

      const migratedGroups = [];

      if (groupsData.groups && Array.isArray(groupsData.groups)) {
        for (let i = 0; i < groupsData.groups.length; i++) {
          const group = groupsData.groups[i];
          
          const migratedGroup = await models.PositionGroup.create({
            name: group.name,
            description: group.description || null,
            color: group.color || '#3498db',
            order_index: i,
            created_by: userId,
            metadata: {
              migrated_from: 'json',
              migration_timestamp: new Date().toISOString(),
              original_id: group.id
            }
          });

          migratedGroups.push({
            original: group,
            migrated: migratedGroup
          });
        }
      }

      logger.info('Position groups migrated', { 
        count: migratedGroups.length 
      });

      return migratedGroups;
    } catch (error) {
      logger.error('Failed to migrate position groups', { error: error.message });
      throw error;
    }
  }

  /**
   * Migrate saved positions from JSON
   */
  async migratePositions(userId, robotConfigId) {
    try {
      const positionsFile = path.join(this.jsonDataPath, 'saved-positions.json');
      
      if (!await fs.pathExists(positionsFile)) {
        logger.info('No saved positions file found, skipping migration');
        return [];
      }

      const positionsData = await fs.readJson(positionsFile);
      logger.info('Found saved positions file', { 
        positions: positionsData.positions?.length || 0 
      });

      // Get position groups for mapping
      const groups = await models.PositionGroup.findAll({
        where: { created_by: userId }
      });
      const groupMap = new Map();
      groups.forEach(group => {
        if (group.metadata?.original_id) {
          groupMap.set(group.metadata.original_id, group.id);
        }
      });

      const migratedPositions = [];

      if (positionsData.positions && Array.isArray(positionsData.positions)) {
        for (let i = 0; i < positionsData.positions.length; i++) {
          const position = positionsData.positions[i];
          
          // Map group ID if exists
          let groupId = null;
          if (position.groupId && groupMap.has(position.groupId)) {
            groupId = groupMap.get(position.groupId);
          }

          const migratedPosition = await models.Position.create({
            name: position.name,
            description: position.description || null,
            axes: position.axes || {},
            manipulators: position.manipulators || {},
            group_id: groupId,
            order_index: i,
            is_favorite: position.favorite || false,
            tags: position.tags || [],
            created_by: userId,
            robot_config_id: robotConfigId,
            metadata: {
              migrated_from: 'json',
              migration_timestamp: new Date().toISOString(),
              original_id: position.id,
              original_timestamp: position.timestamp
            }
          });

          migratedPositions.push({
            original: position,
            migrated: migratedPosition
          });
        }
      }

      logger.info('Saved positions migrated', { 
        count: migratedPositions.length 
      });

      return migratedPositions;
    } catch (error) {
      logger.error('Failed to migrate saved positions', { error: error.message });
      throw error;
    }
  }

  /**
   * Create backup of original JSON files
   */
  async backupJsonFiles() {
    try {
      const backupDir = path.join(__dirname, '../data/json-backup');
      await fs.ensureDir(backupDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `pre-migration-${timestamp}`);
      await fs.ensureDir(backupPath);

      // Backup files that exist
      const filesToBackup = [
        { src: path.join(this.configPath, 'robot-config.json'), dst: 'robot-config.json' },
        { src: path.join(this.jsonDataPath, 'position-groups.json'), dst: 'position-groups.json' },
        { src: path.join(this.jsonDataPath, 'saved-positions.json'), dst: 'saved-positions.json' }
      ];

      for (const file of filesToBackup) {
        if (await fs.pathExists(file.src)) {
          await fs.copy(file.src, path.join(backupPath, file.dst));
          logger.info(`Backed up ${file.dst}`);
        }
      }

      // Create migration info file
      const migrationInfo = {
        migration_date: new Date().toISOString(),
        backup_path: backupPath,
        migrated_files: filesToBackup
          .filter(f => fs.pathExistsSync(f.src))
          .map(f => f.dst),
        database_path: path.join(__dirname, '../data/database.sqlite'),
        notes: 'Original JSON files backed up before database migration'
      };

      await fs.writeJson(
        path.join(backupPath, 'migration-info.json'), 
        migrationInfo, 
        { spaces: 2 }
      );

      logger.info('JSON files backed up successfully', { backupPath });
      return backupPath;
    } catch (error) {
      logger.error('Failed to backup JSON files', { error: error.message });
      throw error;
    }
  }

  /**
   * Rollback migration and restore JSON files
   */
  async rollback(backupPath) {
    try {
      logger.info('Starting migration rollback...', { backupPath });

      if (!await fs.pathExists(backupPath)) {
        throw new Error('Backup path not found');
      }

      // Read migration info
      const migrationInfoPath = path.join(backupPath, 'migration-info.json');
      if (!await fs.pathExists(migrationInfoPath)) {
        throw new Error('Migration info not found');
      }

      const migrationInfo = await fs.readJson(migrationInfoPath);

      // Restore JSON files
      const restoreMap = [
        { src: 'robot-config.json', dst: path.join(this.configPath, 'robot-config.json') },
        { src: 'position-groups.json', dst: path.join(this.jsonDataPath, 'position-groups.json') },
        { src: 'saved-positions.json', dst: path.join(this.jsonDataPath, 'saved-positions.json') }
      ];

      for (const file of restoreMap) {
        const srcPath = path.join(backupPath, file.src);
        if (await fs.pathExists(srcPath)) {
          await fs.ensureDir(path.dirname(file.dst));
          await fs.copy(srcPath, file.dst);
          logger.info(`Restored ${file.src}`);
        }
      }

      // Remove database file
      const dbPath = path.join(__dirname, '../data/database.sqlite');
      if (await fs.pathExists(dbPath)) {
        await fs.remove(dbPath);
        logger.info('Removed database file');
      }

      logger.info('Migration rollback completed successfully');
      return true;
    } catch (error) {
      logger.error('Migration rollback failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if migration is needed
   */
  async isMigrationNeeded() {
    try {
      // Check if database exists and has data
      const dbPath = path.join(__dirname, '../data/database.sqlite');
      if (await fs.pathExists(dbPath)) {
        await this.db.initialize();
        const stats = await this.db.getStatistics();
        
        // If we have users other than the default admin, assume migration is done
        if (stats.users > 1 || stats.positions > 0 || stats.robotConfigs > 0) {
          return false;
        }
      }

      // Check if JSON files exist
      const jsonFiles = [
        path.join(this.configPath, 'robot-config.json'),
        path.join(this.jsonDataPath, 'position-groups.json'),
        path.join(this.jsonDataPath, 'saved-positions.json')
      ];

      for (const file of jsonFiles) {
        if (await fs.pathExists(file)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to check migration status', { error: error.message });
      return true; // Default to needing migration on error
    }
  }

  /**
   * Utility functions for mapping legacy data
   */
  mapRobotType(type) {
    const typeMap = {
      'MKS57D': 'MKS57D',
      'MKS42D': 'MKS42D',
      'mks57d': 'MKS57D',
      'mks42d': 'MKS42D'
    };
    return typeMap[type] || 'custom';
  }

  mapCommProtocol(protocol) {
    const protocolMap = {
      'serial': 'serial',
      'can': 'can',
      'rs485': 'rs485',
      'tcp': 'tcp',
      'Serial': 'serial',
      'CAN': 'can',
      'RS485': 'rs485',
      'TCP': 'tcp'
    };
    return protocolMap[protocol] || 'serial';
  }

  /**
   * Generate checksum for content
   */
  generateChecksum(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Close database connection
   */
  async close() {
    await this.db.close();
  }
}

module.exports = { DataMigration };