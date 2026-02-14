/**
 * DXF File Converter
 * Converts DXF (Drawing Exchange Format) files to G-code
 * Supports 2D entities: lines, arcs, circles, polylines
 */

const FileConverter = require('./baseConverter');
const DxfParser = require('dxf-parser');
const { logger } = require('../logger');

class DxfConverter extends FileConverter {
  constructor() {
    super('DXF', ['dxf']);
    this.description = 'AutoCAD DXF (Drawing Exchange Format) 2D drawing files';
  }

  /**
   * Detect DXF files by content
   * @param {Buffer|string} content - File content
   * @returns {Object} Detection result
   */
  detectByContent(content) {
    const contentStr = typeof content === 'string' ? content : content.toString();

    // Check for DXF header markers
    if (contentStr.includes('0\nSECTION') && contentStr.includes('2\nENTITIES')) {
      return {
        canHandle: true,
        confidence: 0.9,
        reason: 'Contains DXF structure markers',
      };
    }

    // Check for DXF header
    if (contentStr.includes('999\nDXF')) {
      return {
        canHandle: true,
        confidence: 0.95,
        reason: 'Contains DXF header',
      };
    }

    return { canHandle: false, confidence: 0, reason: 'No DXF markers found' };
  }

  /**
   * Convert DXF content to G-code
   * @param {Buffer|string} content - DXF file content
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convert(content, options = {}) {
    try {
      const opts = this.mergeOptions(options);
      const contentStr = typeof content === 'string' ? content : content.toString();

      logger.info('Starting DXF conversion');

      // Parse DXF file
      const parser = new DxfParser();
      const dxf = parser.parseSync(contentStr);

      if (!dxf) {
        return {
          success: false,
          error: 'Failed to parse DXF file - invalid format',
        };
      }

      // Extract entities
      const entities = this.extractEntities(dxf);
      if (entities.length === 0) {
        return {
          success: false,
          error: 'No drawable entities found in DXF file',
        };
      }

      logger.info(`Found ${entities.length} entities in DXF file`);

      // Convert entities to toolpaths
      const toolpaths = this.entitiesToToolpaths(entities, opts);

      // Optimize toolpath order
      const optimizedPaths = this.optimizeToolpathOrder(toolpaths, opts);

      // Generate G-code
      const gcode = this.generateGCode(optimizedPaths, opts);

      // Calculate bounding box
      const allPoints = optimizedPaths
        .flat()
        .map(segment => segment.points)
        .flat();
      const boundingBox = this.calculateBoundingBox(allPoints);

      const result = {
        success: true,
        gcode,
        boundingBox,
        warnings: [],
        metadata: {
          entityCount: entities.length,
          toolpathCount: optimizedPaths.length,
          units: dxf.header ? dxf.header.$INSUNITS : 'unknown',
        },
      };

      // Add preview mode limitations
      if (opts.preview && opts.maxLines) {
        const lines = gcode.split('\n');
        if (lines.length > opts.maxLines) {
          result.gcode =
            lines.slice(0, opts.maxLines).join('\n') + '\n; ... (truncated for preview)';
          result.estimatedTotalLines = lines.length;
        }
      }

      return result;
    } catch (error) {
      logger.error('DXF conversion failed:', error);
      return {
        success: false,
        error: 'DXF conversion failed: ' + error.message,
        details: error.stack,
      };
    }
  }

  /**
   * Extract drawable entities from parsed DXF
   * @param {Object} dxf - Parsed DXF object
   * @returns {Array} Array of drawable entities
   */
  extractEntities(dxf) {
    const entities = [];

    if (dxf.entities) {
      // Group entities by layer for organization
      const entitiesByLayer = {};

      dxf.entities.forEach(entity => {
        const layer = entity.layer || '0';
        if (!entitiesByLayer[layer]) {
          entitiesByLayer[layer] = [];
        }

        // Filter supported entity types
        if (this.isSupportedEntity(entity)) {
          entitiesByLayer[layer].push(entity);
        }
      });

      // Flatten entities (could preserve layer info for advanced processing)
      Object.values(entitiesByLayer).forEach(layerEntities => {
        entities.push(...layerEntities);
      });
    }

    return entities;
  }

  /**
   * Check if entity type is supported
   * @param {Object} entity - DXF entity
   * @returns {boolean} True if supported
   */
  isSupportedEntity(entity) {
    const supportedTypes = ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'POINT'];
    return supportedTypes.includes(entity.type);
  }

  /**
   * Convert entities to toolpaths
   * @param {Array} entities - DXF entities
   * @param {Object} options - Conversion options
   * @returns {Array} Array of toolpaths
   */
  entitiesToToolpaths(entities, options) {
    const toolpaths = [];

    entities.forEach(entity => {
      try {
        const toolpath = this.entityToToolpath(entity, options);
        if (toolpath) {
          toolpaths.push(toolpath);
        }
      } catch (error) {
        logger.warn(`Failed to convert entity ${entity.type}:`, error);
      }
    });

    return toolpaths;
  }

  /**
   * Convert single entity to toolpath
   * @param {Object} entity - DXF entity
   * @param {Object} options - Conversion options
   * @returns {Object} Toolpath object
   */
  entityToToolpath(entity, options) {
    switch (entity.type) {
      case 'LINE':
        return this.lineToToolpath(entity, options);
      case 'ARC':
        return this.arcToToolpath(entity, options);
      case 'CIRCLE':
        return this.circleToToolpath(entity, options);
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return this.polylineToToolpath(entity, options);
      case 'POINT':
        return this.pointToToolpath(entity, options);
      default:
        logger.warn(`Unsupported entity type: ${entity.type}`);
        return null;
    }
  }

  /**
   * Convert LINE entity to toolpath
   */
  lineToToolpath(entity, options) {
    return {
      type: 'line',
      points: [
        { x: entity.start.x, y: entity.start.y, z: entity.start.z || 0 },
        { x: entity.end.x, y: entity.end.y, z: entity.end.z || 0 },
      ],
      isClosed: false,
    };
  }

  /**
   * Convert ARC entity to toolpath
   */
  arcToToolpath(entity, options) {
    const segments = options.formatSpecific.arcSegments || 20;
    const points = [];

    const startAngle = entity.startAngle;
    const endAngle = entity.endAngle;
    const radius = entity.radius;
    const center = entity.center;

    // Handle angle wrap-around
    let totalAngle = endAngle - startAngle;
    if (totalAngle <= 0) {
      totalAngle += Math.PI * 2;
    }

    const angleStep = totalAngle / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + angleStep * i;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const z = center.z || 0;

      points.push({ x, y, z });
    }

    return {
      type: 'arc',
      points,
      isClosed: false,
      center,
      radius,
      startAngle,
      endAngle,
    };
  }

  /**
   * Convert CIRCLE entity to toolpath
   */
  circleToToolpath(entity, options) {
    const segments = options.formatSpecific.circleSegments || 32;
    const points = [];

    const radius = entity.radius;
    const center = entity.center;
    const angleStep = (Math.PI * 2) / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = angleStep * i;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      const z = center.z || 0;

      points.push({ x, y, z });
    }

    return {
      type: 'circle',
      points,
      isClosed: true,
      center,
      radius,
    };
  }

  /**
   * Convert POLYLINE/LWPOLYLINE entity to toolpath
   */
  polylineToToolpath(entity, options) {
    const points = [];

    entity.vertices.forEach(vertex => {
      points.push({
        x: vertex.x,
        y: vertex.y,
        z: vertex.z || 0,
      });
    });

    return {
      type: 'polyline',
      points,
      isClosed: entity.closed || false,
    };
  }

  /**
   * Convert POINT entity to toolpath (drilling operation)
   */
  pointToToolpath(entity, options) {
    return {
      type: 'point',
      points: [{ x: entity.position.x, y: entity.position.y, z: entity.position.z || 0 }],
      isClosed: false,
      operation: 'drill',
    };
  }

  /**
   * Optimize toolpath order to minimize travel time
   * @param {Array} toolpaths - Array of toolpaths
   * @param {Object} options - Conversion options
   * @returns {Array} Optimized toolpaths
   */
  optimizeToolpathOrder(toolpaths, options) {
    if (toolpaths.length <= 1) {
      return toolpaths;
    }

    // Simple nearest-neighbor optimization
    const optimized = [];
    const remaining = [...toolpaths];
    let currentPosition = { x: 0, y: 0, z: 0 };

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      remaining.forEach((toolpath, index) => {
        const startPoint = toolpath.points[0];
        const distance = Math.sqrt(
          Math.pow(startPoint.x - currentPosition.x, 2) +
            Math.pow(startPoint.y - currentPosition.y, 2)
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const nearestToolpath = remaining.splice(nearestIndex, 1)[0];
      optimized.push(nearestToolpath);
      currentPosition = nearestToolpath.points[nearestToolpath.points.length - 1];
    }

    return optimized;
  }

  /**
   * Generate G-code from toolpaths
   * @param {Array} toolpaths - Array of toolpaths
   * @param {Object} options - Conversion options
   * @returns {string} G-code
   */
  generateGCode(toolpaths, options) {
    const gcode = [];

    // Add header
    gcode.push(this.generateHeader(options));

    const currentPosition = { x: 0, y: 0, z: options.safeHeight };

    toolpaths.forEach((toolpath, index) => {
      gcode.push(`; Toolpath ${index + 1}: ${toolpath.type}`);

      if (toolpath.operation === 'drill') {
        // Drilling operation
        const point = toolpath.points[0];
        gcode.push(
          `G0 X${this.formatCoordinate(point.x)} Y${this.formatCoordinate(point.y)} ; Move to drill position`
        );
        gcode.push(
          `G1 Z${this.formatCoordinate(point.z - options.stepDown)} F${options.feedRate} ; Drill down`
        );
        gcode.push(`G0 Z${options.safeHeight} ; Retract`);
      } else {
        // Cutting operation
        const firstPoint = toolpath.points[0];

        // Rapid move to start position
        gcode.push(
          `G0 X${this.formatCoordinate(firstPoint.x)} Y${this.formatCoordinate(firstPoint.y)} ; Rapid to start`
        );

        // Plunge to cutting depth
        const cuttingDepth = firstPoint.z - options.stepDown;
        gcode.push(
          `G1 Z${this.formatCoordinate(cuttingDepth)} F${options.feedRate} ; Plunge to cutting depth`
        );

        // Cut the path
        for (let i = 1; i < toolpath.points.length; i++) {
          const point = toolpath.points[i];
          gcode.push(
            `G1 X${this.formatCoordinate(point.x)} Y${this.formatCoordinate(point.y)} F${options.feedRate}`
          );
        }

        // Retract
        gcode.push(`G0 Z${options.safeHeight} ; Retract`);
      }

      gcode.push(''); // Empty line between toolpaths
    });

    // Add footer
    gcode.push(this.generateFooter(options));

    return gcode.join('\n');
  }
}

module.exports = DxfConverter;
