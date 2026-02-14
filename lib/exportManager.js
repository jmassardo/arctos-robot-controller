const path = require('path');
const fs = require('fs-extra');
const { logger } = require('./logger');
const { models } = require('./database');

// Import format-specific exporters
const CSVExporter = require('./exporters/csvExporter');
const JSONExporter = require('./exporters/jsonExporter');
const XMLExporter = require('./exporters/xmlExporter');

/**
 * Core export management system
 * Handles data export in multiple formats with filtering and field selection
 */
class DataExportManager {
  constructor() {
    this.exporters = new Map([
      ['csv', new CSVExporter()],
      ['json', new JSONExporter()],
      ['xml', new XMLExporter()],
    ]);

    // Export configuration for different data types
    this.configurations = {
      positions: {
        fields: [
          { key: 'id', label: 'ID', required: true, type: 'string' },
          { key: 'name', label: 'Position Name', required: true, type: 'string' },
          { key: 'description', label: 'Description', required: false, type: 'string' },
          { key: 'x', label: 'X Coordinate', required: false, type: 'number', precision: 3 },
          { key: 'y', label: 'Y Coordinate', required: false, type: 'number', precision: 3 },
          { key: 'z', label: 'Z Coordinate', required: false, type: 'number', precision: 3 },
          { key: 'a', label: 'A Axis', required: false, type: 'number', precision: 3 },
          { key: 'b', label: 'B Axis', required: false, type: 'number', precision: 3 },
          { key: 'c', label: 'C Axis', required: false, type: 'number', precision: 3 },
          {
            key: 'gripper',
            label: 'Gripper Position',
            required: false,
            type: 'number',
            precision: 1,
          },
          { key: 'delay', label: 'Delay (ms)', required: false, type: 'number' },
          { key: 'group', label: 'Group Name', required: false, type: 'string' },
          { key: 'created_at', label: 'Created', required: false, type: 'datetime' },
          { key: 'updated_at', label: 'Last Modified', required: false, type: 'datetime' },
          { key: 'last_used', label: 'Last Used', required: false, type: 'datetime' },
        ],
        defaultFields: ['name', 'x', 'y', 'z', 'gripper', 'group', 'created_at'],
        filters: [
          { key: 'dateRange', type: 'dateRange', label: 'Date Range' },
          { key: 'groups', type: 'multiSelect', label: 'Groups' },
          { key: 'positions', type: 'multiSelect', label: 'Specific Positions' },
          { key: 'hasCoordinates', type: 'boolean', label: 'Has Coordinates' },
        ],
      },
      groups: {
        fields: [
          { key: 'id', label: 'Group ID', required: true, type: 'string' },
          { key: 'name', label: 'Group Name', required: true, type: 'string' },
          { key: 'description', label: 'Description', required: false, type: 'string' },
          { key: 'color', label: 'Color', required: false, type: 'string' },
          { key: 'position_count', label: 'Position Count', required: false, type: 'number' },
          { key: 'created_at', label: 'Created', required: false, type: 'datetime' },
          { key: 'updated_at', label: 'Last Modified', required: false, type: 'datetime' },
        ],
        defaultFields: ['name', 'description', 'position_count', 'created_at'],
        filters: [
          { key: 'dateRange', type: 'dateRange', label: 'Date Range' },
          { key: 'hasPositions', type: 'boolean', label: 'Has Positions' },
        ],
      },
    };
  }

  /**
   * Export data with specified options
   * @param {string} dataType - Type of data to export ('positions', 'groups')
   * @param {string} format - Export format ('csv', 'json', 'xml')
   * @param {object} options - Export options
   * @returns {Promise<object>} Export result with data and metadata
   */
  async exportData(dataType, format, options = {}) {
    try {
      logger.info('Starting data export', {
        dataType,
        format,
        options: { ...options, preview: !!options.preview },
      });

      // Validate parameters
      this.validateExportRequest(dataType, format, options);

      // Get exporter for format
      const exporter = this.exporters.get(format.toLowerCase());
      if (!exporter) {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Fetch and process data
      const data = await this.fetchData(dataType, options);

      // Apply field selection and formatting
      const processedData = this.processData(data, dataType, options);

      // Generate export with format-specific exporter
      const exportResult = await exporter.export(processedData, {
        ...options,
        dataType,
        configuration: this.configurations[dataType],
        metadata: this.generateMetadata(dataType, options, processedData.length),
      });

      logger.info('Export completed successfully', {
        dataType,
        format,
        recordCount: processedData.length,
      });

      return {
        success: true,
        data: exportResult,
        metadata: {
          dataType,
          format,
          recordCount: processedData.length,
          exportDate: new Date().toISOString(),
          options: options,
        },
      };
    } catch (error) {
      logger.error('Export failed', {
        dataType,
        format,
        error: error.message,
        stack: error.stack,
      });

      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Get preview of export data (first 10 records)
   * @param {string} dataType - Type of data to export
   * @param {string} format - Export format
   * @param {object} options - Export options
   * @returns {Promise<object>} Preview result
   */
  async getExportPreview(dataType, format, options = {}) {
    const previewOptions = {
      ...options,
      preview: true,
      limit: 10,
    };

    return await this.exportData(dataType, format, previewOptions);
  }

  /**
   * Get available fields for a data type
   * @param {string} dataType - Type of data
   * @returns {array} Available fields configuration
   */
  getAvailableFields(dataType) {
    const config = this.configurations[dataType];
    if (!config) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    return config.fields;
  }

  /**
   * Get available filters for a data type
   * @param {string} dataType - Type of data
   * @returns {array} Available filters configuration
   */
  getAvailableFilters(dataType) {
    const config = this.configurations[dataType];
    if (!config) {
      throw new Error(`Unknown data type: ${dataType}`);
    }
    return config.filters;
  }

  /**
   * Validate export request parameters
   */
  validateExportRequest(dataType, format, options) {
    if (!dataType || !this.configurations[dataType]) {
      throw new Error(`Invalid data type: ${dataType}`);
    }

    if (!format || !this.exporters.has(format.toLowerCase())) {
      throw new Error(`Invalid export format: ${format}`);
    }

    if (options.fields && !Array.isArray(options.fields)) {
      throw new Error('Fields must be an array');
    }
  }

  /**
   * Fetch data based on type and filters
   */
  async fetchData(dataType, options = {}) {
    switch (dataType) {
      case 'positions':
        return await this.fetchPositions(options);
      case 'groups':
        return await this.fetchGroups(options);
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  /**
   * Fetch positions with filters and joins
   */
  async fetchPositions(options = {}) {
    try {
      const { Position, PositionGroup } = models;

      // Build query conditions
      const where = {};
      const include = [];

      // Date range filter
      if (options.filters && options.filters.dateRange) {
        const { start, end } = options.filters.dateRange;
        where.created_at = {
          [require('sequelize').Op.between]: [new Date(start), new Date(end)],
        };
      }

      // Group filter
      if (options.filters && options.filters.groups && options.filters.groups.length > 0) {
        where.group_id = {
          [require('sequelize').Op.in]: options.filters.groups,
        };
      }

      // Specific positions filter
      if (options.filters && options.filters.positions && options.filters.positions.length > 0) {
        where.id = {
          [require('sequelize').Op.in]: options.filters.positions,
        };
      }

      // Include group information
      include.push({
        model: PositionGroup,
        as: 'group',
        attributes: ['name', 'color'],
        required: false,
      });

      const queryOptions = {
        where,
        include,
        order: [['created_at', 'DESC']],
      };

      // Apply limit for preview
      if (options.limit) {
        queryOptions.limit = options.limit;
      }

      const positions = await Position.findAll(queryOptions);

      return positions.map(position => ({
        id: position.id,
        name: position.name,
        description: position.description,
        ...position.axes, // Spread axes (x, y, z, etc.)
        ...(position.manipulators || {}), // Spread manipulators (gripper, etc.)
        delay: position.delay,
        group: position.group ? position.group.name : null,
        group_color: position.group ? position.group.color : null,
        created_at: position.created_at,
        updated_at: position.updated_at,
        last_used: position.last_used,
      }));
    } catch (error) {
      logger.error('Failed to fetch positions', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch groups with position counts
   */
  async fetchGroups(options = {}) {
    try {
      const { PositionGroup, Position } = models;

      // Build query conditions
      const where = {};

      // Date range filter
      if (options.filters && options.filters.dateRange) {
        const { start, end } = options.filters.dateRange;
        where.created_at = {
          [require('sequelize').Op.between]: [new Date(start), new Date(end)],
        };
      }

      const queryOptions = {
        where,
        include: [
          {
            model: Position,
            as: 'positions',
            attributes: [],
            required: false,
          },
        ],
        attributes: [
          'id',
          'name',
          'description',
          'color',
          'created_at',
          'updated_at',
          [
            require('sequelize').fn('COUNT', require('sequelize').col('positions.id')),
            'position_count',
          ],
        ],
        group: ['PositionGroup.id'],
        order: [['created_at', 'DESC']],
      };

      // Apply limit for preview
      if (options.limit) {
        queryOptions.limit = options.limit;
      }

      const groups = await PositionGroup.findAll(queryOptions);

      return groups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        position_count: parseInt(group.dataValues.position_count) || 0,
        created_at: group.created_at,
        updated_at: group.updated_at,
      }));
    } catch (error) {
      logger.error('Failed to fetch groups', { error: error.message });
      throw error;
    }
  }

  /**
   * Process raw data according to field selection and formatting options
   */
  processData(data, dataType, options) {
    if (!Array.isArray(data)) {
      return [];
    }

    const config = this.configurations[dataType];
    const selectedFields = options.fields || config.defaultFields;

    return data.map(item => {
      const processedItem = {};

      selectedFields.forEach(fieldKey => {
        const fieldConfig = config.fields.find(f => f.key === fieldKey);
        if (fieldConfig && item.hasOwnProperty(fieldKey)) {
          processedItem[fieldKey] = this.formatFieldValue(
            item[fieldKey],
            fieldConfig,
            options.formatting || {}
          );
        }
      });

      return processedItem;
    });
  }

  /**
   * Format individual field values according to type and options
   */
  formatFieldValue(value, fieldConfig, formattingOptions) {
    if (value === null) {
      return '';
    }

    switch (fieldConfig.type) {
      case 'number':
        if (typeof value === 'number') {
          const precision = formattingOptions.numberPrecision || fieldConfig.precision || 0;
          return parseFloat(value.toFixed(precision));
        }
        return value;

      case 'datetime':
        if (value instanceof Date) {
          const format = formattingOptions.dateFormat || 'iso';
          return format === 'iso' ? value.toISOString() : value.toLocaleString();
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Generate metadata for export
   */
  generateMetadata(dataType, options, recordCount) {
    return {
      exportType: dataType,
      exportDate: new Date().toISOString(),
      source: 'Arctos Robot Controller',
      version: '1.0',
      recordCount,
      filters: options.filters || {},
      fields: options.fields || this.configurations[dataType].defaultFields,
    };
  }
}

module.exports = DataExportManager;
