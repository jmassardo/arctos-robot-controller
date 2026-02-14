/**
 * CSV format exporter
 * Generates RFC 4180 compliant CSV files
 */
class CSVExporter {
  constructor() {
    this.delimiter = ',';
    this.lineTerminator = '\n';
    this.quote = '"';
  }

  /**
   * Export data to CSV format
   * @param {array} data - Array of objects to export
   * @param {object} options - Export options
   * @returns {string} CSV formatted string
   */
  async export(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return this.generateEmptyCSV(options);
    }

    const { configuration, metadata } = options;
    const includeHeaders = options.includeHeaders !== false;

    let csvContent = '';

    // Add metadata comment if requested
    if (options.includeMetadata) {
      csvContent += this.generateMetadataComments(metadata);
    }

    // Generate headers
    if (includeHeaders) {
      const headers = this.generateHeaders(data[0], configuration, options);
      csvContent += this.formatRow(headers) + this.lineTerminator;
    }

    // Generate data rows
    for (const item of data) {
      const row = this.formatDataRow(item, configuration, options);
      csvContent += this.formatRow(row) + this.lineTerminator;
    }

    return csvContent;
  }

  /**
   * Generate headers for CSV
   */
  generateHeaders(sampleData, configuration, options) {
    const headers = [];
    const fields = options.fields || Object.keys(sampleData);

    fields.forEach(fieldKey => {
      if (configuration && configuration.fields) {
        const fieldConfig = configuration.fields.find(f => f.key === fieldKey);
        headers.push(fieldConfig ? fieldConfig.label : fieldKey);
      } else {
        headers.push(this.formatHeaderName(fieldKey));
      }
    });

    return headers;
  }

  /**
   * Format a data row for CSV
   */
  formatDataRow(item, configuration, options) {
    const row = [];
    const fields = options.fields || Object.keys(item);

    fields.forEach(fieldKey => {
      const value = item[fieldKey];
      row.push(this.formatValue(value));
    });

    return row;
  }

  /**
   * Format a single CSV row (array of values)
   */
  formatRow(values) {
    return values.map(value => this.escapeValue(value)).join(this.delimiter);
  }

  /**
   * Format individual values for CSV
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      // Handle objects/arrays by JSON stringifying
      return JSON.stringify(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    return String(value);
  }

  /**
   * Escape CSV values according to RFC 4180
   */
  escapeValue(value) {
    const stringValue = String(value);

    // Check if escaping is needed
    const needsEscaping =
      stringValue.includes(this.delimiter) ||
      stringValue.includes(this.quote) ||
      stringValue.includes('\n') ||
      stringValue.includes('\r');

    if (!needsEscaping) {
      return stringValue;
    }

    // Escape quotes by doubling them and wrap in quotes
    const escapedValue = stringValue.replace(new RegExp(this.quote, 'g'), this.quote + this.quote);
    return this.quote + escapedValue + this.quote;
  }

  /**
   * Format header names (convert snake_case to Title Case)
   */
  formatHeaderName(fieldName) {
    return fieldName
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Generate metadata comments for CSV header
   */
  generateMetadataComments(metadata) {
    if (!metadata) {
      return '';
    }

    let comments = '';
    comments += `# Export Type: ${metadata.exportType}\n`;
    comments += `# Export Date: ${metadata.exportDate}\n`;
    comments += `# Source: ${metadata.source}\n`;
    comments += `# Record Count: ${metadata.recordCount}\n`;

    if (metadata.filters && Object.keys(metadata.filters).length > 0) {
      comments += `# Filters Applied: ${JSON.stringify(metadata.filters)}\n`;
    }

    comments += `# Fields: ${metadata.fields.join(', ')}\n`;
    comments += '#\n'; // Empty comment line for separation

    return comments;
  }

  /**
   * Generate empty CSV with just headers if no data
   */
  generateEmptyCSV(options) {
    const { configuration } = options;

    if (!configuration || !configuration.fields) {
      return '# No data available\n';
    }

    const headers = configuration.fields
      .filter(field => (options.fields ? options.fields.includes(field.key) : field.required))
      .map(field => field.label);

    return this.formatRow(headers) + this.lineTerminator;
  }

  /**
   * Validate CSV output
   */
  validateCSV(csvContent) {
    const lines = csvContent
      .split(this.lineTerminator)
      .filter(line => line.trim() && !line.startsWith('#'));

    if (lines.length === 0) {
      return { valid: true, warnings: ['Empty CSV file'] };
    }

    const warnings = [];
    const headerColumnCount = lines[0].split(this.delimiter).length;

    // Check consistent column count
    for (let i = 1; i < lines.length; i++) {
      const columnCount = lines[i].split(this.delimiter).length;
      if (columnCount !== headerColumnCount) {
        warnings.push(`Row ${i + 1} has ${columnCount} columns, expected ${headerColumnCount}`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
      rowCount: lines.length - 1, // Subtract header row
      columnCount: headerColumnCount,
    };
  }
}

module.exports = CSVExporter;
