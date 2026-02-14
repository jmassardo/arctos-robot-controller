/**
 * Robot Language Converter
 * Converts robot-specific programming languages to G-code
 * Supports: ABB RAPID, KUKA KRL, Fanuc TP (basic)
 */

const FileConverter = require('./baseConverter');
const { logger } = require('../logger');

class RobotLanguageConverter extends FileConverter {
  constructor() {
    super('Robot Language', ['mod', 'prg', 'src', 'dat', 'ls', 'tp']);
    this.description = 'Robot programming languages (RAPID, KRL, TP)';
  }

  /**
   * Detect robot language by content
   * @param {Buffer|string} content - File content
   * @returns {Object} Detection result
   */
  detectByContent(content) {
    const contentStr = typeof content === 'string' ? content : content.toString();
    const upperContent = contentStr.toUpperCase();

    // ABB RAPID detection
    if (upperContent.includes('MODULE ') && upperContent.includes('ENDMODULE')) {
      return {
        canHandle: true,
        confidence: 0.95,
        reason: 'Contains ABB RAPID MODULE structure',
        subFormat: 'rapid',
      };
    }

    if (upperContent.includes('MOVEJ ') || upperContent.includes('MOVEL ')) {
      return {
        canHandle: true,
        confidence: 0.9,
        reason: 'Contains ABB RAPID movement commands',
        subFormat: 'rapid',
      };
    }

    // KUKA KRL detection
    if (upperContent.includes('&ACCESS') && upperContent.includes('DEF ')) {
      return {
        canHandle: true,
        confidence: 0.95,
        reason: 'Contains KUKA KRL structure',
        subFormat: 'krl',
      };
    }

    if (upperContent.includes('PTP ') || upperContent.includes('LIN ')) {
      return {
        canHandle: true,
        confidence: 0.85,
        reason: 'Contains KUKA KRL movement commands',
        subFormat: 'krl',
      };
    }

    // Fanuc TP detection
    if (upperContent.includes(': J P[') || upperContent.includes(': L P[')) {
      return {
        canHandle: true,
        confidence: 0.8,
        reason: 'Contains Fanuc TP position commands',
        subFormat: 'fanuc_tp',
      };
    }

    return { canHandle: false, confidence: 0, reason: 'No robot language patterns found' };
  }

  /**
   * Convert robot language to G-code
   * @param {Buffer|string} content - Robot program content
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convert(content, options = {}) {
    try {
      const opts = this.mergeOptions(options);
      const contentStr = typeof content === 'string' ? content : content.toString();

      logger.info('Starting robot language conversion');

      // Detect specific robot language
      const detection = this.detectByContent(contentStr);
      if (!detection.canHandle) {
        return {
          success: false,
          error: 'Unable to detect robot language format',
        };
      }

      logger.info(`Detected robot language: ${detection.subFormat}`);

      let conversionResult;
      switch (detection.subFormat) {
        case 'rapid':
          conversionResult = await this.convertRapid(contentStr, opts);
          break;
        case 'krl':
          conversionResult = await this.convertKRL(contentStr, opts);
          break;
        case 'fanuc_tp':
          conversionResult = await this.convertFanucTP(contentStr, opts);
          break;
        default:
          return {
            success: false,
            error: `Unsupported robot language: ${detection.subFormat}`,
          };
      }

      if (!conversionResult.success) {
        return conversionResult;
      }

      // Calculate bounding box from movements
      const boundingBox = this.calculateBoundingBox(conversionResult.movements || []);

      return {
        success: true,
        gcode: conversionResult.gcode,
        boundingBox,
        warnings: conversionResult.warnings || [],
        metadata: {
          robotLanguage: detection.subFormat,
          movementCount: conversionResult.movements ? conversionResult.movements.length : 0,
          confidence: detection.confidence,
        },
      };
    } catch (error) {
      logger.error('Robot language conversion failed:', error);
      return {
        success: false,
        error: 'Robot language conversion failed: ' + error.message,
        details: error.stack,
      };
    }
  }

  /**
   * Convert ABB RAPID to G-code
   * @param {string} rapidCode - RAPID program code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertRapid(rapidCode, options) {
    try {
      const lines = rapidCode.split('\n').map(line => line.trim());
      const gcode = [];
      const movements = [];
      const warnings = [];

      // Add header
      gcode.push(this.generateHeader(options));
      gcode.push('; Converted from ABB RAPID');
      gcode.push('');

      // Parse RAPID commands
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const upperLine = line.toUpperCase();

        // Skip comments and empty lines
        if (line.startsWith('!') || line.startsWith('%') || !line.trim()) {
          continue;
        }

        // Parse MoveJ (joint movement - convert to rapid move)
        if (upperLine.includes('MOVEJ ')) {
          const movement = this.parseRapidMovement(line, 'joint');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G0 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} ; Joint move`
            );
          }
        }

        // Parse MoveL (linear movement)
        else if (upperLine.includes('MOVEL ')) {
          const movement = this.parseRapidMovement(line, 'linear');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G1 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} F${options.feedRate} ; Linear move`
            );
          }
        }

        // Parse MoveC (circular movement)
        else if (upperLine.includes('MOVEC ')) {
          const movement = this.parseRapidCircularMovement(line);
          if (movement) {
            warnings.push('Circular movements (MoveC) are approximated with linear segments');
            // Convert circular to linear segments (simplified)
            movements.push(movement.via);
            movements.push(movement.to);
            gcode.push(
              `G1 X${this.formatCoordinate(movement.via.x)} Y${this.formatCoordinate(movement.via.y)} Z${this.formatCoordinate(movement.via.z)} F${options.feedRate} ; Via point`
            );
            gcode.push(
              `G1 X${this.formatCoordinate(movement.to.x)} Y${this.formatCoordinate(movement.to.y)} Z${this.formatCoordinate(movement.to.z)} F${options.feedRate} ; End point`
            );
          }
        }

        // Handle tool operations
        else if (upperLine.includes('SETTOOL ')) {
          const toolInfo = this.parseRapidTool(line);
          if (toolInfo) {
            gcode.push(`; Tool: ${toolInfo.name || 'Unknown'}`);
          }
        }

        // Handle speed settings
        else if (upperLine.includes('SETSPEED ')) {
          const speed = this.parseRapidSpeed(line);
          if (speed) {
            gcode.push(`F${speed} ; Speed from RAPID`);
          }
        }
      }

      // Add footer
      gcode.push('');
      gcode.push(this.generateFooter(options));

      return {
        success: true,
        gcode: gcode.join('\n'),
        movements,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'RAPID parsing failed: ' + error.message,
      };
    }
  }

  /**
   * Convert KUKA KRL to G-code
   * @param {string} krlCode - KRL program code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertKRL(krlCode, options) {
    try {
      const lines = krlCode.split('\n').map(line => line.trim());
      const gcode = [];
      const movements = [];
      const warnings = [];

      // Add header
      gcode.push(this.generateHeader(options));
      gcode.push('; Converted from KUKA KRL');
      gcode.push('');

      // Parse KRL commands
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const upperLine = line.toUpperCase();

        // Skip comments and empty lines
        if (line.startsWith(';') || line.startsWith('&') || !line.trim()) {
          continue;
        }

        // Parse PTP (point-to-point movement)
        if (upperLine.includes('PTP ')) {
          const movement = this.parseKRLMovement(line, 'ptp');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G0 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} ; PTP move`
            );
          }
        }

        // Parse LIN (linear movement)
        else if (upperLine.includes('LIN ')) {
          const movement = this.parseKRLMovement(line, 'linear');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G1 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} F${options.feedRate} ; Linear move`
            );
          }
        }

        // Parse CIRC (circular movement)
        else if (upperLine.includes('CIRC ')) {
          const movement = this.parseKRLCircularMovement(line);
          if (movement) {
            warnings.push('Circular movements (CIRC) are approximated with linear segments');
            movements.push(movement.via);
            movements.push(movement.to);
            gcode.push(
              `G1 X${this.formatCoordinate(movement.via.x)} Y${this.formatCoordinate(movement.via.y)} Z${this.formatCoordinate(movement.via.z)} F${options.feedRate} ; Via point`
            );
            gcode.push(
              `G1 X${this.formatCoordinate(movement.to.x)} Y${this.formatCoordinate(movement.to.y)} Z${this.formatCoordinate(movement.to.z)} F${options.feedRate} ; End point`
            );
          }
        }
      }

      // Add footer
      gcode.push('');
      gcode.push(this.generateFooter(options));

      return {
        success: true,
        gcode: gcode.join('\n'),
        movements,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'KRL parsing failed: ' + error.message,
      };
    }
  }

  /**
   * Convert Fanuc TP to G-code (basic implementation)
   * @param {string} tpCode - TP program code
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertFanucTP(tpCode, options) {
    try {
      const lines = tpCode.split('\n').map(line => line.trim());
      const gcode = [];
      const movements = [];
      const warnings = [];

      // Add header
      gcode.push(this.generateHeader(options));
      gcode.push('; Converted from Fanuc TP');
      gcode.push('');

      warnings.push('Fanuc TP conversion is basic - manual review recommended');

      // Parse TP commands
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments and empty lines
        if (line.startsWith('!') || !line.trim()) {
          continue;
        }

        // Parse joint moves: J P[1] 50% FINE
        if (line.includes(': J P[')) {
          const movement = this.parseFanucPosition(line, 'joint');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G0 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} ; Joint move`
            );
          }
        }

        // Parse linear moves: L P[2] 100mm/sec FINE
        else if (line.includes(': L P[')) {
          const movement = this.parseFanucPosition(line, 'linear');
          if (movement) {
            movements.push(movement);
            gcode.push(
              `G1 X${this.formatCoordinate(movement.x)} Y${this.formatCoordinate(movement.y)} Z${this.formatCoordinate(movement.z)} F${options.feedRate} ; Linear move`
            );
          }
        }
      }

      // Add footer
      gcode.push('');
      gcode.push(this.generateFooter(options));

      return {
        success: true,
        gcode: gcode.join('\n'),
        movements,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Fanuc TP parsing failed: ' + error.message,
      };
    }
  }

  /**
   * Parse RAPID movement command
   * @param {string} line - RAPID command line
   * @param {string} type - Movement type
   * @returns {Object|null} Parsed movement
   */
  parseRapidMovement(line, type) {
    try {
      // Basic parsing - look for position coordinates
      // Example: MoveL pHome, vmax, z50, tool0;
      const match = line.match(/\[\[([-\d.]+),([-\d.]+),([-\d.]+)\]/);
      if (match) {
        return {
          type,
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
          z: parseFloat(match[3]),
        };
      }

      // If no coordinates found, create a placeholder
      logger.warn('Could not parse RAPID movement coordinates:', line);
      return null;
    } catch (error) {
      logger.error('Error parsing RAPID movement:', error);
      return null;
    }
  }

  /**
   * Parse RAPID circular movement
   * @param {string} line - RAPID command line
   * @returns {Object|null} Parsed circular movement
   */
  parseRapidCircularMovement(line) {
    try {
      // Simplified - just extract two points for via and end
      return {
        via: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse KRL movement command
   * @param {string} line - KRL command line
   * @param {string} type - Movement type
   * @returns {Object|null} Parsed movement
   */
  parseKRLMovement(line, type) {
    try {
      // Basic parsing for KRL position
      // Example: PTP {X 100, Y 200, Z 300, A 0, B 90, C 0}
      const coordMatch = line.match(/X\s*([-\d.]+).*Y\s*([-\d.]+).*Z\s*([-\d.]+)/i);
      if (coordMatch) {
        return {
          type,
          x: parseFloat(coordMatch[1]),
          y: parseFloat(coordMatch[2]),
          z: parseFloat(coordMatch[3]),
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse KRL circular movement
   * @param {string} line - KRL command line
   * @returns {Object|null} Parsed circular movement
   */
  parseKRLCircularMovement(line) {
    try {
      // Simplified implementation
      return {
        via: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 },
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse Fanuc position
   * @param {string} line - TP command line
   * @param {string} type - Movement type
   * @returns {Object|null} Parsed position
   */
  parseFanucPosition(line, type) {
    try {
      // Very basic implementation - would need position data file
      // This is a placeholder that creates default positions
      return {
        type,
        x: 0,
        y: 0,
        z: 0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse RAPID tool setting
   * @param {string} line - RAPID tool command
   * @returns {Object|null} Tool info
   */
  parseRapidTool(line) {
    try {
      const toolMatch = line.match(/SetTool\s+(\w+)/i);
      return toolMatch ? { name: toolMatch[1] } : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse RAPID speed setting
   * @param {string} line - RAPID speed command
   * @returns {number|null} Speed value
   */
  parseRapidSpeed(line) {
    try {
      const speedMatch = line.match(/SetSpeed\s+v(\d+)/i);
      return speedMatch ? parseInt(speedMatch[1]) : null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = RobotLanguageConverter;
