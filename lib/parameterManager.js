const { logger } = require('./logger');

/**
 * Parameter Manager for G-code Program Parameters
 * Handles parameter definitions, validation, and input processing
 */
class ParameterManager {
  constructor() {
    this.parameters = new Map();
    this.parameterDefinitions = new Map();
    this.presets = new Map();
    this.validationRules = new Map();
  }

  /**
   * Define a parameter with metadata
   * @param {Object} definition - Parameter definition
   */
  defineParameter(definition) {
    const {
      name,
      description = '',
      type = 'number',
      defaultValue = 0,
      min = null,
      max = null,
      unit = '',
      required = false,
      options = null,
      category = 'General',
      order = 999
    } = definition;

    if (!name) {
      throw new Error('Parameter name is required');
    }

    const paramDef = {
      name: name.toUpperCase(),
      description,
      type,
      defaultValue,
      min,
      max,
      unit,
      required,
      options,
      category,
      order
    };

    // Validate the definition
    this.validateParameterDefinition(paramDef);

    this.parameterDefinitions.set(paramDef.name, paramDef);
    
    // Set default value
    this.setParameter(paramDef.name, paramDef.defaultValue);
    
    logger.debug(`Parameter defined: ${paramDef.name}`, { definition: paramDef });
  }

  /**
   * Define multiple parameters from configuration
   * @param {Array} definitions - Array of parameter definitions
   */
  defineParameters(definitions) {
    if (!Array.isArray(definitions)) {
      throw new Error('Parameter definitions must be an array');
    }

    for (const definition of definitions) {
      this.defineParameter(definition);
    }
  }

  /**
   * Set parameter value with validation
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  setParameter(name, value) {
    const paramName = name.toUpperCase();
    const definition = this.parameterDefinitions.get(paramName);
    
    if (!definition) {
      // Allow setting undefined parameters as user variables
      this.parameters.set(paramName, this.parseValue(value, 'number'));
      logger.debug(`Set user parameter ${paramName} = ${value}`);
      return;
    }

    // Validate the value
    const validatedValue = this.validateParameterValue(definition, value);
    this.parameters.set(paramName, validatedValue);
    
    logger.debug(`Set parameter ${paramName} = ${validatedValue}`);
  }

  /**
   * Get parameter value
   * @param {string} name - Parameter name
   * @returns {*} Parameter value or default
   */
  getParameter(name) {
    const paramName = name.toUpperCase();
    
    if (this.parameters.has(paramName)) {
      return this.parameters.get(paramName);
    }

    // Return default value if parameter is defined
    const definition = this.parameterDefinitions.get(paramName);
    if (definition) {
      return definition.defaultValue;
    }

    // Return 0 for undefined parameters (G-code standard)
    logger.debug(`Unknown parameter ${paramName}, returning 0`);
    return 0;
  }

  /**
   * Set multiple parameters at once
   * @param {Object} parameters - Key-value pairs of parameters
   */
  setParameters(parameters) {
    const errors = [];
    
    for (const [name, value] of Object.entries(parameters)) {
      try {
        this.setParameter(name, value);
      } catch (error) {
        errors.push({ parameter: name, error: error.message });
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Parameter validation errors: ${JSON.stringify(errors)}`);
    }
  }

  /**
   * Get all parameter values
   * @returns {Object} All parameter values
   */
  getAllParameters() {
    const result = {};
    
    for (const [name, value] of this.parameters) {
      result[name] = value;
    }
    
    return result;
  }

  /**
   * Get parameter definitions for UI generation
   * @returns {Array} Parameter definitions sorted by category and order
   */
  getParameterDefinitions() {
    const definitions = Array.from(this.parameterDefinitions.values());
    
    return definitions.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  }

  /**
   * Get parameters by category
   * @param {string} category - Category name
   * @returns {Array} Parameter definitions in category
   */
  getParametersByCategory(category) {
    return this.getParameterDefinitions()
      .filter(def => def.category === category);
  }

  /**
   * Validate parameter definition
   * @param {Object} definition - Parameter definition
   */
  validateParameterDefinition(definition) {
    const validTypes = ['number', 'integer', 'boolean', 'string', 'select'];
    
    if (!validTypes.includes(definition.type)) {
      throw new Error(`Invalid parameter type: ${definition.type}`);
    }
    
    if (definition.type === 'select' && !Array.isArray(definition.options)) {
      throw new Error('Select parameters must have options array');
    }
    
    if (definition.type === 'number' || definition.type === 'integer') {
      if (definition.min !== null && definition.max !== null && definition.min > definition.max) {
        throw new Error('Parameter min value cannot be greater than max value');
      }
    }
  }

  /**
   * Validate parameter value against definition
   * @param {Object} definition - Parameter definition
   * @param {*} value - Value to validate
   * @returns {*} Validated value
   */
  validateParameterValue(definition, value) {
    let validatedValue = value;
    
    // Handle null/undefined values
    if (value === null || value === undefined) {
      if (definition.required) {
        throw new Error(`Required parameter ${definition.name} cannot be null`);
      }
      return definition.defaultValue;
    }
    
    switch (definition.type) {
      case 'number':
        validatedValue = this.parseValue(value, 'number');
        
        if (definition.min !== null && validatedValue < definition.min) {
          throw new Error(`Parameter ${definition.name} value ${validatedValue} is below minimum ${definition.min}`);
        }
        
        if (definition.max !== null && validatedValue > definition.max) {
          throw new Error(`Parameter ${definition.name} value ${validatedValue} is above maximum ${definition.max}`);
        }
        break;
        
      case 'integer':
        validatedValue = this.parseValue(value, 'integer');
        
        if (definition.min !== null && validatedValue < definition.min) {
          throw new Error(`Parameter ${definition.name} value ${validatedValue} is below minimum ${definition.min}`);
        }
        
        if (definition.max !== null && validatedValue > definition.max) {
          throw new Error(`Parameter ${definition.name} value ${validatedValue} is above maximum ${definition.max}`);
        }
        break;
        
      case 'boolean':
        validatedValue = this.parseValue(value, 'boolean');
        break;
        
      case 'string':
        validatedValue = String(value);
        break;
        
      case 'select':
        validatedValue = String(value);
        if (!definition.options.includes(validatedValue)) {
          throw new Error(`Parameter ${definition.name} value ${validatedValue} is not in allowed options: ${definition.options.join(', ')}`);
        }
        break;
        
      default:
        throw new Error(`Unknown parameter type: ${definition.type}`);
    }
    
    return validatedValue;
  }

  /**
   * Parse value to specified type
   * @param {*} value - Value to parse
   * @param {string} type - Target type
   * @returns {*} Parsed value
   */
  parseValue(value, type) {
    switch (type) {
      case 'number':
        if (typeof value === 'string') {
          const num = parseFloat(value);
          if (isNaN(num)) {
            throw new Error(`Cannot convert "${value}" to number`);
          }
          return num;
        }
        return num;
        
      case 'integer':
        if (typeof value === 'number' && Number.isInteger(value)) {
          return value;
        }
        const int = parseInt(value, 10);
        if (isNaN(int)) {
          throw new Error(`Cannot convert "${value}" to integer`);
        }
        return int;
        
      case 'boolean':
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') {
            return true;
          }
          if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') {
            return false;
          }
        }
        if (typeof value === 'number') {
          return value !== 0;
        }
        throw new Error(`Cannot convert "${value}" to boolean`);
        
      default:
        return value;
    }
  }

  /**
   * Create preset parameter set
   * @param {string} name - Preset name
   * @param {Object} parameters - Parameter values
   * @param {string} description - Preset description
   */
  createPreset(name, parameters, description = '') {
    const preset = {
      name,
      description,
      parameters: { ...parameters },
      created: new Date().toISOString()
    };
    
    // Validate all parameters in preset
    for (const [paramName, value] of Object.entries(parameters)) {
      const definition = this.parameterDefinitions.get(paramName.toUpperCase());
      if (definition) {
        this.validateParameterValue(definition, value);
      }
    }
    
    this.presets.set(name, preset);
    logger.debug(`Created parameter preset: ${name}`);
  }

  /**
   * Apply parameter preset
   * @param {string} name - Preset name
   */
  applyPreset(name) {
    const preset = this.presets.get(name);
    if (!preset) {
      throw new Error(`Unknown parameter preset: ${name}`);
    }
    
    this.setParameters(preset.parameters);
    logger.debug(`Applied parameter preset: ${name}`);
  }

  /**
   * Get all presets
   * @returns {Array} Available presets
   */
  getPresets() {
    return Array.from(this.presets.values());
  }

  /**
   * Delete parameter preset
   * @param {string} name - Preset name
   */
  deletePreset(name) {
    if (this.presets.delete(name)) {
      logger.debug(`Deleted parameter preset: ${name}`);
    } else {
      throw new Error(`Unknown parameter preset: ${name}`);
    }
  }

  /**
   * Load parameters from program definition
   * @param {Object} programDefinition - Program with parameter definitions
   */
  loadFromProgramDefinition(programDefinition) {
    if (programDefinition.parameters) {
      this.defineParameters(programDefinition.parameters);
    }
    
    if (programDefinition.presets) {
      for (const preset of programDefinition.presets) {
        this.createPreset(preset.name, preset.parameters, preset.description);
      }
    }
  }

  /**
   * Extract parameter usage from G-code program
   * @param {string} gcodeProgram - G-code program text
   * @returns {Array<string>} List of parameter names used
   */
  extractParameterUsage(gcodeProgram) {
    const parameterPattern = /#([A-Za-z_][A-Za-z0-9_]*|\d+)/g;
    const usedParameters = new Set();
    let match;
    
    while ((match = parameterPattern.exec(gcodeProgram)) !== null) {
      const paramName = match[1].toUpperCase();
      
      // Skip system variables (numeric variables >= 5000)
      const numericParam = parseInt(paramName);
      if (!isNaN(numericParam) && numericParam >= 5000) {
        continue;
      }
      
      usedParameters.add(paramName);
    }
    
    return Array.from(usedParameters);
  }

  /**
   * Validate that all required parameters are set
   * @throws {Error} If required parameters are missing
   */
  validateRequiredParameters() {
    const missing = [];
    
    for (const definition of this.parameterDefinitions.values()) {
      if (definition.required && !this.parameters.has(definition.name)) {
        missing.push(definition.name);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Get parameter input form schema for UI generation
   * @returns {Object} Form schema
   */
  getFormSchema() {
    const categories = {};
    
    for (const definition of this.getParameterDefinitions()) {
      if (!categories[definition.category]) {
        categories[definition.category] = [];
      }
      
      const field = {
        name: definition.name,
        label: definition.description || definition.name,
        type: definition.type,
        defaultValue: definition.defaultValue,
        required: definition.required,
        unit: definition.unit,
        order: definition.order
      };
      
      if (definition.type === 'number' || definition.type === 'integer') {
        if (field.min = definition.min) {
          ;
        }
        if (field.max = definition.max) {
          ;
        }
      }
      
      if (definition.type === 'select') {
        field.options = definition.options;
      }
      
      categories[definition.category].push(field);
    }
    
    return { categories };
  }

  /**
   * Clear all parameters and definitions
   */
  clear() {
    this.parameters.clear();
    this.parameterDefinitions.clear();
    this.presets.clear();
    this.validationRules.clear();
    logger.debug('Parameter manager cleared');
  }

  /**
   * Reset parameters to default values
   */
  resetToDefaults() {
    for (const [name, definition] of this.parameterDefinitions) {
      this.parameters.set(name, definition.defaultValue);
    }
    logger.debug('Parameters reset to default values');
  }

  /**
   * Export parameters and definitions
   * @returns {Object} Exported data
   */
  exportData() {
    return {
      parameters: Object.fromEntries(this.parameters),
      definitions: Array.from(this.parameterDefinitions.values()),
      presets: Array.from(this.presets.values())
    };
  }

  /**
   * Import parameters and definitions
   * @param {Object} data - Imported data
   */
  importData(data) {
    if (data.definitions) {
      this.defineParameters(data.definitions);
    }
    
    if (data.parameters) {
      this.setParameters(data.parameters);
    }
    
    if (data.presets) {
      for (const preset of data.presets) {
        this.presets.set(preset.name, preset);
      }
    }
    
    logger.debug('Parameter data imported');
  }
}

module.exports = { ParameterManager };