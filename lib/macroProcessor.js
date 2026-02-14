const { VariableManager } = require('./variableManager');
const { logger } = require('./logger');

/**
 * Macro Processor for G-code
 * Handles macro definition, expansion, subroutine calls, and control flow
 */
class MacroProcessor {
  constructor() {
    this.variableManager = new VariableManager();
    this.macros = new Map(); // User-defined macros
    this.subroutines = new Map(); // Subroutine definitions
    this.callStack = []; // For nested calls
    this.controlFlowStack = []; // For IF/WHILE nesting

    this.executionState = {
      currentMacro: null,
      currentLine: 0,
      totalLines: 0,
      breakpoints: new Set(),
      stepping: false,
      paused: false,
    };

    this.initializeBuiltinMacros();
  }

  /**
   * Reset processor state
   */
  reset() {
    this.variableManager.reset();
    this.callStack.length = 0;
    this.controlFlowStack.length = 0;
    this.executionState = {
      currentMacro: null,
      currentLine: 0,
      totalLines: 0,
      breakpoints: new Set(),
      stepping: false,
      paused: false,
    };

    logger.info('Macro processor reset');
  }

  /**
   * Define a macro
   * @param {string} name - Macro name
   * @param {Array} parameters - Parameter definitions
   * @param {string} body - Macro G-code body
   * @param {string} description - Macro description
   */
  defineMacro(name, parameters = [], body = '', description = '') {
    const macro = {
      name: name.toUpperCase(),
      parameters: parameters.map(p => ({
        name: p.name.toUpperCase(),
        type: p.type || 'number',
        defaultValue: p.defaultValue || 0,
        description: p.description || '',
      })),
      body: body,
      description: description,
      createdAt: new Date().toISOString(),
    };

    this.macros.set(macro.name, macro);
    logger.info(`Defined macro: ${macro.name}`, { parameters: parameters.length });

    return macro;
  }

  /**
   * Get macro definition
   * @param {string} name - Macro name
   * @returns {Object|null} Macro definition
   */
  getMacro(name) {
    return this.macros.get(name.toUpperCase()) || null;
  }

  /**
   * Delete macro
   * @param {string} name - Macro name
   * @returns {boolean} Success
   */
  deleteMacro(name) {
    const deleted = this.macros.delete(name.toUpperCase());
    if (deleted) {
      logger.info(`Deleted macro: ${name}`);
    }
    return deleted;
  }

  /**
   * List all defined macros
   * @returns {Array} Array of macro definitions
   */
  listMacros() {
    return Array.from(this.macros.values());
  }

  /**
   * Process G-code with macro expansion and control flow
   * @param {string} gcode - Input G-code
   * @param {Object} context - Execution context
   * @returns {string} Processed G-code
   */
  async processGCode(gcode, context = {}) {
    this.executionState.totalLines = gcode.split('\n').length;
    this.executionState.currentLine = 0;

    const lines = gcode
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    const processedLines = [];

    let i = 0;
    while (i < lines.length) {
      this.executionState.currentLine = i + 1;

      try {
        const line = lines[i];
        const result = await this.processLine(line, lines, i, context);

        if (result.jump !== undefined) {
          // Handle GOTO or control flow jumps
          i = result.jump;
          continue;
        }

        if (result.processed) {
          if (Array.isArray(result.processed)) {
            processedLines.push(...result.processed);
          } else {
            processedLines.push(result.processed);
          }
        }

        i++;
      } catch (error) {
        logger.error(`Error processing line ${i + 1}: ${lines[i]}`, { error: error.message });
        throw new Error(`Line ${i + 1}: ${error.message}`);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * Process a single line of G-code
   * @param {string} line - Line to process
   * @param {Array} allLines - All lines in the program
   * @param {number} lineIndex - Current line index
   * @param {Object} context - Execution context
   * @returns {Object} Processing result
   */
  async processLine(line, allLines, lineIndex, context) {
    // Skip empty lines and comments
    if (!line || line.startsWith(';') || line.startsWith('(')) {
      return { processed: line };
    }

    // Handle macro definitions
    if (line.startsWith('%MACRO')) {
      return this.processMacroDefinition(line, allLines, lineIndex);
    }

    // Handle macro calls
    if (line.startsWith('%CALL')) {
      return await this.processMacroCall(line, context);
    }

    // Handle variable assignments
    if (line.includes('=') && line.match(/#[A-Za-z_][A-Za-z0-9_]*\s*=/)) {
      return this.processVariableAssignment(line);
    }

    // Handle subroutine calls (M98)
    if (line.match(/M98/i)) {
      return await this.processSubroutineCall(line, allLines, context);
    }

    // Handle subroutine returns (M99)
    if (line.match(/M99/i)) {
      return this.processSubroutineReturn(line);
    }

    // Handle control flow statements
    if (line.match(/^IF\s|^WHILE\s|^GOTO\s|^ENDIF|^ENDWHILE/i)) {
      return this.processControlFlow(line, allLines, lineIndex);
    }

    // Expand variables in regular G-code lines
    return { processed: this.expandVariables(line) };
  }

  /**
   * Process macro definition
   * @param {string} line - Macro definition line
   * @param {Array} allLines - All lines
   * @param {number} startIndex - Start line index
   * @returns {Object} Processing result
   */
  processMacroDefinition(line, allLines, startIndex) {
    // Parse macro header: %MACRO NAME(param1, param2)
    const match = line.match(/%MACRO\s+(\w+)\s*\(([^)]*)\)?/i);
    if (!match) {
      throw new Error('Invalid macro definition syntax');
    }

    const macroName = match[1];
    const paramString = match[2] || '';
    const parameters = paramString
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => ({ name: p, type: 'number', defaultValue: 0 }));

    // Find macro body (until %ENDMACRO)
    const bodyLines = [];
    let i = startIndex + 1;

    while (i < allLines.length && !allLines[i].match(/%ENDMACRO/i)) {
      bodyLines.push(allLines[i]);
      i++;
    }

    if (i >= allLines.length) {
      throw new Error('Macro definition not closed with %ENDMACRO');
    }

    const body = bodyLines.join('\n');
    this.defineMacro(macroName, parameters, body);

    return { jump: i }; // Skip to after %ENDMACRO
  }

  /**
   * Process macro call
   * @param {string} line - Macro call line
   * @param {Object} context - Execution context
   * @returns {Object} Processing result
   */
  async processMacroCall(line, context) {
    // Parse call: %CALL MACRO_NAME(arg1, arg2, ...)
    const match = line.match(/%CALL\s+(\w+)\s*\(([^)]*)\)?/i);
    if (!match) {
      throw new Error('Invalid macro call syntax');
    }

    const macroName = match[1];
    const argString = match[2] || '';
    const args = argString
      .split(',')
      .map(arg => arg.trim())
      .filter(arg => arg.length > 0);

    const macro = this.getMacro(macroName);
    if (!macro) {
      throw new Error(`Undefined macro: ${macroName}`);
    }

    // Push new variable scope for macro execution
    this.variableManager.pushScope();

    try {
      // Bind parameters to arguments
      for (let i = 0; i < macro.parameters.length; i++) {
        const param = macro.parameters[i];
        const argValue =
          i < args.length ? this.variableManager.evaluateExpression(args[i]) : param.defaultValue;

        this.variableManager.setVariable(param.name, argValue, true);
      }

      // Process macro body
      const expandedBody = await this.processGCode(macro.body, context);

      return { processed: expandedBody.split('\n') };
    } finally {
      // Pop variable scope
      this.variableManager.popScope();
    }
  }

  /**
   * Process variable assignment
   * @param {string} line - Assignment line
   * @returns {Object} Processing result
   */
  processVariableAssignment(line) {
    // Parse assignment: #VAR = expression
    const match = line.match(/#([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)/);
    if (!match) {
      throw new Error('Invalid variable assignment syntax');
    }

    const varName = match[1];
    const expression = match[2];

    const value = this.variableManager.evaluateExpression(expression);
    this.variableManager.setVariable(varName, value);

    return { processed: `; ${varName} = ${value}` }; // Comment in output
  }

  /**
   * Process subroutine call (M98)
   * @param {string} line - Subroutine call line
   * @param {Array} allLines - All lines
   * @param {Object} context - Execution context
   * @returns {Object} Processing result
   */
  async processSubroutineCall(line, allLines, context) {
    // Parse M98 P<number> L<repeat>
    const pMatch = line.match(/P(\d+)/i);
    const lMatch = line.match(/L(\d+)/i);

    if (!pMatch) {
      throw new Error('M98 requires P parameter (subroutine number)');
    }

    const subroutineNumber = parseInt(pMatch[1]);
    const repeatCount = lMatch ? parseInt(lMatch[1]) : 1;

    // Find subroutine in the code
    const subroutineStart = this.findSubroutine(subroutineNumber, allLines);
    if (subroutineStart === -1) {
      throw new Error(`Subroutine N${subroutineNumber} not found`);
    }

    // Extract subroutine code
    const subroutineCode = this.extractSubroutine(subroutineNumber, allLines, subroutineStart);

    // Push call onto stack
    this.callStack.push({
      type: 'subroutine',
      number: subroutineNumber,
      returnLine: line,
      repeatCount: repeatCount,
      currentRepeat: 0,
    });

    this.variableManager.pushScope();

    const processedLines = [];

    try {
      // Execute subroutine the specified number of times
      for (let i = 0; i < repeatCount; i++) {
        const processed = await this.processGCode(subroutineCode, context);
        processedLines.push(...processed.split('\n'));
      }
    } finally {
      this.variableManager.popScope();
      this.callStack.pop();
    }

    return { processed: processedLines };
  }

  /**
   * Process subroutine return (M99)
   * @param {string} line - Return line
   * @returns {Object} Processing result
   */
  processSubroutineReturn(line) {
    if (this.callStack.length === 0) {
      throw new Error('M99 return without matching subroutine call');
    }

    // M99 is handled by the call stack management
    return { processed: `; Return from subroutine` };
  }

  /**
   * Find subroutine by number in code
   * @param {number} number - Subroutine number
   * @param {Array} lines - All code lines
   * @returns {number} Line index or -1 if not found
   */
  findSubroutine(number, lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`N${number}\\b`, 'i'))) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Extract subroutine code
   * @param {number} number - Subroutine number
   * @param {Array} lines - All code lines
   * @param {number} startIndex - Start line index
   * @returns {string} Subroutine code
   */
  extractSubroutine(number, lines, startIndex) {
    const subroutineLines = [];

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      // Stop at M99 (return) or next subroutine
      if (line.match(/M99/i) || line.match(/N\d+/i)) {
        break;
      }

      subroutineLines.push(line);
    }

    return subroutineLines.join('\n');
  }

  /**
   * Expand variables in G-code line
   * @param {string} line - G-code line
   * @returns {string} Line with variables expanded
   */
  expandVariables(line) {
    return line.replace(/#[A-Za-z_][A-Za-z0-9_]*|#\d+/g, match => {
      const varName = match.substring(1);
      const value = this.variableManager.getVariable(varName);
      return value.toString();
    });
  }

  /**
   * Process control flow statements
   * @param {string} line - Control flow line
   * @param {Array} allLines - All lines
   * @param {number} lineIndex - Current line index
   * @returns {Object} Processing result
   */
  processControlFlow(line, allLines, lineIndex) {
    const upperLine = line.toUpperCase().trim();

    if (upperLine.startsWith('IF')) {
      return this.processIfStatement(line, allLines, lineIndex);
    } else if (upperLine.startsWith('WHILE')) {
      return this.processWhileStatement(line, allLines, lineIndex);
    } else if (upperLine.startsWith('GOTO')) {
      return this.processGotoStatement(line, allLines);
    } else if (upperLine === 'ENDIF') {
      return this.processEndIf();
    } else if (upperLine === 'ENDWHILE') {
      return this.processEndWhile();
    }

    return { processed: line };
  }

  /**
   * Process IF statement
   * @param {string} line - IF line
   * @param {Array} allLines - All lines
   * @param {number} lineIndex - Current line index
   * @returns {Object} Processing result
   */
  processIfStatement(line, allLines, lineIndex) {
    // Parse IF condition
    const match = line.match(/IF\s+(.+)/i);
    if (!match) {
      throw new Error('Invalid IF statement syntax');
    }

    const condition = match[1];
    const conditionResult = this.evaluateCondition(condition);

    // Find matching ENDIF
    const endIfIndex = this.findMatchingEndIf(allLines, lineIndex);
    if (endIfIndex === -1) {
      throw new Error('IF statement without matching ENDIF');
    }

    this.controlFlowStack.push({
      type: 'if',
      condition: condition,
      result: conditionResult,
      startLine: lineIndex,
      endLine: endIfIndex,
    });

    if (!conditionResult) {
      // Skip to ENDIF
      return { jump: endIfIndex };
    }

    return { processed: `; IF ${condition} (true)` };
  }

  /**
   * Find matching ENDIF for IF statement
   * @param {Array} lines - All lines
   * @param {number} ifIndex - IF statement index
   * @returns {number} ENDIF index or -1
   */
  findMatchingEndIf(lines, ifIndex) {
    let nestLevel = 1;

    for (let i = ifIndex + 1; i < lines.length; i++) {
      const line = lines[i].toUpperCase().trim();

      if (line.startsWith('IF')) {
        nestLevel++;
      } else if (line === 'ENDIF') {
        nestLevel--;
        if (nestLevel === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Evaluate condition for IF/WHILE statements
   * @param {string} condition - Condition to evaluate
   * @returns {boolean} Condition result
   */
  evaluateCondition(condition) {
    try {
      // Expand variables in condition
      const expandedCondition = this.expandVariables(condition);

      // Simple comparison operators
      if (expandedCondition.includes('===')) {
        const [left, right] = expandedCondition.split('===').map(s => parseFloat(s.trim()));
        return left === right;
      } else if (expandedCondition.includes('!==')) {
        const [left, right] = expandedCondition.split('!==').map(s => parseFloat(s.trim()));
        return left !== right;
      } else if (expandedCondition.includes('>=')) {
        const [left, right] = expandedCondition.split('>=').map(s => parseFloat(s.trim()));
        return left >= right;
      } else if (expandedCondition.includes('<=')) {
        const [left, right] = expandedCondition.split('<=').map(s => parseFloat(s.trim()));
        return left <= right;
      } else if (expandedCondition.includes('>')) {
        const [left, right] = expandedCondition.split('>').map(s => parseFloat(s.trim()));
        return left > right;
      } else if (expandedCondition.includes('<')) {
        const [left, right] = expandedCondition.split('<').map(s => parseFloat(s.trim()));
        return left < right;
      } else {
        // Treat as boolean (non-zero is true)
        const value = this.variableManager.evaluateExpression(expandedCondition);
        return value !== 0;
      }
    } catch (error) {
      logger.error(`Error evaluating condition: ${condition}`, { error: error.message });
      return false;
    }
  }

  /**
   * Get current execution state for monitoring
   * @returns {Object} Current execution state
   */
  getExecutionState() {
    return {
      ...this.executionState,
      variables: this.variableManager.getAllVariables(),
      callStackDepth: this.callStack.length,
      controlFlowDepth: this.controlFlowStack.length,
    };
  }

  /**
   * Initialize built-in macros
   */
  initializeBuiltinMacros() {
    // Drilling macro
    this.defineMacro(
      'DRILL_HOLE',
      [
        { name: 'X', type: 'number', defaultValue: 0, description: 'X position' },
        { name: 'Y', type: 'number', defaultValue: 0, description: 'Y position' },
        { name: 'DEPTH', type: 'number', defaultValue: 5, description: 'Drill depth' },
        { name: 'FEED', type: 'number', defaultValue: 100, description: 'Feed rate' },
      ],
      `G00 X#X Y#Y
G01 Z-#DEPTH F#FEED
G00 Z0.1`,
      'Drill a hole at specified position'
    );

    // Rectangle cutting macro
    this.defineMacro(
      'CUT_RECTANGLE',
      [
        { name: 'X', type: 'number', defaultValue: 0, description: 'Start X position' },
        { name: 'Y', type: 'number', defaultValue: 0, description: 'Start Y position' },
        { name: 'WIDTH', type: 'number', defaultValue: 10, description: 'Rectangle width' },
        { name: 'HEIGHT', type: 'number', defaultValue: 10, description: 'Rectangle height' },
        { name: 'FEED', type: 'number', defaultValue: 200, description: 'Feed rate' },
      ],
      `G00 X#X Y#Y
G01 Z-2 F50
G01 X#X+#WIDTH F#FEED
G01 Y#Y+#HEIGHT
G01 X#X
G01 Y#Y
G00 Z5`,
      'Cut a rectangle'
    );

    logger.info('Initialized built-in macros', { count: this.macros.size });
  }
}

module.exports = { MacroProcessor };
