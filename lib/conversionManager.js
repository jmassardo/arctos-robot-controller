/**
 * Conversion Manager
 * Orchestrates file conversion by managing converters and handling the conversion pipeline
 */

const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../logger');

// Import converters
const DxfConverter = require('./dxfConverter');
const RobotLanguageConverter = require('./robotLanguageConverter');
const CamPostConverter = require('./camPostConverter');

class ConversionManager {
  constructor() {
    this.converters = new Map();
    this.conversionJobs = new Map();
    this.tempDirectory = path.join(process.cwd(), 'temp', 'conversions');

    this.registerConverters();
    this.ensureTempDirectory();
  }

  /**
   * Register all available converters
   */
  registerConverters() {
    // Register format converters
    const dxfConverter = new DxfConverter();
    const robotConverter = new RobotLanguageConverter();
    const camConverter = new CamPostConverter();

    this.converters.set('dxf', dxfConverter);
    this.converters.set('robot', robotConverter);
    this.converters.set('cam', camConverter);

    logger.info(`Registered ${this.converters.size} file converters`);
  }

  /**
   * Ensure temporary directory exists
   */
  async ensureTempDirectory() {
    try {
      await fs.ensureDir(this.tempDirectory);
    } catch (error) {
      logger.error('Failed to create temp directory:', error);
    }
  }

  /**
   * Get list of supported formats
   * @returns {Array} List of supported formats with details
   */
  getSupportedFormats() {
    const formats = [];

    this.converters.forEach((converter, key) => {
      formats.push({
        id: key,
        name: converter.formatName,
        extensions: converter.supportedExtensions,
        description: converter.description || `${converter.formatName} file converter`,
      });
    });

    return formats;
  }

  /**
   * Detect file format and return best converter
   * @param {string} filename - Original filename
   * @param {Buffer|string} content - File content
   * @returns {Object} Detection result with converter
   */
  detectFormat(filename, content) {
    const detectionResults = [];

    // Test all converters
    this.converters.forEach((converter, key) => {
      try {
        const result = converter.detect(filename, content);
        if (result.canHandle) {
          detectionResults.push({
            ...result,
            converter,
            converterKey: key,
          });
        }
      } catch (error) {
        logger.error(`Error in ${key} converter detection:`, error);
      }
    });

    // Sort by confidence (highest first)
    detectionResults.sort((a, b) => b.confidence - a.confidence);

    if (detectionResults.length === 0) {
      return {
        success: false,
        error: 'No suitable converter found for this file format',
        supportedFormats: this.getSupportedFormats(),
      };
    }

    return {
      success: true,
      bestMatch: detectionResults[0],
      allMatches: detectionResults,
    };
  }

  /**
   * Convert file to G-code
   * @param {Buffer|string} content - File content
   * @param {string} filename - Original filename
   * @param {Object} options - Conversion options
   * @param {string} converterKey - Specific converter to use (optional)
   * @returns {Promise<Object>} Conversion result
   */
  async convertFile(content, filename, options = {}, converterKey = null) {
    const conversionId = this.generateConversionId();

    try {
      logger.info(`Starting conversion ${conversionId} for file: ${filename}`);

      // Update job status
      this.updateJobStatus(conversionId, 'detecting', 'Detecting file format');

      let converterToUse;
      let detectionResult;

      if (converterKey && this.converters.has(converterKey)) {
        // Use specified converter
        converterToUse = this.converters.get(converterKey);
        detectionResult = { success: true, bestMatch: { converter: converterToUse } };
      } else {
        // Auto-detect format
        detectionResult = this.detectFormat(filename, content);
        if (!detectionResult.success) {
          this.updateJobStatus(conversionId, 'error', detectionResult.error);
          return {
            success: false,
            conversionId,
            error: detectionResult.error,
            supportedFormats: detectionResult.supportedFormats,
          };
        }
        converterToUse = detectionResult.bestMatch.converter;
      }

      this.updateJobStatus(conversionId, 'converting', 'Converting file to G-code');

      // Perform conversion
      const startTime = Date.now();
      const conversionResult = await converterToUse.convert(content, options);
      const conversionTime = Date.now() - startTime;

      if (!conversionResult.success) {
        this.updateJobStatus(conversionId, 'error', conversionResult.error);
        return {
          success: false,
          conversionId,
          error: conversionResult.error,
          details: conversionResult.details,
        };
      }

      this.updateJobStatus(conversionId, 'validating', 'Validating converted G-code');

      // Validate converted G-code
      const validation = converterToUse.validate(conversionResult.gcode);

      this.updateJobStatus(conversionId, 'completed', 'Conversion completed successfully');

      // Prepare result
      const result = {
        success: true,
        conversionId,
        gcode: conversionResult.gcode,
        metadata: {
          originalFilename: filename,
          converter: converterToUse.formatName,
          detectedFormat: detectionResult.bestMatch?.format,
          confidence: detectionResult.bestMatch?.confidence,
          conversionTime,
          timestamp: new Date().toISOString(),
        },
        validation,
        statistics: {
          ...validation.statistics,
          inputSize: typeof content === 'string' ? content.length : content.length,
          outputSize: conversionResult.gcode.length,
          compressionRatio:
            typeof content === 'string'
              ? conversionResult.gcode.length / content.length
              : conversionResult.gcode.length / content.length,
        },
        warnings: conversionResult.warnings || [],
        boundingBox: conversionResult.boundingBox,
      };

      // Save conversion result to temp file for preview
      await this.saveConversionResult(conversionId, result);

      logger.info(`Conversion ${conversionId} completed successfully in ${conversionTime}ms`);
      return result;
    } catch (error) {
      logger.error(`Conversion ${conversionId} failed:`, error);
      this.updateJobStatus(conversionId, 'error', error.message);

      return {
        success: false,
        conversionId,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      };
    }
  }

  /**
   * Get conversion job status
   * @param {string} conversionId - Conversion job ID
   * @returns {Object} Job status
   */
  getConversionStatus(conversionId) {
    return (
      this.conversionJobs.get(conversionId) || {
        status: 'not_found',
        message: 'Conversion job not found',
      }
    );
  }

  /**
   * Update conversion job status
   * @param {string} conversionId - Conversion job ID
   * @param {string} status - Job status
   * @param {string} message - Status message
   */
  updateJobStatus(conversionId, status, message) {
    const job = this.conversionJobs.get(conversionId) || {};
    job.status = status;
    job.message = message;
    job.updatedAt = new Date().toISOString();

    this.conversionJobs.set(conversionId, job);
  }

  /**
   * Generate unique conversion ID
   * @returns {string} Unique conversion ID
   */
  generateConversionId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Save conversion result to temporary file
   * @param {string} conversionId - Conversion ID
   * @param {Object} result - Conversion result
   */
  async saveConversionResult(conversionId, result) {
    try {
      const filePath = path.join(this.tempDirectory, `${conversionId}.json`);
      await fs.writeJson(filePath, result, { spaces: 2 });

      // Also save just the G-code
      const gcodePath = path.join(this.tempDirectory, `${conversionId}.gcode`);
      await fs.writeFile(gcodePath, result.gcode);
    } catch (error) {
      logger.error('Failed to save conversion result:', error);
    }
  }

  /**
   * Load conversion result from temporary file
   * @param {string} conversionId - Conversion ID
   * @returns {Promise<Object>} Conversion result
   */
  async loadConversionResult(conversionId) {
    try {
      const filePath = path.join(this.tempDirectory, `${conversionId}.json`);
      return await fs.readJson(filePath);
    } catch (error) {
      logger.error('Failed to load conversion result:', error);
      return null;
    }
  }

  /**
   * Clean up old conversion files
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   */
  async cleanupOldConversions(maxAgeHours = 24) {
    try {
      const files = await fs.readdir(this.tempDirectory);
      const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDirectory, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.remove(filePath);
          logger.info(`Cleaned up old conversion file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup old conversions:', error);
    }
  }

  /**
   * Preview conversion without full processing
   * @param {Buffer|string} content - File content
   * @param {string} filename - Original filename
   * @param {number} maxLines - Maximum lines to process for preview
   * @returns {Promise<Object>} Preview result
   */
  async previewConversion(content, filename, maxLines = 100) {
    try {
      const detectionResult = this.detectFormat(filename, content);
      if (!detectionResult.success) {
        return detectionResult;
      }

      const converter = detectionResult.bestMatch.converter;

      // Create preview-specific options
      const previewOptions = {
        preview: true,
        maxLines,
        skipValidation: true,
      };

      const result = await converter.convert(content, previewOptions);

      return {
        success: true,
        preview: true,
        detectedFormat: detectionResult.bestMatch.format,
        confidence: detectionResult.bestMatch.confidence,
        sampleGcode: result.gcode ? result.gcode.split('\n').slice(0, maxLines).join('\n') : '',
        estimatedLines: result.estimatedTotalLines || 0,
        warnings: result.warnings || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = ConversionManager;
