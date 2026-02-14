/**
 * CAM Post-Processor Converter
 * Converts CAM software outputs and CNC-specific G-code dialects to standard G-code
 * Supports: Fusion 360, Mastercam, SolidWorks CAM, Haas, Mazak, Okuma formats
 */

const FileConverter = require('./baseConverter');
const { logger } = require('../logger');

class CamPostConverter extends FileConverter {
  constructor() {
    super('CAM Post-Processor', ['nc', 'cnc', 'tap', 'h', 'txt', 'prg']);
    this.description = 'CAM software outputs and CNC-specific G-code dialects';
  }

  /**
   * Detect CAM/CNC format by content
   * @param {Buffer|string} content - File content
   * @returns {Object} Detection result
   */
  detectByContent(content) {
    const contentStr = typeof content === 'string' ? content : content.toString();
    const upperContent = contentStr.toUpperCase();
    const lines = contentStr.split('\n').slice(0, 20); // Check first 20 lines

    // Fusion 360 detection
    if (upperContent.includes('AUTODESK') || upperContent.includes('FUSION 360')) {
      return {
        canHandle: true,
        confidence: 0.95,
        reason: 'Contains Fusion 360 header',
        subFormat: 'fusion360',
      };
    }

    // Mastercam detection
    if (upperContent.includes('MASTERCAM') || lines.some(line => line.includes('(MASTERCAM'))) {
      return {
        canHandle: true,
        confidence: 0.95,
        reason: 'Contains Mastercam header',
        subFormat: 'mastercam',
      };
    }

    // SolidWorks CAM detection
    if (upperContent.includes('SOLIDWORKS') || upperContent.includes('CAMWORKS')) {
      return {
        canHandle: true,
        confidence: 0.9,
        reason: 'Contains SolidWorks CAM header',
        subFormat: 'solidworks',
      };
    }

    // Haas detection
    if (
      upperContent.includes('%\nO') &&
      (upperContent.includes('(HAAS') || upperContent.includes('M30%'))
    ) {
      return {
        canHandle: true,
        confidence: 0.85,
        reason: 'Contains Haas program structure',
        subFormat: 'haas',
      };
    }

    // Mazak detection
    if (upperContent.includes(':') && upperContent.includes('N') && upperContent.includes('M99')) {
      return {
        canHandle: true,
        confidence: 0.75,
        reason: 'Contains Mazak program structure',
        subFormat: 'mazak',
      };
    }

    // Generic G-code with post-processor artifacts
    if (this.hasGCodeStructure(contentStr)) {
      return {
        canHandle: true,
        confidence: 0.6,
        reason: 'Contains G-code structure with post-processor features',
        subFormat: 'generic_cam',
      };
    }

    return { canHandle: false, confidence: 0, reason: 'No CAM/CNC patterns found' };
  }

  /**
   * Check if content has basic G-code structure
   * @param {string} content - Content to check
   * @returns {boolean} True if has G-code structure
   */
  hasGCodeStructure(content) {
    const upperContent = content.toUpperCase();
    const hasGCodes = /G\d+/g.test(upperContent);
    const hasMCodes = /M\d+/g.test(upperContent);
    const hasCoordinates = /[XYZ]-?\d+/g.test(upperContent);

    return hasGCodes && (hasMCodes || hasCoordinates);
  }

  /**
   * Convert CAM/CNC format to standard G-code
   * @param {Buffer|string} content - CAM/CNC file content
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convert(content, options = {}) {
    try {
      const opts = this.mergeOptions(options);
      const contentStr = typeof content === 'string' ? content : content.toString();

      logger.info('Starting CAM post-processor conversion');

      // Detect specific CAM format
      const detection = this.detectByContent(contentStr);
      if (!detection.canHandle) {
        return {
          success: false,
          error: 'Unable to detect CAM/CNC format',
        };
      }

      logger.info(`Detected CAM format: ${detection.subFormat}`);

      let conversionResult;
      switch (detection.subFormat) {
        case 'fusion360':
          conversionResult = await this.convertFusion360(contentStr, opts);
          break;
        case 'mastercam':
          conversionResult = await this.convertMastercam(contentStr, opts);
          break;
        case 'solidworks':
          conversionResult = await this.convertSolidWorks(contentStr, opts);
          break;
        case 'haas':
          conversionResult = await this.convertHaas(contentStr, opts);
          break;
        case 'mazak':
          conversionResult = await this.convertMazak(contentStr, opts);
          break;
        case 'generic_cam':
          conversionResult = await this.convertGenericCAM(contentStr, opts);
          break;
        default:
          return {
            success: false,
            error: `Unsupported CAM format: ${detection.subFormat}`,
          };
      }

      return {
        success: true,
        gcode: conversionResult.gcode,
        boundingBox: conversionResult.boundingBox,
        warnings: conversionResult.warnings || [],
        metadata: {
          camFormat: detection.subFormat,
          originalLineCount: contentStr.split('\n').length,
          processedLineCount: conversionResult.gcode.split('\n').length,
          confidence: detection.confidence,
        },
      };
    } catch (error) {
      logger.error('CAM post-processor conversion failed:', error);
      return {
        success: false,
        error: 'CAM conversion failed: ' + error.message,
        details: error.stack,
      };
    }
  }

  /**
   * Convert Fusion 360 post-processor output
   * @param {string} content - Fusion 360 G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertFusion360(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      // Process each line
      for (let line of lines) {
        line = line.trim();

        // Skip empty lines and certain comments
        if (!line || line.startsWith('(AUTODESK')) {
          continue;
        }

        // Convert Fusion 360 specific commands
        if (line.includes('G54.1')) {
          // Convert extended work coordinate system
          line = line.replace('G54.1', 'G54');
          warnings.push('Converted G54.1 (extended work coordinates) to G54');
        }

        // Handle Fusion 360 tool changes
        if (line.includes('M6')) {
          processedLines.push('M5 ; Stop spindle for tool change');
          processedLines.push(line);
          processedLines.push('M3 ; Restart spindle after tool change');
          continue;
        }

        // Extract coordinates for bounding box
        this.extractCoordinates(line, coordinates);

        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Fusion 360 conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Convert Mastercam post-processor output
   * @param {string} content - Mastercam G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertMastercam(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      for (let line of lines) {
        line = line.trim();

        if (!line) {
          continue;
        }

        // Remove Mastercam specific comments
        if (line.startsWith('(MASTERCAM')) {
          continue;
        }

        // Handle Mastercam tool calls
        if (line.match(/T\d+\s+M6/)) {
          // Tool change with automatic tool changer
          processedLines.push(line);
          processedLines.push('G43 H' + line.match(/T(\d+)/)[1] + ' ; Height offset');
          continue;
        }

        // Convert Mastercam specific G-codes
        if (line.includes('G187')) {
          // High speed machining
          warnings.push('Removed G187 (high speed machining) - not supported');
          continue;
        }

        this.extractCoordinates(line, coordinates);
        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Mastercam conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Convert SolidWorks CAM output
   * @param {string} content - SolidWorks G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertSolidWorks(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      for (let line of lines) {
        line = line.trim();

        if (!line) {
          continue;
        }

        // Remove SolidWorks specific headers
        if (line.includes('SOLIDWORKS') || line.includes('CAMWORKS')) {
          continue;
        }

        // Handle SolidWorks specific commands
        if (line.includes('CYCLE84')) {
          // Tapping cycle - convert to basic operations
          warnings.push('Converted CYCLE84 (tapping) to basic operations');
          processedLines.push('G1 Z-5 F100 ; Simplified tapping cycle');
          processedLines.push('G0 Z5');
          continue;
        }

        this.extractCoordinates(line, coordinates);
        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'SolidWorks conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Convert Haas specific G-code
   * @param {string} content - Haas G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertHaas(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      // Remove program markers
      let inProgram = false;

      for (let line of lines) {
        line = line.trim();

        // Handle program start/end markers
        if (line.startsWith('%')) {
          if (!inProgram) {
            inProgram = true;
            continue; // Skip first %
          } else {
            // End of program
            processedLines.push('M30 ; End program');
            break;
          }
        }

        if (!line || !inProgram) {
          continue;
        }

        // Remove program number
        if (line.match(/^O\d+/)) {
          continue;
        }

        // Convert Haas specific features
        if (line.includes('G187')) {
          warnings.push('Removed G187 (corner rounding) - not supported');
          continue;
        }

        // Handle Haas macro calls
        if (line.includes('G65')) {
          warnings.push('Macro call G65 removed - not supported');
          continue;
        }

        this.extractCoordinates(line, coordinates);
        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Haas conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Convert Mazak specific G-code
   * @param {string} content - Mazak G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertMazak(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      for (let line of lines) {
        line = line.trim();

        if (!line) {
          continue;
        }

        // Handle Mazak format (remove : prefix)
        if (line.startsWith(':')) {
          line = line.substring(1);
        }

        // Convert M99 (subprogram return) to M30
        if (line.includes('M99')) {
          line = line.replace('M99', 'M30');
        }

        // Handle Mazak specific G-codes
        if (line.includes('G68')) {
          warnings.push('G68 coordinate rotation simplified');
          continue;
        }

        this.extractCoordinates(line, coordinates);
        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Mazak conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Convert generic CAM output
   * @param {string} content - Generic CAM G-code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertGenericCAM(content, options) {
    try {
      const lines = content.split('\n');
      const processedLines = [];
      const warnings = [];
      const coordinates = [];

      for (let line of lines) {
        line = line.trim();

        if (!line || line.startsWith('%')) {
          continue;
        }

        // Remove common post-processor artifacts
        if (line.match(/^O\d+/) || line.includes('(POST')) {
          continue;
        }

        // Basic cleanup of unsupported features
        if (line.includes('G187') || line.includes('G68') || line.includes('G65')) {
          warnings.push(`Removed unsupported feature: ${line}`);
          continue;
        }

        this.extractCoordinates(line, coordinates);
        processedLines.push(line);
      }

      const boundingBox = this.calculateBoundingBox(coordinates);

      return {
        success: true,
        gcode: processedLines.join('\n'),
        boundingBox,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Generic CAM conversion failed: ' + error.message,
      };
    }
  }

  /**
   * Extract coordinate values from G-code line
   * @param {string} line - G-code line
   * @param {Array} coordinates - Array to store coordinates
   */
  extractCoordinates(line, coordinates) {
    const xMatch = line.match(/X([-+]?\d*\.?\d+)/);
    const yMatch = line.match(/Y([-+]?\d*\.?\d+)/);
    const zMatch = line.match(/Z([-+]?\d*\.?\d+)/);

    if (xMatch || yMatch || zMatch) {
      coordinates.push({
        x: xMatch ? parseFloat(xMatch[1]) : 0,
        y: yMatch ? parseFloat(yMatch[1]) : 0,
        z: zMatch ? parseFloat(zMatch[1]) : 0,
      });
    }
  }
}

module.exports = CamPostConverter;
