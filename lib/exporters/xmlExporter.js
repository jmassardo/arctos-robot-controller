/**
 * XML format exporter
 * Generates well-formed XML documents with proper schema
 */
class XMLExporter {
  constructor() {
    this.xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
    this.namespace = 'http://arctos-robot.com/export/v1';
    this.indentation = '  '; // Two spaces for indentation
  }

  /**
   * Export data to XML format
   * @param {array} data - Array of objects to export
   * @param {object} options - Export options
   * @returns {string} XML formatted string
   */
  async export(data, options = {}) {
    if (!Array.isArray(data)) {
      data = [];
    }

    const { metadata, dataType } = options;
    const prettyFormat = options.prettyFormat !== false;

    let xml = this.xmlDeclaration;

    if (prettyFormat) {
      xml += '\n';
    }

    // Create root element based on data type
    const rootElementName = this.getRootElementName(dataType);
    xml += `<${rootElementName} xmlns="${this.namespace}">`;

    if (prettyFormat) {
      xml += '\n';
    }

    // Add metadata if available
    if (options.includeMetadata !== false && metadata) {
      xml += this.generateMetadataXML(metadata, prettyFormat, 1);
    }

    // Add data elements
    xml += this.generateDataXML(data, dataType, prettyFormat, 1);

    // Close root element
    if (prettyFormat) {
      xml += '\n';
    }
    xml += `</${rootElementName}>`;

    return xml;
  }

  /**
   * Get root element name based on data type
   */
  getRootElementName(dataType) {
    const rootNames = {
      positions: 'positionExport',
      groups: 'groupExport',
    };

    return rootNames[dataType] || 'dataExport';
  }

  /**
   * Generate metadata XML section
   */
  generateMetadataXML(metadata, prettyFormat, indentLevel) {
    let xml = this.indent('<metadata>', prettyFormat, indentLevel);

    // Basic metadata
    xml += this.createSimpleElement(
      'exportType',
      metadata.exportType,
      prettyFormat,
      indentLevel + 1
    );
    xml += this.createSimpleElement(
      'exportDate',
      metadata.exportDate,
      prettyFormat,
      indentLevel + 1
    );
    xml += this.createSimpleElement('source', metadata.source, prettyFormat, indentLevel + 1);

    if (metadata.version) {
      xml += this.createSimpleElement('version', metadata.version, prettyFormat, indentLevel + 1);
    }

    xml += this.createSimpleElement(
      'recordCount',
      metadata.recordCount,
      prettyFormat,
      indentLevel + 1
    );

    // Filters
    if (metadata.filters && Object.keys(metadata.filters).length > 0) {
      xml += this.generateFiltersXML(metadata.filters, prettyFormat, indentLevel + 1);
    }

    // Fields
    if (metadata.fields && metadata.fields.length > 0) {
      xml += this.generateFieldsXML(metadata.fields, prettyFormat, indentLevel + 1);
    }

    xml += this.indent('</metadata>', prettyFormat, indentLevel);

    return xml;
  }

  /**
   * Generate filters XML section
   */
  generateFiltersXML(filters, prettyFormat, indentLevel) {
    let xml = this.indent('<filters>', prettyFormat, indentLevel);

    Object.keys(filters).forEach(filterKey => {
      const filterValue = filters[filterKey];

      if (filterKey === 'dateRange' && filterValue && filterValue.start && filterValue.end) {
        xml += this.indent('<dateRange>', prettyFormat, indentLevel + 1);
        xml += this.createSimpleElement(
          'start',
          new Date(filterValue.start).toISOString(),
          prettyFormat,
          indentLevel + 2
        );
        xml += this.createSimpleElement(
          'end',
          new Date(filterValue.end).toISOString(),
          prettyFormat,
          indentLevel + 2
        );
        xml += this.indent('</dateRange>', prettyFormat, indentLevel + 1);
      } else if (Array.isArray(filterValue)) {
        xml += this.indent(`<${filterKey}>`, prettyFormat, indentLevel + 1);
        filterValue.forEach(value => {
          xml += this.createSimpleElement('item', value, prettyFormat, indentLevel + 2);
        });
        xml += this.indent(`</${filterKey}>`, prettyFormat, indentLevel + 1);
      } else {
        xml += this.createSimpleElement(filterKey, filterValue, prettyFormat, indentLevel + 1);
      }
    });

    xml += this.indent('</filters>', prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Generate fields XML section
   */
  generateFieldsXML(fields, prettyFormat, indentLevel) {
    let xml = this.indent('<exportedFields>', prettyFormat, indentLevel);

    fields.forEach(field => {
      xml += this.createSimpleElement('field', field, prettyFormat, indentLevel + 1);
    });

    xml += this.indent('</exportedFields>', prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Generate data XML section
   */
  generateDataXML(data, dataType, prettyFormat, indentLevel) {
    const containerName = this.getDataContainerName(dataType);
    let xml = this.indent(`<${containerName}>`, prettyFormat, indentLevel);

    data.forEach(item => {
      switch (dataType) {
        case 'positions':
          xml += this.generatePositionXML(item, prettyFormat, indentLevel + 1);
          break;
        case 'groups':
          xml += this.generateGroupXML(item, prettyFormat, indentLevel + 1);
          break;
        default:
          xml += this.generateGenericItemXML(item, prettyFormat, indentLevel + 1);
      }
    });

    xml += this.indent(`</${containerName}>`, prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Get data container name based on data type
   */
  getDataContainerName(dataType) {
    const containerNames = {
      positions: 'positions',
      groups: 'groups',
    };

    return containerNames[dataType] || 'items';
  }

  /**
   * Generate XML for a single position
   */
  generatePositionXML(position, prettyFormat, indentLevel) {
    const attributes = position.id ? ` id="${this.escapeXMLAttribute(position.id)}"` : '';
    let xml = this.indent(`<position${attributes}>`, prettyFormat, indentLevel);

    // Basic properties
    if (position.name) {
      xml += this.createSimpleElement('name', position.name, prettyFormat, indentLevel + 1);
    }

    if (position.description) {
      xml += this.createSimpleElement(
        'description',
        position.description,
        prettyFormat,
        indentLevel + 1
      );
    }

    // Coordinates
    const coordinates = {};
    ['x', 'y', 'z', 'a', 'b', 'c'].forEach(axis => {
      if (position[axis] !== undefined && position[axis] !== null) {
        coordinates[axis] = position[axis];
      }
    });

    if (Object.keys(coordinates).length > 0) {
      const coordAttrs = Object.keys(coordinates)
        .map(axis => `${axis}="${coordinates[axis]}"`)
        .join(' ');
      xml += this.indent(`<coordinates ${coordAttrs}/>`, prettyFormat, indentLevel + 1);
    }

    // Manipulators
    if (position.gripper !== undefined && position.gripper !== null) {
      xml += this.indent(
        `<gripper position="${position.gripper}"/>`,
        prettyFormat,
        indentLevel + 1
      );
    }

    // Other properties
    if (position.delay !== undefined) {
      xml += this.createSimpleElement('delay', position.delay, prettyFormat, indentLevel + 1);
    }

    if (position.group) {
      const groupAttrs = position.group_color
        ? ` color="${this.escapeXMLAttribute(position.group_color)}"`
        : '';
      xml += this.createSimpleElement(
        'group',
        position.group,
        prettyFormat,
        indentLevel + 1,
        groupAttrs
      );
    }

    // Timestamps
    if (position.created_at) {
      xml += this.createSimpleElement(
        'created',
        new Date(position.created_at).toISOString(),
        prettyFormat,
        indentLevel + 1
      );
    }

    if (position.updated_at) {
      xml += this.createSimpleElement(
        'lastModified',
        new Date(position.updated_at).toISOString(),
        prettyFormat,
        indentLevel + 1
      );
    }

    if (position.last_used) {
      xml += this.createSimpleElement(
        'lastUsed',
        new Date(position.last_used).toISOString(),
        prettyFormat,
        indentLevel + 1
      );
    }

    xml += this.indent('</position>', prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Generate XML for a single group
   */
  generateGroupXML(group, prettyFormat, indentLevel) {
    const attributes = group.id ? ` id="${this.escapeXMLAttribute(group.id)}"` : '';
    let xml = this.indent(`<group${attributes}>`, prettyFormat, indentLevel);

    // Basic properties
    if (group.name) {
      xml += this.createSimpleElement('name', group.name, prettyFormat, indentLevel + 1);
    }

    if (group.description) {
      xml += this.createSimpleElement(
        'description',
        group.description,
        prettyFormat,
        indentLevel + 1
      );
    }

    if (group.color) {
      xml += this.createSimpleElement('color', group.color, prettyFormat, indentLevel + 1);
    }

    if (group.position_count !== undefined) {
      xml += this.createSimpleElement(
        'positionCount',
        group.position_count,
        prettyFormat,
        indentLevel + 1
      );
    }

    // Timestamps
    if (group.created_at) {
      xml += this.createSimpleElement(
        'created',
        new Date(group.created_at).toISOString(),
        prettyFormat,
        indentLevel + 1
      );
    }

    if (group.updated_at) {
      xml += this.createSimpleElement(
        'lastModified',
        new Date(group.updated_at).toISOString(),
        prettyFormat,
        indentLevel + 1
      );
    }

    xml += this.indent('</group>', prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Generate XML for a generic item (fallback)
   */
  generateGenericItemXML(item, prettyFormat, indentLevel) {
    let xml = this.indent('<item>', prettyFormat, indentLevel);

    Object.keys(item).forEach(key => {
      const value = item[key];
      if (value !== null) {
        xml += this.createSimpleElement(
          this.sanitizeElementName(key),
          value,
          prettyFormat,
          indentLevel + 1
        );
      }
    });

    xml += this.indent('</item>', prettyFormat, indentLevel);
    return xml;
  }

  /**
   * Create a simple XML element
   */
  createSimpleElement(elementName, value, prettyFormat, indentLevel, attributes = '') {
    if (value === null) {
      return '';
    }

    const escapedValue = this.escapeXMLContent(String(value));
    const element = `<${elementName}${attributes}>${escapedValue}</${elementName}>`;

    return this.indent(element, prettyFormat, indentLevel);
  }

  /**
   * Apply indentation if pretty format is enabled
   */
  indent(content, prettyFormat, level) {
    if (!prettyFormat) {
      return content;
    }

    const indentation = this.indentation.repeat(level);
    return indentation + content + '\n';
  }

  /**
   * Escape XML content (text nodes)
   */
  escapeXMLContent(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Escape XML attribute values
   */
  escapeXMLAttribute(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;')
      .replace(/\t/g, '&#9;');
  }

  /**
   * Sanitize element names to be valid XML identifiers
   */
  sanitizeElementName(name) {
    // Convert to valid XML element name
    return String(name)
      .replace(/[^a-zA-Z0-9_.-]/g, '_') // Replace invalid characters with underscores
      .replace(/^[0-9]/, '_$&') // Prefix with underscore if starts with number
      .replace(/^xml/i, '_xml'); // Prefix with underscore if starts with 'xml'
  }

  /**
   * Validate XML structure
   */
  validateXML(xmlString) {
    try {
      // Basic XML validation for Node.js environment
      // DOMParser is not available in Node.js by default
      const trimmed = xmlString.trim();
      if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
        return {
          valid: false,
          error: 'Invalid XML: must start with < and end with >',
          warnings: ['Basic XML structure check failed'],
        };
      }

      // Simplified validation for Node.js environment
      const validation = {
        valid: true,
        error: null,
        warnings: [],
        structure: {
          rootElement: 'export', // Assume valid structure
          hasNamespace: trimmed.includes('xmlns'),
          hasMetadata: trimmed.includes('<metadata'),
          dataElements: (trimmed.match(/<(position|group|item)>/g) || []).length,
        },
      };

      // Basic tag validation
      const openTags = (trimmed.match(/<[^\/][^>]*>/g) || []).length;
      const closeTags = (trimmed.match(/<\/[^>]*>/g) || []).length;

      if (openTags !== closeTags) {
        validation.valid = false;
        validation.error = 'Mismatched XML tags';
        validation.warnings.push('Tag count mismatch detected');
      }

      // Check namespace
      if (!validation.structure.hasNamespace) {
        validation.warnings.push('Missing XML namespace declaration');
      } else if (validation.structure.hasNamespace && !trimmed.includes(this.namespace)) {
        validation.warnings.push('Incorrect XML namespace');
      }

      return validation;
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        warnings: ['XML validation failed'],
      };
    }
  }
}

module.exports = XMLExporter;
