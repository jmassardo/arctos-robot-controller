const EventEmitter = require('events');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../logger');
const { DatabaseManager } = require('../database');

/**
 * Modbus Data Logger
 * Handles logging and storage of Modbus register data
 */
class ModbusDataLogger extends EventEmitter {
  constructor() {
    super();
    this.isLogging = false;
    this.logQueue = [];
    this.batchSize = 100;
    this.flushInterval = 5000; // 5 seconds
    this.logDirectory = path.join(__dirname, '../../data/modbus-logs');
    this.csvWriteStreams = new Map();

    // Statistics
    this.stats = {
      totalRecords: 0,
      recordsThisSession: 0,
      lastFlush: null,
      startTime: null,
    };

    // Initialize logging directory
    this.initializeLogDirectory();

    // Set up periodic flush
    this.flushTimer = setInterval(() => {
      this.flushLogQueue();
    }, this.flushInterval);
  }

  /**
   * Start data logging
   */
  startLogging() {
    if (this.isLogging) {
      logger.warn('Data logging is already active');
      return;
    }

    this.isLogging = true;
    this.stats.startTime = new Date().toISOString();
    this.stats.recordsThisSession = 0;

    logger.info('Started Modbus data logging');
    this.emit('loggingStarted');
  }

  /**
   * Stop data logging
   */
  async stopLogging() {
    if (!this.isLogging) {
      logger.warn('Data logging is not active');
      return;
    }

    this.isLogging = false;

    // Flush any remaining data
    await this.flushLogQueue();

    // Close all CSV streams
    await this.closeAllCSVStreams();

    logger.info(`Stopped Modbus data logging. Session records: ${this.stats.recordsThisSession}`);
    this.emit('loggingStopped', { recordsThisSession: this.stats.recordsThisSession });
  }

  /**
   * Log register data
   */
  async logData(data) {
    if (!this.isLogging) {
      return;
    }

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        deviceId: data.deviceId,
        mappingId: data.mappingId,
        registerType: data.registerType,
        address: data.address,
        rawValue: Array.isArray(data.rawData) ? data.rawData.join(',') : data.rawData,
        convertedValue: Array.isArray(data.convertedData)
          ? data.convertedData.join(',')
          : data.convertedData,
        unit: data.unit || '',
        dataType: data.dataType || '',
      };

      // Add to queue for batch processing
      this.logQueue.push(logEntry);
      this.stats.recordsThisSession++;
      this.stats.totalRecords++;

      // Log to CSV if enabled
      if (data.logToCSV) {
        await this.logToCSV(logEntry);
      }

      // Flush if queue is full
      if (this.logQueue.length >= this.batchSize) {
        await this.flushLogQueue();
      }

      this.emit('dataLogged', logEntry);
    } catch (error) {
      logger.error('Failed to log Modbus data:', error);
      this.emit('loggingError', error);
    }
  }

  /**
   * Log alarm event
   */
  async logAlarm(alarmData) {
    try {
      const alarmEntry = {
        timestamp: new Date().toISOString(),
        type: 'alarm',
        mappingId: alarmData.mappingId,
        level: alarmData.level,
        message: alarmData.message,
        value: alarmData.value,
        unit: alarmData.unit || '',
      };

      // Log to database
      await this.logToDatabase('modbus_alarms', alarmEntry);

      // Log to CSV
      await this.logToCSV(alarmEntry, 'alarms');

      logger.warn(`Modbus alarm: ${alarmData.message}`);
      this.emit('alarmLogged', alarmEntry);
    } catch (error) {
      logger.error('Failed to log Modbus alarm:', error);
    }
  }

  /**
   * Flush log queue to database
   */
  async flushLogQueue() {
    if (this.logQueue.length === 0) {
      return;
    }

    try {
      const batch = [...this.logQueue];
      this.logQueue = [];

      // Log to database in batch
      await this.batchLogToDatabase(batch);

      this.stats.lastFlush = new Date().toISOString();

      logger.debug(`Flushed ${batch.length} log entries to database`);
    } catch (error) {
      logger.error('Failed to flush log queue:', error);
      // Put failed entries back in queue
      this.logQueue = [...this.logQueue, ...this.logQueue];
    }
  }

  /**
   * Log data to database
   */
  async logToDatabase(table, data) {
    try {
      const db = DatabaseManager.getInstance();
      // This would be implemented when database models are ready
      // await db.models.ModbusDataLog.create(data);

      // For now, just log the action
      logger.debug(`Would log to database table ${table}:`, data);
    } catch (error) {
      logger.error(`Failed to log to database table ${table}:`, error);
      throw error;
    }
  }

  /**
   * Batch log to database
   */
  async batchLogToDatabase(batch) {
    try {
      const db = DatabaseManager.getInstance();
      // This would be implemented when database models are ready
      // await db.models.ModbusDataLog.bulkCreate(batch);

      // For now, just log the action
      logger.debug(`Would batch log ${batch.length} entries to database`);
    } catch (error) {
      logger.error('Failed to batch log to database:', error);
      throw error;
    }
  }

  /**
   * Log data to CSV file
   */
  async logToCSV(data, category = 'data') {
    try {
      const date = new Date().toISOString().split('T')[0];
      const filename = `modbus_${category}_${date}.csv`;
      const filepath = path.join(this.logDirectory, filename);

      // Get or create write stream
      if (!this.csvWriteStreams.has(filename)) {
        const stream = fs.createWriteStream(filepath, { flags: 'a' });
        this.csvWriteStreams.set(filename, stream);

        // Write header if file is new
        const fileExists = await fs.pathExists(filepath);
        if (!fileExists || (await fs.stat(filepath)).size === 0) {
          const headers = Object.keys(data).join(',') + '\n';
          stream.write(headers);
        }
      }

      const stream = this.csvWriteStreams.get(filename);
      const csvLine =
        Object.values(data)
          .map(value => {
            // Escape commas and quotes in values
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',') + '\n';

      stream.write(csvLine);
    } catch (error) {
      logger.error('Failed to log to CSV:', error);
      throw error;
    }
  }

  /**
   * Close all CSV write streams
   */
  async closeAllCSVStreams() {
    const closePromises = [];

    for (const [filename, stream] of this.csvWriteStreams.entries()) {
      closePromises.push(
        new Promise((resolve, reject) => {
          stream.end(error => {
            if (error) {
              logger.error(`Failed to close CSV stream ${filename}:`, error);
              reject(error);
            } else {
              resolve();
            }
          });
        })
      );
    }

    await Promise.all(closePromises);
    this.csvWriteStreams.clear();
    logger.debug('Closed all CSV write streams');
  }

  /**
   * Initialize log directory
   */
  async initializeLogDirectory() {
    try {
      await fs.ensureDir(this.logDirectory);
      logger.debug(`Initialized log directory: ${this.logDirectory}`);
    } catch (error) {
      logger.error('Failed to initialize log directory:', error);
      throw error;
    }
  }

  /**
   * Get log files
   */
  async getLogFiles() {
    try {
      const files = await fs.readdir(this.logDirectory);
      const logFiles = [];

      for (const file of files) {
        const filepath = path.join(this.logDirectory, file);
        const stats = await fs.stat(filepath);

        logFiles.push({
          filename: file,
          filepath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        });
      }

      return logFiles.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      logger.error('Failed to get log files:', error);
      return [];
    }
  }

  /**
   * Read log file data
   */
  async readLogFile(filename, options = {}) {
    try {
      const filepath = path.join(this.logDirectory, filename);

      if (!(await fs.pathExists(filepath))) {
        throw new Error(`Log file not found: ${filename}`);
      }

      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length === 0) {
        return { headers: [], data: [] };
      }

      const headers = lines[0].split(',');
      const data = [];

      // Parse data lines
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const row = {};

        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] || '';
        }

        data.push(row);
      }

      // Apply filters if provided
      let filteredData = data;

      if (options.startDate) {
        filteredData = filteredData.filter(
          row => new Date(row.timestamp) >= new Date(options.startDate)
        );
      }

      if (options.endDate) {
        filteredData = filteredData.filter(
          row => new Date(row.timestamp) <= new Date(options.endDate)
        );
      }

      if (options.mappingId) {
        filteredData = filteredData.filter(row => row.mappingId === options.mappingId);
      }

      // Apply pagination
      if (options.limit) {
        const offset = options.offset || 0;
        filteredData = filteredData.slice(offset, offset + options.limit);
      }

      return {
        filename,
        headers,
        data: filteredData,
        totalRecords: data.length,
        filteredRecords: filteredData.length,
      };
    } catch (error) {
      logger.error(`Failed to read log file ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Parse CSV line handling quoted values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Start or end of quoted value
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last value
    values.push(current.trim());

    return values;
  }

  /**
   * Delete old log files
   */
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = await this.getLogFiles();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;
      let deletedSize = 0;

      for (const file of files) {
        if (file.modified < cutoffDate) {
          await fs.remove(file.filepath);
          deletedCount++;
          deletedSize += file.size;

          logger.info(`Deleted old log file: ${file.filename}`);
        }
      }

      if (deletedCount > 0) {
        logger.info(
          `Cleanup complete: deleted ${deletedCount} files, freed ${this.formatFileSize(deletedSize)}`
        );
      }

      return { deletedCount, deletedSize };
    } catch (error) {
      logger.error('Failed to cleanup old logs:', error);
      throw error;
    }
  }

  /**
   * Export log data to different formats
   */
  async exportData(format, options = {}) {
    try {
      let data = [];

      if (options.filename) {
        // Export specific file
        const fileData = await this.readLogFile(options.filename, options);
        data = fileData.data;
      } else {
        // Export from database
        // This would query the database for data
        // For now, return empty array
        data = [];
      }

      switch (format.toLowerCase()) {
        case 'json':
          return JSON.stringify(data, null, 2);

        case 'csv':
          if (data.length === 0) {
            return '';
          }

          const headers = Object.keys(data[0]).join(',');
          const rows = data.map(row =>
            Object.values(row)
              .map(value => {
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              })
              .join(',')
          );

          return headers + '\n' + rows.join('\n');

        case 'xml':
          let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<ModbusData>\n';
          for (const row of data) {
            xml += '  <Record>\n';
            for (const [key, value] of Object.entries(row)) {
              xml += `    <${key}>${this.escapeXML(value)}</${key}>\n`;
            }
            xml += '  </Record>\n';
          }
          xml += '</ModbusData>';
          return xml;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      logger.error(`Failed to export data in ${format} format:`, error);
      throw error;
    }
  }

  /**
   * Get logging statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      isLogging: this.isLogging,
      queueSize: this.logQueue.length,
      csvStreamsOpen: this.csvWriteStreams.size,
      uptime: this.stats.startTime ? Date.now() - new Date(this.stats.startTime).getTime() : 0,
    };
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Escape XML special characters
   */
  escapeXML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Shutdown data logger
   */
  async shutdown() {
    logger.info('Shutting down Modbus data logger...');

    // Clear flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Stop logging and flush remaining data
    if (this.isLogging) {
      await this.stopLogging();
    } else {
      await this.flushLogQueue();
      await this.closeAllCSVStreams();
    }

    logger.info('Modbus data logger shutdown complete');
  }
}

module.exports = ModbusDataLogger;
