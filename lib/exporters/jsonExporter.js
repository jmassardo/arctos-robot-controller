/**
 * JSON format exporter
 * Generates well-structured JSON documents
 */
class JSONExporter {
  constructor() {
    this.defaultIndentation = 2;
  }

  /**
   * Export data to JSON format
   * @param {array} data - Array of objects to export
   * @param {object} options - Export options
   * @returns {string} JSON formatted string
   */
  async export(data, options = {}) {
    if (!Array.isArray(data)) {
      data = [];
    }

    const { metadata } = options;
    const prettyFormat = options.prettyFormat !== false;
    const includeMetadata = options.includeMetadata !== false;

    // Build the JSON structure
    const jsonStructure = {
      ...(includeMetadata && metadata ? { metadata: this.formatMetadata(metadata) } : {}),
      exportDate: new Date().toISOString(),
      count: data.length,
      data: this.processData(data, options),
    };

    // Format the JSON output
    const indentation = prettyFormat ? options.indentation || this.defaultIndentation : 0;
    return JSON.stringify(jsonStructure, null, indentation);
  }

  /**
   * Process data for JSON export with nested structure
   */
  processData(data, options) {
    if (data.length === 0) {
      return [];
    }

    const { dataType, configuration } = options;

    return data.map(item => {
      switch (dataType) {
        case 'positions':
          return this.formatPositionItem(item, options);
        case 'groups':
          return this.formatGroupItem(item, options);
        default:
          return this.formatGenericItem(item, options);
      }
    });
  }

  /**
   * Format a position item with nested structure
   */
  formatPositionItem(item, options) {
    const formatted = {
      id: item.id,
      name: item.name,
    };

    // Add description if present
    if (item.description) {
      formatted.description = item.description;
    }

    // Group coordinates if they exist
    const coordinates = {};
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      if (item[axis] !== undefined && item[axis] !== null) {
        coordinates[axis] = item[axis];
      }
    });

    if (Object.keys(coordinates).length > 0) {
      formatted.coordinates = coordinates;
    }

    // Group manipulators if they exist
    const manipulators = {};
    ['gripper', 'vacuum', 'tool'].forEach(manipulator => {
      if (item[manipulator] !== undefined && item[manipulator] !== null) {
        manipulators[manipulator] = item[manipulator];
      }
    });

    if (Object.keys(manipulators).length > 0) {
      formatted.manipulators = manipulators;
    }

    // Add other properties
    if (item.delay !== undefined) {
      formatted.delay = item.delay;
    }

    if (item.group) {
      formatted.group = {
        name: item.group,
        ...(item.group_color ? { color: item.group_color } : {}),
      };
    }

    // Add timestamps if requested
    const fields = options.fields || [];
    const timestamps = {};

    if (fields.includes('created_at') && item.created_at) {
      timestamps.created = new Date(item.created_at).toISOString();
    }

    if (fields.includes('updated_at') && item.updated_at) {
      timestamps.lastModified = new Date(item.updated_at).toISOString();
    }

    if (fields.includes('last_used') && item.last_used) {
      timestamps.lastUsed = new Date(item.last_used).toISOString();
    }

    if (Object.keys(timestamps).length > 0) {
      formatted.timestamps = timestamps;
    }

    return formatted;
  }

  /**
   * Format a group item
   */
  formatGroupItem(item, options) {
    const formatted = {
      id: item.id,
      name: item.name,
    };

    if (item.description) {
      formatted.description = item.description;
    }

    if (item.color) {
      formatted.color = item.color;
    }

    if (item.position_count !== undefined) {
      formatted.positionCount = item.position_count;
    }

    // Add timestamps if requested
    const fields = options.fields || [];
    const timestamps = {};

    if (fields.includes('created_at') && item.created_at) {
      timestamps.created = new Date(item.created_at).toISOString();
    }

    if (fields.includes('updated_at') && item.updated_at) {
      timestamps.lastModified = new Date(item.updated_at).toISOString();
    }

    if (Object.keys(timestamps).length > 0) {
      formatted.timestamps = timestamps;
    }

    return formatted;
  }

  /**
   * Format a generic item (fallback)
   */
  formatGenericItem(item, options) {
    const formatted = {};
    const fields = options.fields || Object.keys(item);

    fields.forEach(fieldKey => {
      if (item.hasOwnProperty(fieldKey)) {
        formatted[fieldKey] = this.formatFieldValue(item[fieldKey]);
      }
    });

    return formatted;
  }

  /**
   * Format individual field values
   */
  formatFieldValue(value) {
    if (value === null) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      return value; // Keep objects as-is for JSON
    }

    return value;
  }

  /**
   * Format metadata for JSON export
   */
  formatMetadata(metadata) {
    return {
      exportType: metadata.exportType,
      exportDate: metadata.exportDate,
      source: metadata.source,
      version: metadata.version,
      recordCount: metadata.recordCount,
      ...(metadata.filters && Object.keys(metadata.filters).length > 0
        ? { filters: this.formatFilters(metadata.filters) }
        : {}),
      fields: metadata.fields || [],
      schema: this.generateSchema(metadata),
    };
  }

  /**
   * Format filters for metadata
   */
  formatFilters(filters) {
    const formatted = {};

    Object.keys(filters).forEach(key => {
      const value = filters[key];

      switch (key) {
        case 'dateRange':
          if (value && value.start && value.end) {
            formatted.dateRange = {
              start: new Date(value.start).toISOString(),
              end: new Date(value.end).toISOString(),
            };
          }
          break;
        default:
          formatted[key] = value;
      }
    });

    return formatted;
  }

  /**
   * Generate schema information for the export
   */
  generateSchema(metadata) {
    if (!metadata.dataType) {
      return {};
    }

    const schemas = {
      positions: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique position identifier' },
          name: { type: 'string', description: 'Position name' },
          description: { type: 'string', description: 'Optional position description' },
          coordinates: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'X axis coordinate' },
              y: { type: 'number', description: 'Y axis coordinate' },
              z: { type: 'number', description: 'Z axis coordinate' },
            },
          },
          manipulators: {
            type: 'object',
            properties: {
              gripper: { type: 'number', description: 'Gripper position (0-100)' },
            },
          },
          delay: { type: 'number', description: 'Delay in milliseconds' },
          group: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Group name' },
              color: { type: 'string', description: 'Group color' },
            },
          },
          timestamps: {
            type: 'object',
            properties: {
              created: { type: 'string', format: 'date-time' },
              lastModified: { type: 'string', format: 'date-time' },
              lastUsed: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      groups: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique group identifier' },
          name: { type: 'string', description: 'Group name' },
          description: { type: 'string', description: 'Optional group description' },
          color: { type: 'string', description: 'Group color in hex format' },
          positionCount: { type: 'number', description: 'Number of positions in group' },
          timestamps: {
            type: 'object',
            properties: {
              created: { type: 'string', format: 'date-time' },
              lastModified: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    };

    return schemas[metadata.dataType] || {};
  }

  /**
   * Validate JSON structure
   */
  validateJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);

      const validation = {
        valid: true,
        warnings: [],
        structure: {
          hasMetadata: !!parsed.metadata,
          hasExportDate: !!parsed.exportDate,
          hasCount: typeof parsed.count === 'number',
          hasData: Array.isArray(parsed.data),
          recordCount: Array.isArray(parsed.data) ? parsed.data.length : 0,
        },
      };

      // Check count consistency
      if (validation.structure.hasCount && validation.structure.hasData) {
        if (parsed.count !== parsed.data.length) {
          validation.warnings.push(
            `Count mismatch: declared ${parsed.count}, actual ${parsed.data.length}`
          );
        }
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        warnings: ['Invalid JSON format'],
      };
    }
  }
}

module.exports = JSONExporter;
