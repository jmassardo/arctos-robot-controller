const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../logger');

/**
 * Maintenance Task Processor
 * Handles system maintenance tasks like backups, cleanup, and diagnostics
 */
class MaintenanceTaskProcessor {
  constructor(websocket) {
    this.websocket = websocket;
    this.name = 'MaintenanceTaskProcessor';

    // Define maintenance tasks
    this.tasks = {
      backup_data: this.backupData.bind(this),
      cleanup_logs: this.cleanupLogs.bind(this),
      system_diagnostics: this.runSystemDiagnostics.bind(this),
      database_maintenance: this.databaseMaintenance.bind(this),
      update_check: this.checkForUpdates.bind(this),
      security_scan: this.runSecurityScan.bind(this),
      performance_analysis: this.analyzePerformance.bind(this),
      disk_cleanup: this.cleanupDisk.bind(this),
      config_validation: this.validateConfiguration.bind(this),
      hardware_test: this.testHardware.bind(this),
    };
  }

  /**
   * Process maintenance job
   */
  async process(job) {
    const { taskType, options } = job.data;
    const jobId = job.id;

    logger.info(`Starting maintenance job ${jobId}:`, {
      taskType: taskType,
      options: options,
    });

    try {
      // Validate job data
      this.validateJobData(taskType, options);

      // Initialize job progress
      await job.progress(0);

      const results = {
        success: true,
        taskType: taskType,
        executionTime: 0,
        details: {},
        warnings: [],
        errors: [],
      };

      const startTime = Date.now();

      // Get the task function
      const taskFunction = this.tasks[taskType];
      if (!taskFunction) {
        throw new Error(`Unknown maintenance task: ${taskType}`);
      }

      // Execute the maintenance task
      const taskResult = await taskFunction(job, options);

      results.details = taskResult;
      results.executionTime = Date.now() - startTime;

      await job.progress(100);

      logger.info(`Maintenance job ${jobId} completed successfully:`, results);

      // Send final completion update
      if (this.websocket) {
        this.websocket.emit('job:maintenance_completed', {
          jobId: jobId,
          taskType: taskType,
          results: results,
        });
      }

      return results;
    } catch (error) {
      logger.error(`Maintenance job ${jobId} failed:`, error);

      // Send error update
      if (this.websocket) {
        this.websocket.emit('job:maintenance_failed', {
          jobId: jobId,
          taskType: taskType,
          error: error.message,
        });
      }

      throw new Error(`Maintenance task failed: ${error.message}`);
    }
  }

  /**
   * Validate job data
   */
  validateJobData(taskType, options) {
    if (!taskType || typeof taskType !== 'string') {
      throw new Error('Task type must be a valid string');
    }

    if (!this.tasks[taskType]) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    // Validate options
    if (options && typeof options !== 'object') {
      throw new Error('Options must be an object');
    }
  }

  /**
   * Backup data task
   */
  async backupData(job, options = {}) {
    const backupDir = path.join(__dirname, '../../data/backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}`);

    await job.progress(10);

    try {
      // Ensure backup directory exists
      await fs.ensureDir(backupPath);

      const results = {
        backupPath: backupPath,
        backupSize: 0,
        filesBackedUp: 0,
        duration: 0,
      };

      const startTime = Date.now();

      // Backup database
      await job.progress(30);
      const dbPath = path.join(__dirname, '../../data/database.sqlite');
      if (await fs.pathExists(dbPath)) {
        await fs.copy(dbPath, path.join(backupPath, 'database.sqlite'));
        results.filesBackedUp++;
      }

      // Backup configuration files
      await job.progress(50);
      const configDir = path.join(__dirname, '../../config');
      if (await fs.pathExists(configDir)) {
        await fs.copy(configDir, path.join(backupPath, 'config'));
        results.filesBackedUp++;
      }

      // Backup saved positions
      await job.progress(70);
      const positionsFile = path.join(__dirname, '../../data/saved-positions.json');
      if (await fs.pathExists(positionsFile)) {
        await fs.copy(positionsFile, path.join(backupPath, 'saved-positions.json'));
        results.filesBackedUp++;
      }

      // Backup logs (if requested)
      if (options.includeLogs) {
        await job.progress(80);
        const logsDir = path.join(__dirname, '../../logs');
        if (await fs.pathExists(logsDir)) {
          await fs.copy(logsDir, path.join(backupPath, 'logs'));
          results.filesBackedUp++;
        }
      }

      // Calculate backup size
      await job.progress(90);
      results.backupSize = await this.calculateDirectorySize(backupPath);
      results.duration = Date.now() - startTime;

      // Clean up old backups if requested
      if (options.cleanupOld) {
        await this.cleanupOldBackups(backupDir, options.keepCount || 10);
      }

      logger.info(`Backup completed: ${results.filesBackedUp} files, ${results.backupSize} bytes`);

      return results;
    } catch (error) {
      logger.error('Backup failed:', error);

      // Cleanup failed backup
      try {
        await fs.remove(backupPath);
      } catch (cleanupError) {
        logger.error('Failed to cleanup incomplete backup:', cleanupError);
      }

      throw error;
    }
  }

  /**
   * Cleanup logs task
   */
  async cleanupLogs(job, options = {}) {
    const logsDir = path.join(__dirname, '../../logs');
    const maxAge = options.maxAge || 30; // days
    const maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB

    await job.progress(10);

    const results = {
      filesRemoved: 0,
      sizeFreed: 0,
      oldestLogDate: null,
      totalLogSize: 0,
    };

    try {
      if (!(await fs.pathExists(logsDir))) {
        return results;
      }

      const files = await fs.readdir(logsDir);
      const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

      await job.progress(30);

      let totalSize = 0;
      const filesToRemove = [];

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);

        totalSize += stats.size;

        // Check if file is too old
        if (stats.mtime < cutoffDate) {
          filesToRemove.push({ path: filePath, size: stats.size, reason: 'age' });
        }
      }

      results.totalLogSize = totalSize;

      // If total size exceeds limit, remove oldest files
      if (totalSize > maxSize) {
        const sortedFiles = files
          .map(file => ({
            path: path.join(logsDir, file),
            stats: fs.statSync(path.join(logsDir, file)),
          }))
          .sort((a, b) => a.stats.mtime - b.stats.mtime);

        let currentSize = totalSize;
        for (const file of sortedFiles) {
          if (currentSize <= maxSize) {
            break;
          }

          const alreadyMarked = filesToRemove.find(f => f.path === file.path);
          if (!alreadyMarked) {
            filesToRemove.push({
              path: file.path,
              size: file.stats.size,
              reason: 'size',
            });
          }
          currentSize -= file.stats.size;
        }
      }

      await job.progress(70);

      // Remove files
      for (const file of filesToRemove) {
        try {
          await fs.remove(file.path);
          results.filesRemoved++;
          results.sizeFreed += file.size;
        } catch (error) {
          logger.error(`Failed to remove log file ${file.path}:`, error);
        }
      }

      await job.progress(90);

      // Find oldest remaining log
      const remainingFiles = await fs.readdir(logsDir);
      if (remainingFiles.length > 0) {
        let oldestDate = new Date();
        for (const file of remainingFiles) {
          const stats = await fs.stat(path.join(logsDir, file));
          if (stats.mtime < oldestDate) {
            oldestDate = stats.mtime;
          }
        }
        results.oldestLogDate = oldestDate;
      }

      logger.info(
        `Log cleanup completed: removed ${results.filesRemoved} files, freed ${results.sizeFreed} bytes`
      );

      return results;
    } catch (error) {
      logger.error('Log cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Run system diagnostics task
   */
  async runSystemDiagnostics(job, options = {}) {
    const results = {
      systemInfo: {},
      diskSpace: {},
      memoryUsage: {},
      processList: [],
      networkStatus: {},
      databaseStatus: {},
      hardwareStatus: {},
      warnings: [],
      errors: [],
    };

    try {
      // System information
      await job.progress(10);
      results.systemInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        pid: process.pid,
      };

      // Memory usage
      await job.progress(20);
      const memUsage = process.memoryUsage();
      results.memoryUsage = {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      };

      // Disk space check
      await job.progress(40);
      try {
        const fs = require('fs');
        const stats = await fs.promises.stat(__dirname);
        results.diskSpace = {
          available: true,
          // Note: Getting actual disk space requires additional dependencies
          // This is a simplified version
        };
      } catch (error) {
        results.diskSpace = { error: error.message };
        results.warnings.push('Could not check disk space');
      }

      // Database connection test
      await job.progress(60);
      try {
        const { DatabaseManager } = require('../database');
        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        results.databaseStatus = { connected: true, healthy: true };
      } catch (error) {
        results.databaseStatus = { connected: false, error: error.message };
        results.errors.push(`Database connection failed: ${error.message}`);
      }

      // Check for critical errors in recent logs
      await job.progress(80);
      const recentErrors = await this.checkRecentLogErrors();
      if (recentErrors.length > 0) {
        results.warnings.push(`Found ${recentErrors.length} recent errors in logs`);
      }

      await job.progress(90);

      // Generate overall health score
      results.healthScore = this.calculateHealthScore(results);

      logger.info('System diagnostics completed:', {
        healthScore: results.healthScore,
        warnings: results.warnings.length,
        errors: results.errors.length,
      });

      return results;
    } catch (error) {
      logger.error('System diagnostics failed:', error);
      throw error;
    }
  }

  /**
   * Database maintenance task
   */
  async databaseMaintenance(job, options = {}) {
    const results = {
      tablesOptimized: 0,
      recordsCleaned: 0,
      sizeReduction: 0,
      indexesRebuilt: 0,
    };

    try {
      await job.progress(10);

      const { sequelize } = require('../database');

      // VACUUM operation for SQLite
      await job.progress(30);
      await sequelize.query('VACUUM');
      results.tablesOptimized++;

      // Clean up old audit trail records if requested
      if (options.cleanAuditTrail) {
        await job.progress(50);
        const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
        const deleted = await sequelize.query('DELETE FROM audit_trails WHERE created_at < ?', {
          replacements: [cutoffDate],
        });
        results.recordsCleaned += deleted[0].changes || 0;
      }

      // Analyze tables (SQLite equivalent)
      await job.progress(70);
      await sequelize.query('ANALYZE');

      // Update statistics
      await job.progress(90);
      results.indexesRebuilt = 1; // SQLite rebuilds indexes during VACUUM

      logger.info('Database maintenance completed:', results);

      return results;
    } catch (error) {
      logger.error('Database maintenance failed:', error);
      throw error;
    }
  }

  /**
   * Check for updates task
   */
  async checkForUpdates(job, options = {}) {
    const results = {
      currentVersion: '1.0.0', // TODO: Get from package.json
      latestVersion: null,
      updatesAvailable: false,
      securityUpdates: false,
      dependencies: [],
    };

    try {
      await job.progress(20);

      // This is a placeholder - in a real implementation, you would:
      // 1. Check package.json for current version
      // 2. Make API calls to check for updates
      // 3. Check npm for dependency updates
      // 4. Check for security vulnerabilities

      await job.progress(50);

      // Simulate update check
      await this.delay(2000);

      await job.progress(80);

      results.latestVersion = '1.0.0';
      results.updatesAvailable = false;

      logger.info('Update check completed:', results);

      return results;
    } catch (error) {
      logger.error('Update check failed:', error);
      throw error;
    }
  }

  /**
   * Run security scan task
   */
  async runSecurityScan(job, options = {}) {
    const results = {
      vulnerabilities: [],
      securityScore: 100,
      recommendations: [],
    };

    try {
      await job.progress(20);

      // Check file permissions
      await this.checkFilePermissions(results);

      await job.progress(40);

      // Check for sensitive data exposure
      await this.checkSensitiveData(results);

      await job.progress(60);

      // Check authentication settings
      await this.checkAuthSettings(results);

      await job.progress(80);

      // Calculate final security score
      results.securityScore = Math.max(0, 100 - results.vulnerabilities.length * 10);

      logger.info('Security scan completed:', {
        vulnerabilities: results.vulnerabilities.length,
        securityScore: results.securityScore,
      });

      return results;
    } catch (error) {
      logger.error('Security scan failed:', error);
      throw error;
    }
  }

  /**
   * Analyze performance task
   */
  async analyzePerformance(job, options = {}) {
    const results = {
      cpuUsage: 0,
      memoryUsage: process.memoryUsage(),
      responseTime: 0,
      throughput: 0,
      recommendations: [],
    };

    try {
      await job.progress(20);

      // Measure response time
      const startTime = process.hrtime.bigint();
      await this.delay(100); // Simulate work
      const endTime = process.hrtime.bigint();
      results.responseTime = Number(endTime - startTime) / 1000000; // Convert to ms

      await job.progress(60);

      // Analyze memory usage
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 100 * 1024 * 1024) {
        // > 100MB
        results.recommendations.push('High memory usage detected - consider optimization');
      }

      await job.progress(80);

      logger.info('Performance analysis completed:', results);

      return results;
    } catch (error) {
      logger.error('Performance analysis failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup disk task
   */
  async cleanupDisk(job, options = {}) {
    const results = {
      filesRemoved: 0,
      spaceSaved: 0,
      directories: [],
    };

    try {
      await job.progress(10);

      // Clean temporary files
      const tempDirs = [path.join(__dirname, '../../tmp'), path.join(__dirname, '../../.tmp')];

      for (const tempDir of tempDirs) {
        await job.progress(30);
        if (await fs.pathExists(tempDir)) {
          const sizeBefore = await this.calculateDirectorySize(tempDir);
          await fs.emptyDir(tempDir);
          results.spaceSaved += sizeBefore;
          results.directories.push(tempDir);
        }
      }

      await job.progress(80);

      logger.info('Disk cleanup completed:', results);

      return results;
    } catch (error) {
      logger.error('Disk cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Validate configuration task
   */
  async validateConfiguration(job, options = {}) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      recommendations: [],
    };

    try {
      await job.progress(20);

      // Check robot configuration
      const robotConfigPath = path.join(__dirname, '../../config/robot-config.json');
      if (await fs.pathExists(robotConfigPath)) {
        const config = await fs.readJson(robotConfigPath);

        // Validate required fields
        const requiredFields = ['robotType', 'communicationProtocol'];
        for (const field of requiredFields) {
          if (!config[field]) {
            results.errors.push(`Missing required field: ${field}`);
            results.valid = false;
          }
        }
      } else {
        results.warnings.push('Robot configuration file not found');
      }

      await job.progress(60);

      // Check environment variables
      const requiredEnvVars = ['NODE_ENV'];
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          results.warnings.push(`Environment variable not set: ${envVar}`);
        }
      }

      await job.progress(80);

      logger.info('Configuration validation completed:', {
        valid: results.valid,
        errors: results.errors.length,
        warnings: results.warnings.length,
      });

      return results;
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      throw error;
    }
  }

  /**
   * Test hardware task
   */
  async testHardware(job, options = {}) {
    const results = {
      hardwareConnected: false,
      tests: [],
      overallStatus: 'unknown',
    };

    try {
      await job.progress(20);

      // This would be replaced with actual hardware tests
      results.tests.push({
        name: 'Communication Test',
        status: 'simulated',
        message: 'Hardware testing requires actual hardware connection',
      });

      await job.progress(60);

      results.overallStatus = 'simulation';

      await job.progress(80);

      logger.info('Hardware test completed (simulated):', results);

      return results;
    } catch (error) {
      logger.error('Hardware test failed:', error);
      throw error;
    }
  }

  // Helper methods

  /**
   * Calculate directory size recursively
   */
  async calculateDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          totalSize += await this.calculateDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Ignore errors for inaccessible directories
    }

    return totalSize;
  }

  /**
   * Cleanup old backups
   */
  async cleanupOldBackups(backupDir, keepCount) {
    try {
      const backups = await fs.readdir(backupDir);
      const backupPaths = backups
        .filter(name => name.startsWith('backup_'))
        .map(name => ({
          name,
          path: path.join(backupDir, name),
          stats: fs.statSync(path.join(backupDir, name)),
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime);

      if (backupPaths.length > keepCount) {
        const toDelete = backupPaths.slice(keepCount);
        for (const backup of toDelete) {
          await fs.remove(backup.path);
          logger.info(`Removed old backup: ${backup.name}`);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Check recent log errors
   */
  async checkRecentLogErrors() {
    const errors = [];

    try {
      const logsDir = path.join(__dirname, '../../logs');
      if (await fs.pathExists(logsDir)) {
        const files = await fs.readdir(logsDir);

        // Check the most recent error log
        const errorLogFile = files.find(file => file.includes('error'));
        if (errorLogFile) {
          const errorLog = await fs.readFile(path.join(logsDir, errorLogFile), 'utf8');
          const lines = errorLog.split('\n').slice(-100); // Last 100 lines

          for (const line of lines) {
            if (line.includes('ERROR') || line.includes('FATAL')) {
              errors.push(line);
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors when checking logs
    }

    return errors;
  }

  /**
   * Calculate system health score
   */
  calculateHealthScore(diagnostics) {
    let score = 100;

    // Deduct points for errors and warnings
    score -= diagnostics.errors.length * 20;
    score -= diagnostics.warnings.length * 10;

    // Deduct points for memory usage
    const memUsage = diagnostics.memoryUsage;
    if (memUsage.heapUsed > 200 * 1024 * 1024) {
      // > 200MB
      score -= 10;
    }

    // Deduct points for database issues
    if (!diagnostics.databaseStatus.connected) {
      score -= 30;
    }

    return Math.max(0, score);
  }

  /**
   * Check file permissions (simplified)
   */
  async checkFilePermissions(results) {
    // This would check for overly permissive file permissions
    // Simplified implementation
    results.recommendations.push('Regularly review file permissions');
  }

  /**
   * Check for sensitive data exposure
   */
  async checkSensitiveData(results) {
    // This would scan for exposed sensitive data
    // Simplified implementation
    try {
      const configPath = path.join(__dirname, '../../config');
      if (await fs.pathExists(configPath)) {
        // Check for exposed secrets in config files
        // This is a simplified check
        results.recommendations.push('Review configuration files for exposed secrets');
      }
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Check authentication settings
   */
  async checkAuthSettings(results) {
    // This would validate authentication configuration
    // Simplified implementation
    results.recommendations.push('Ensure strong authentication policies are enforced');
  }

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get processor name
   */
  getName() {
    return this.name;
  }
}

module.exports = MaintenanceTaskProcessor;
