const { logger } = require('./logger');
const { ExpressionParser } = require('./expressionParser');
const { SystemVariables } = require('./systemVariables');
const { ParameterManager } = require('./parameterManager');

/**
 * Enhanced Variable Manager for G-code Variables and Parameters
 * Handles variable declaration, assignment, arithmetic operations, scope management,
 * system variables, and program parameters
 */
class VariableManager {
  constructor() {
    // Global variables persist across program runs
    this.globalVariables = new Map();

    // Local variables are scoped to current macro/subroutine call
    this.localScopes = []; // Stack of local variable scopes

    // Named variables for easier reference
    this.namedVariables = new Map();

    // Initialize sub-managers
    this.expressionParser = new ExpressionParser();
    this.systemVariables = new SystemVariables();
    this.parameterManager = new ParameterManager();

    // Initialize system
    this.systemVariables.initialize();

    this.reset();
  }

  /**
   * Reset all variables to initial state
   */
  reset() {
    this.globalVariables.clear();
    this.localScopes.length = 0;
    this.namedVariables.clear();

    logger.debug('Variable manager reset');
  }

  /**
   * Push new local scope (for subroutine/macro calls)
   */
  pushScope() {
    this.localScopes.push(new Map());
    logger.debug(`Pushed new local scope, depth: ${this.localScopes.length}`);
  }

  /**
   * Pop current local scope (return from subroutine/macro)
   */
  popScope() {
    if (this.localScopes.length > 0) {
      const popped = this.localScopes.pop();
      logger.debug(
        `Popped local scope, depth: ${this.localScopes.length}, variables: ${popped.size}`
      );
      return popped;
    }
    return null;
  }

  /**
   * Set variable value with enhanced system variable handling
   * @param {string|number} name - Variable name or number (#1, #2, etc)
   * @param {number} value - Variable value
   * @param {boolean} isLocal - Whether to set in local scope
   */
  setVariable(name, value, isLocal = false) {
    const normalizedName = this.normalizeVariableName(name);
    const numericValue = this.parseValue(value);

    // Check if it's a system variable
    const numericName = parseInt(normalizedName);
    if (!isNaN(numericName) && this.systemVariables.isSystemVariable(numericName)) {
      if (this.systemVariables.isReadOnlyVariable(numericName)) {
        throw new Error(`Cannot assign to read-only system variable: #${normalizedName}`);
      }

      const success = this.systemVariables.setVariable(numericName, numericValue);
      if (!success) {
        throw new Error(`Cannot assign to system variable: #${normalizedName}`);
      }
      return;
    }

    // Handle parameter assignment
    if (isNaN(normalizedName)) {
      try {
        this.parameterManager.setParameter(normalizedName, numericValue);
        return;
      } catch (error) {
        logger.debug(`Parameter assignment failed, treating as user variable: ${error.message}`);
      }
    }

    if (isLocal && this.localScopes.length > 0) {
      // Set in current local scope
      this.localScopes[this.localScopes.length - 1].set(normalizedName, numericValue);
    } else {
      // Set in global scope
      this.globalVariables.set(normalizedName, numericValue);
    }

    // Update named variable mapping if it's a named variable
    if (isNaN(normalizedName)) {
      this.namedVariables.set(normalizedName, numericValue);
    }

    logger.debug(
      `Set variable ${normalizedName} = ${numericValue} (${isLocal ? 'local' : 'global'})`
    );
  }

  /**
   * Get variable value with enhanced resolution
   * @param {string|number} name - Variable name or number
   * @returns {number} Variable value
   */
  getVariable(name) {
    const normalizedName = this.normalizeVariableName(name);

    // Check if it's a system variable (numeric >= 5000)
    const numericName = parseInt(normalizedName);
    if (!isNaN(numericName) && this.systemVariables.isSystemVariable(numericName)) {
      return this.systemVariables.getVariable(numericName);
    }

    // Check parameter manager for named parameters
    if (isNaN(normalizedName)) {
      const paramValue = this.parameterManager.getParameter(normalizedName);
      if (paramValue !== 0 || this.parameterManager.parameterDefinitions.has(normalizedName)) {
        return paramValue;
      }
    }

    // Check local scopes (most recent first)
    for (let i = this.localScopes.length - 1; i >= 0; i--) {
      if (this.localScopes[i].has(normalizedName)) {
        return this.localScopes[i].get(normalizedName);
      }
    }

    // Check global variables
    if (this.globalVariables.has(normalizedName)) {
      return this.globalVariables.get(normalizedName);
    }

    // Check named variables
    if (this.namedVariables.has(normalizedName)) {
      return this.namedVariables.get(normalizedName);
    }

    // Return 0 for undefined variables (G-code standard)
    logger.debug(`Variable ${normalizedName} not found, returning 0`);
    return 0;
  }

  /**
   * Check if variable exists with enhanced resolution
   * @param {string|number} name - Variable name or number
   * @returns {boolean}
   */
  hasVariable(name) {
    const normalizedName = this.normalizeVariableName(name);

    // Check system variables
    const numericName = parseInt(normalizedName);
    if (!isNaN(numericName) && this.systemVariables.isSystemVariable(numericName)) {
      return true;
    }

    // Check parameter manager
    if (isNaN(normalizedName) && this.parameterManager.parameterDefinitions.has(normalizedName)) {
      return true;
    }

    // Check local scopes
    for (let i = this.localScopes.length - 1; i >= 0; i--) {
      if (this.localScopes[i].has(normalizedName)) {
        return true;
      }
    }

    return this.globalVariables.has(normalizedName) || this.namedVariables.has(normalizedName);
  }

  /**
   * Update system variables (current positions)
   * @param {Object} positions - Current robot positions
   */
  updateSystemVariables(positions) {
    this.systemVariables.updateCurrentPosition(positions);
    this.systemVariables.updateMachinePosition(positions);
  }

  /**
   * Update feed rate system variable
   * @param {number} feedRate - Feed rate in mm/min
   */
  updateFeedRate(feedRate) {
    this.systemVariables.updateFeedRate(feedRate);
  }

  /**
   * Update spindle speed system variable
   * @param {number} spindleSpeed - Spindle speed in RPM
   */
  updateSpindleSpeed(spindleSpeed) {
    this.systemVariables.updateSpindleSpeed(spindleSpeed);
  }

  /**
   * Enhanced expression evaluation using the expression parser
   * @param {string} expression - Expression to evaluate
   * @returns {number} Result
   */
  evaluateExpression(expression) {
    try {
      // Create variable resolver function
      const variableResolver = varName => {
        // Remove # prefix if present
        const cleanName = varName.startsWith('#') ? varName.substring(1) : varName;
        return this.getVariable(cleanName);
      };

      // Use the advanced expression parser
      const result = this.expressionParser.evaluate(expression, variableResolver);

      logger.debug(`Enhanced expression evaluation: ${expression} = ${result}`);
      return result;
    } catch (error) {
      logger.error(`Failed to evaluate expression: ${expression}`, { error: error.message });
      throw new Error(`Invalid expression: ${expression} (${error.message})`);
    }
  }

  /**
   * Get all variables for debugging/monitoring with enhanced data
   * @returns {Object} All variable values organized by scope
   */
  getAllVariables() {
    return {
      system: this.systemVariables.getAllVariables(),
      parameters: this.parameterManager.getAllParameters(),
      global: Object.fromEntries(this.globalVariables),
      named: Object.fromEntries(this.namedVariables),
      local: this.localScopes.map(scope => Object.fromEntries(scope)),
    };
  }

  /**
   * Preprocess G-code with variable substitution
   * @param {string} gcode - G-code program
   * @param {Object} parameters - Program parameters
   * @returns {string} Processed G-code
   */
  preprocessGCode(gcode, parameters = {}) {
    try {
      // Set parameters if provided
      if (Object.keys(parameters).length > 0) {
        this.parameterManager.setParameters(parameters);
      }

      let processedCode = gcode;

      // Find and evaluate all expressions in square brackets
      const expressionPattern = /\[([^\[\]]+)\]/g;
      let match;

      while ((match = expressionPattern.exec(processedCode)) !== null) {
        const expression = match[1];
        try {
          const result = this.evaluateExpression(expression);
          processedCode = processedCode.replace(match[0], result.toString());
        } catch (error) {
          logger.warn(`Failed to evaluate expression in G-code: ${expression}`, {
            error: error.message,
          });
        }
      }

      // Replace direct variable references (not in expressions)
      const variablePattern = /#([A-Za-z_][A-Za-z0-9_]*|\d+)(?!\s*[+\-*/])/g;

      processedCode = processedCode.replace(variablePattern, (match, varName) => {
        try {
          const value = this.getVariable(varName);
          return value.toString();
        } catch (error) {
          logger.warn(`Failed to resolve variable in G-code: ${varName}`, { error: error.message });
          return match; // Leave unchanged if resolution fails
        }
      });

      logger.debug('G-code preprocessing completed');
      return processedCode;
    } catch (error) {
      logger.error('G-code preprocessing failed', { error: error.message });
      throw new Error(`G-code preprocessing failed: ${error.message}`);
    }
  }

  /**
   * Define program parameters
   * @param {Array} parameterDefinitions - Parameter definitions
   */
  defineParameters(parameterDefinitions) {
    this.parameterManager.defineParameters(parameterDefinitions);
  }

  /**
   * Set program parameters
   * @param {Object} parameters - Parameter values
   */
  setParameters(parameters) {
    this.parameterManager.setParameters(parameters);
  }

  /**
   * Get parameter definitions for UI
   * @returns {Array} Parameter definitions
   */
  getParameterDefinitions() {
    return this.parameterManager.getParameterDefinitions();
  }

  /**
   * Get parameter form schema
   * @returns {Object} Form schema
   */
  getParameterFormSchema() {
    return this.parameterManager.getFormSchema();
  }

  /**
   * Extract parameter usage from G-code
   * @param {string} gcode - G-code program
   * @returns {Array<string>} Parameter names used
   */
  extractParameterUsage(gcode) {
    return this.parameterManager.extractParameterUsage(gcode);
  }

  /**
   * Test if expression is valid
   * @param {string} expression - Expression to test
   * @returns {boolean} True if valid
   */
  isValidExpression(expression) {
    return this.expressionParser.isValidExpression(expression);
  }

  /**
   * Get variables referenced in expression
   * @param {string} expression - Expression to analyze
   * @returns {Array<string>} Variable names
   */
  getExpressionVariables(expression) {
    return this.expressionParser.getVariableReferences(expression);
  }

  /**
   * Normalize variable name to standard format
   * @param {string|number} name - Variable name
   * @returns {string} Normalized name
   */
  normalizeVariableName(name) {
    if (typeof name === 'number') {
      return name.toString();
    }

    let normalized = name.toString().toUpperCase();

    // Remove # prefix if present
    if (normalized.startsWith('#')) {
      normalized = normalized.substring(1);
    }

    return normalized;
  }

  /**
   * Check if variable is a system variable
   * @param {string} name - Variable name
   * @returns {boolean}
   */
  isSystemVariable(name) {
    const numericName = parseInt(name);
    return !isNaN(numericName) && this.systemVariables.isSystemVariable(numericName);
  }

  /**
   * Parse value to number
   * @param {*} value - Value to parse
   * @returns {number}
   */
  parseValue(value) {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Handle expressions
      if (
        value.includes('+') ||
        value.includes('-') ||
        value.includes('*') ||
        value.includes('/')
      ) {
        return this.evaluateExpression(value);
      }

      const parsed = parseFloat(value);
      if (isNaN(parsed)) {
        throw new Error(`Invalid numeric value: ${value}`);
      }
      return parsed;
    }

    throw new Error(`Cannot convert to number: ${value}`);
  }

  /**
   * Safely evaluate basic arithmetic expressions
   * @param {string} expression - Arithmetic expression
   * @returns {number} Result
   */
  evaluateArithmetic(expression) {
    // Only allow numbers, basic operators, parentheses, and whitespace
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      throw new Error('Invalid characters in arithmetic expression');
    }

    try {
      // Use Function constructor for safe evaluation (no access to global scope)
      const result = Function('"use strict"; return (' + expression + ')')();

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a valid number');
      }

      return result;
    } catch (error) {
      throw new Error(`Arithmetic evaluation failed: ${error.message}`);
    }
  }
}

module.exports = { VariableManager };
