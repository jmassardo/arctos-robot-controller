const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('./logger');
const { models } = require('./database');
const MKSErrorMonitor = require('./hardware/mksErrorMonitor');
const ErrorPatternAnalyzer = require('./errorPatternAnalyzer');
const ErrorRecoverySystem = require('./errorRecoverySystem');
const ErrorNotificationService = require('./errorNotificationService');

/**
 * Hardware Error Management System
 * Provides comprehensive error monitoring, tracking, and recovery for MKS controllers
 */
class HardwareErrorManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      pollingInterval: 1000, // 1 second
      maxActiveErrors: 100,
      errorHistoryDays: 90,
      patternAnalysisInterval: 300000, // 5 minutes
      autoRecoveryEnabled: true,
      notificationEnabled: true,
      ...options,
    };

    this.activeErrors = new Map();
    this.errorHistory = [];
    this.errorCodeDatabase = new Map();
    this.controllers = new Map();
    this.isMonitoring = false;
    this.monitoringInterval = null;

    // Initialize subsystems
    this.patternAnalyzer = new ErrorPatternAnalyzer();
    this.recoverySystem = new ErrorRecoverySystem();
    this.notificationService = new ErrorNotificationService();

    // Load error code definitions
    this.loadErrorCodeDatabase();

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the error management system
   */
  async initialize() {
    try {
      logger.info('Initializing Hardware Error Manager');

      // Initialize subsystems
      await this.patternAnalyzer.initialize();
      await this.recoverySystem.initialize();
      await this.notificationService.initialize();

      // Load error history from database
      await this.loadErrorHistory();

      // Populate error code definitions in database
      await this.populateErrorCodeDefinitions();

      logger.info('Hardware Error Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Hardware Error Manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Add a controller for monitoring
   */
  addController(controllerId, controllerType, config = {}) {
    try {
      const monitor = new MKSErrorMonitor(controllerId, controllerType, config);

      this.controllers.set(controllerId, {
        monitor,
        type: controllerType,
        config,
        lastErrorCheck: null,
        errorCount: 0,
      });

      // Set up monitor event listeners
      monitor.on('error', error => this.handleNewError(controllerId, error));
      monitor.on('errorCleared', errorCode => this.handleErrorCleared(controllerId, errorCode));
      monitor.on('communicationError', error => this.handleCommunicationError(controllerId, error));

      logger.info('Controller added for error monitoring', {
        controllerId,
        controllerType,
      });

      return true;
    } catch (error) {
      logger.error('Failed to add controller', {
        controllerId,
        controllerType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Remove a controller from monitoring
   */
  removeController(controllerId) {
    try {
      const controller = this.controllers.get(controllerId);
      if (controller) {
        controller.monitor.removeAllListeners();
        this.controllers.delete(controllerId);

        // Clear active errors for this controller
        for (const [key, error] of this.activeErrors.entries()) {
          if (error.controller_id === controllerId) {
            this.activeErrors.delete(key);
          }
        }

        logger.info('Controller removed from error monitoring', { controllerId });
      }

      return true;
    } catch (error) {
      logger.error('Failed to remove controller', {
        controllerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start error monitoring
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    try {
      this.isMonitoring = true;

      // Start monitoring all controllers
      for (const [controllerId, controller] of this.controllers.entries()) {
        await controller.monitor.startMonitoring();
      }

      // Start periodic error checking
      this.monitoringInterval = setInterval(() => {
        this.performPeriodicChecks();
      }, this.options.pollingInterval);

      // Start pattern analysis
      setInterval(() => {
        this.analyzeErrorPatterns();
      }, this.options.patternAnalysisInterval);

      logger.info('Error monitoring started', {
        controllers: this.controllers.size,
        pollingInterval: this.options.pollingInterval,
      });

      this.emit('monitoringStarted');
    } catch (error) {
      logger.error('Failed to start error monitoring', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop error monitoring
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      this.isMonitoring = false;

      // Clear monitoring interval
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Stop monitoring all controllers
      for (const [controllerId, controller] of this.controllers.entries()) {
        await controller.monitor.stopMonitoring();
      }

      logger.info('Error monitoring stopped');
      this.emit('monitoringStopped');
    } catch (error) {
      logger.error('Failed to stop error monitoring', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle new error detected
   */
  async handleNewError(controllerId, errorInfo) {
    try {
      const errorKey = `${controllerId}_${errorInfo.code}`;
      const existingError = this.activeErrors.get(errorKey);

      if (existingError) {
        // Update existing error
        existingError.occurrence_count++;
        existingError.last_occurrence = new Date();

        // Update in database
        await models.HardwareError.update(
          {
            occurrence_count: existingError.occurrence_count,
            last_occurrence: existingError.last_occurrence,
          },
          {
            where: { id: existingError.id },
          }
        );

        logger.debug('Updated existing error occurrence', {
          controllerId,
          errorCode: errorInfo.code,
          occurrenceCount: existingError.occurrence_count,
        });
      } else {
        // Create new error record
        const errorDefinition = this.getErrorDefinition(
          this.controllers.get(controllerId)?.type,
          errorInfo.code
        );

        const newError = {
          id: require('uuid').v4(),
          controller_id: controllerId,
          motor_id: errorInfo.motorId || null,
          error_code: errorInfo.code,
          error_type: errorInfo.type || errorDefinition?.name || 'Unknown Error',
          severity: errorDefinition?.severity || 'warning',
          description:
            errorDefinition?.description || errorInfo.description || 'Unknown error occurred',
          first_occurrence: new Date(),
          last_occurrence: new Date(),
          occurrence_count: 1,
          resolved_at: null,
          resolution_method: null,
          resolved_by: null,
        };

        // Save to database
        await models.HardwareError.create(newError);

        // Add to active errors
        this.activeErrors.set(errorKey, newError);

        logger.warn('New hardware error detected', {
          controllerId,
          errorCode: errorInfo.code,
          errorType: newError.error_type,
          severity: newError.severity,
        });

        // Emit error event
        this.emit('newError', newError);

        // Handle critical/fatal errors
        if (newError.severity === 'critical' || newError.severity === 'fatal') {
          this.emit('criticalError', newError);

          // Send notifications
          if (this.options.notificationEnabled) {
            await this.notificationService.sendErrorAlert(newError);
          }

          // Attempt auto-recovery if enabled
          if (this.options.autoRecoveryEnabled) {
            setTimeout(() => {
              this.attemptRecovery(newError);
            }, 1000); // 1 second delay
          }
        }
      }

      // Add to history
      this.errorHistory.unshift({
        ...errorInfo,
        timestamp: new Date(),
        controllerId,
      });

      // Limit history size
      if (this.errorHistory.length > 1000) {
        this.errorHistory = this.errorHistory.slice(0, 1000);
      }
    } catch (error) {
      logger.error('Failed to handle new error', {
        controllerId,
        errorInfo,
        error: error.message,
      });
    }
  }

  /**
   * Handle error cleared
   */
  async handleErrorCleared(controllerId, errorCode) {
    try {
      const errorKey = `${controllerId}_${errorCode}`;
      const activeError = this.activeErrors.get(errorKey);

      if (activeError && !activeError.resolved_at) {
        // Mark as resolved
        activeError.resolved_at = new Date();
        activeError.resolution_method = 'auto_cleared';

        // Update in database
        await models.HardwareError.update(
          {
            resolved_at: activeError.resolved_at,
            resolution_method: activeError.resolution_method,
          },
          {
            where: { id: activeError.id },
          }
        );

        // Remove from active errors
        this.activeErrors.delete(errorKey);

        logger.info('Hardware error cleared', {
          controllerId,
          errorCode,
          duration: activeError.resolved_at - activeError.first_occurrence,
        });

        this.emit('errorCleared', activeError);
      }
    } catch (error) {
      logger.error('Failed to handle error cleared', {
        controllerId,
        errorCode,
        error: error.message,
      });
    }
  }

  /**
   * Handle communication error
   */
  async handleCommunicationError(controllerId, error) {
    logger.error('Controller communication error', {
      controllerId,
      error: error.message,
    });

    this.emit('communicationError', {
      controllerId,
      error: error.message,
      timestamp: new Date(),
    });
  }

  /**
   * Attempt automatic error recovery
   */
  async attemptRecovery(error) {
    try {
      logger.info('Attempting automatic error recovery', {
        controllerId: error.controller_id,
        errorCode: error.error_code,
      });

      const success = await this.recoverySystem.attemptRecovery(error);

      // Log recovery attempt
      await models.ErrorRecoveryLog.create({
        error_id: error.id,
        recovery_method: this.recoverySystem.getLastRecoveryMethod(),
        recovery_success: success,
        recovery_time_ms: this.recoverySystem.getLastRecoveryTime(),
        recovery_notes: this.recoverySystem.getLastRecoveryNotes(),
        timestamp: new Date(),
      });

      if (success) {
        logger.info('Automatic error recovery successful', {
          controllerId: error.controller_id,
          errorCode: error.error_code,
        });

        this.emit('recoverySuccess', error);
      } else {
        logger.warn('Automatic error recovery failed', {
          controllerId: error.controller_id,
          errorCode: error.error_code,
        });

        this.emit('recoveryFailed', error);
      }
    } catch (error) {
      logger.error('Error during recovery attempt', { error: error.message });
    }
  }

  /**
   * Get error definition from database
   */
  getErrorDefinition(controllerType, errorCode) {
    return this.errorCodeDatabase.get(`${controllerType}_${errorCode}`);
  }

  /**
   * Get active errors
   */
  getActiveErrors() {
    return Array.from(this.activeErrors.values());
  }

  /**
   * Get error history
   */
  async getErrorHistory(limit = 100, offset = 0, filters = {}) {
    try {
      const whereConditions = {};

      if (filters.controllerId) {
        whereConditions.controller_id = filters.controllerId;
      }

      if (filters.severity) {
        whereConditions.severity = filters.severity;
      }

      if (filters.startDate && filters.endDate) {
        whereConditions.first_occurrence = {
          [models.sequelize.Op.between]: [filters.startDate, filters.endDate],
        };
      }

      const errors = await models.HardwareError.findAll({
        where: whereConditions,
        order: [['first_occurrence', 'DESC']],
        limit,
        offset,
        include: [
          {
            model: models.ErrorRecoveryLog,
            as: 'ErrorRecoveryLogs',
          },
        ],
      });

      return errors;
    } catch (error) {
      logger.error('Failed to get error history', { error: error.message });
      throw error;
    }
  }

  /**
   * Resolve an error manually
   */
  async resolveError(errorId, resolutionMethod, resolvedBy) {
    try {
      const error = await models.HardwareError.findByPk(errorId);

      if (!error) {
        throw new Error('Error not found');
      }

      if (error.resolved_at) {
        throw new Error('Error already resolved');
      }

      // Update error record
      await models.HardwareError.update(
        {
          resolved_at: new Date(),
          resolution_method: resolutionMethod,
          resolved_by: resolvedBy,
        },
        {
          where: { id: errorId },
        }
      );

      // Remove from active errors
      const errorKey = `${error.controller_id}_${error.error_code}`;
      this.activeErrors.delete(errorKey);

      logger.info('Error resolved manually', {
        errorId,
        resolutionMethod,
        resolvedBy,
      });

      this.emit('errorResolved', error);

      return true;
    } catch (error) {
      logger.error('Failed to resolve error', { errorId, error: error.message });
      throw error;
    }
  }

  /**
   * Analyze error patterns
   */
  async analyzeErrorPatterns() {
    try {
      const recentErrors = await this.getErrorHistory(1000);
      const patterns = await this.patternAnalyzer.analyzePatterns(recentErrors);

      logger.debug('Error pattern analysis completed', {
        patternsFound: patterns.length,
      });

      this.emit('patternsAnalyzed', patterns);

      return patterns;
    } catch (error) {
      logger.error('Failed to analyze error patterns', { error: error.message });
    }
  }

  /**
   * Perform periodic checks
   */
  async performPeriodicChecks() {
    try {
      // Clean up old resolved errors from active map
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      for (const [key, error] of this.activeErrors.entries()) {
        if (error.resolved_at && error.resolved_at < oneHourAgo) {
          this.activeErrors.delete(key);
        }
      }

      // Check for communication timeouts
      for (const [controllerId, controller] of this.controllers.entries()) {
        if (controller.lastErrorCheck) {
          const timeSinceLastCheck = now - controller.lastErrorCheck;
          if (timeSinceLastCheck > this.options.pollingInterval * 3) {
            this.handleCommunicationError(controllerId, new Error('Communication timeout'));
          }
        }
      }
    } catch (error) {
      logger.error('Error during periodic checks', { error: error.message });
    }
  }

  /**
   * Load error code database
   */
  async loadErrorCodeDatabase() {
    try {
      const errorCodesPath = path.join(__dirname, '../data/mks-error-codes.json');

      if (await fs.pathExists(errorCodesPath)) {
        const errorCodes = await fs.readJson(errorCodesPath);

        for (const [controllerType, codes] of Object.entries(errorCodes)) {
          for (const [errorCode, definition] of Object.entries(codes)) {
            const key = `${controllerType}_${errorCode}`;
            this.errorCodeDatabase.set(key, definition);
          }
        }

        logger.info('Error code database loaded', {
          totalCodes: this.errorCodeDatabase.size,
        });
      }
    } catch (error) {
      logger.error('Failed to load error code database', { error: error.message });
    }
  }

  /**
   * Load error history from database
   */
  async loadErrorHistory() {
    try {
      const errors = await models.HardwareError.findAll({
        where: {
          resolved_at: null, // Only active errors
        },
        order: [['first_occurrence', 'DESC']],
      });

      for (const error of errors) {
        const errorKey = `${error.controller_id}_${error.error_code}`;
        this.activeErrors.set(errorKey, error);
      }

      logger.info('Error history loaded', {
        activeErrors: this.activeErrors.size,
      });
    } catch (error) {
      logger.error('Failed to load error history', { error: error.message });
    }
  }

  /**
   * Populate error code definitions in database
   */
  async populateErrorCodeDefinitions() {
    try {
      for (const [key, definition] of this.errorCodeDatabase.entries()) {
        const [controllerType, errorCode] = key.split('_');

        await models.ErrorCodeDefinition.upsert({
          controller_type: controllerType,
          error_code: errorCode,
          error_name: definition.name,
          description: definition.description,
          severity: definition.severity,
          causes: definition.causes,
          solutions: definition.solutions,
          recovery_procedure: definition.recoveryProcedure,
          documentation_url: definition.documentationUrl || null,
        });
      }

      logger.info('Error code definitions populated in database');
    } catch (error) {
      logger.error('Failed to populate error code definitions', { error: error.message });
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.on('newError', error => {
      logger.info('New error event emitted', {
        controllerId: error.controller_id,
        errorCode: error.error_code,
        severity: error.severity,
      });
    });

    this.on('criticalError', error => {
      logger.error('Critical error event emitted', {
        controllerId: error.controller_id,
        errorCode: error.error_code,
        errorType: error.error_type,
      });
    });
  }

  /**
   * Get error statistics
   */
  async getErrorStatistics(timeframe = '24h') {
    try {
      const now = new Date();
      let startTime;

      switch (timeframe) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const stats = await models.HardwareError.findAll({
        where: {
          first_occurrence: {
            [models.sequelize.Op.gte]: startTime,
          },
        },
        attributes: [
          'severity',
          'error_type',
          'controller_id',
          [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count'],
        ],
        group: ['severity', 'error_type', 'controller_id'],
      });

      return {
        timeframe,
        statistics: stats,
        totalActiveErrors: this.activeErrors.size,
        monitoredControllers: this.controllers.size,
      };
    } catch (error) {
      logger.error('Failed to get error statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup old error records
   */
  async cleanup() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.options.errorHistoryDays);

      const deletedCount = await models.HardwareError.destroy({
        where: {
          resolved_at: {
            [models.sequelize.Op.lt]: cutoffDate,
            [models.sequelize.Op.ne]: null,
          },
        },
      });

      logger.info('Error cleanup completed', {
        deletedRecords: deletedCount,
        cutoffDate,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup error records', { error: error.message });
      throw error;
    }
  }

  /**
   * Shutdown the error manager
   */
  async shutdown() {
    try {
      await this.stopMonitoring();

      // Clear all maps and arrays
      this.activeErrors.clear();
      this.errorHistory = [];
      this.errorCodeDatabase.clear();
      this.controllers.clear();

      // Remove all listeners
      this.removeAllListeners();

      logger.info('Hardware Error Manager shutdown completed');
    } catch (error) {
      logger.error('Error during Hardware Error Manager shutdown', { error: error.message });
    }
  }
}

module.exports = HardwareErrorManager;
