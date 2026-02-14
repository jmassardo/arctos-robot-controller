const { logger } = require('./logger');

/**
 * Advanced Mathematical Expression Parser for G-code Variables
 * Supports arithmetic, functions, logical operations, and conditional expressions
 */
class ExpressionParser {
  constructor() {
    // Mathematical functions
    this.functions = {
      SIN: Math.sin,
      COS: Math.cos,
      TAN: Math.tan,
      ASIN: Math.asin,
      ACOS: Math.acos,
      ATAN: Math.atan,
      ATAN2: Math.atan2,
      SQRT: Math.sqrt,
      ABS: Math.abs,
      ROUND: Math.round,
      FLOOR: Math.floor,
      CEIL: Math.ceil,
      EXP: Math.exp,
      LN: Math.log,
      LOG: Math.log10,
      MIN: Math.min,
      MAX: Math.max,
      POW: Math.pow,
      MOD: (a, b) => a % b,
      FIX: Math.trunc,
      FUP: n => (n < 0 ? Math.floor(n) : Math.ceil(n)),
    };

    // Logical comparison functions
    this.logicalFunctions = {
      EQ: (a, b) => (Math.abs(a - b) < 1e-10 ? 1 : 0),
      NE: (a, b) => (Math.abs(a - b) >= 1e-10 ? 1 : 0),
      GT: (a, b) => (a > b ? 1 : 0),
      GE: (a, b) => (a >= b ? 1 : 0),
      LT: (a, b) => (a < b ? 1 : 0),
      LE: (a, b) => (a <= b ? 1 : 0),
      AND: (a, b) => (Math.abs(a) > 1e-10 && Math.abs(b) > 1e-10 ? 1 : 0),
      OR: (a, b) => (Math.abs(a) > 1e-10 || Math.abs(b) > 1e-10 ? 1 : 0),
      XOR: (a, b) => (Math.abs(a) > 1e-10 !== Math.abs(b) > 1e-10 ? 1 : 0),
    };

    // Operator precedence (higher number = higher precedence)
    this.operatorPrecedence = {
      OR: 1,
      XOR: 2,
      AND: 3,
      EQ: 4,
      NE: 4,
      GT: 4,
      GE: 4,
      LT: 4,
      LE: 4,
      '+': 5,
      '-': 5,
      '*': 6,
      '/': 6,
      MOD: 6,
      '**': 7,
      'UNARY-': 8,
      'UNARY+': 8,
    };
  }

  /**
   * Parse and evaluate mathematical expression
   * @param {string} expression - Expression to evaluate
   * @param {Function} variableResolver - Function to resolve variable values
   * @returns {number} Result
   */
  evaluate(expression, variableResolver = null) {
    try {
      // Preprocess the expression
      const preprocessed = this.preprocess(expression);

      // Tokenize
      const tokens = this.tokenize(preprocessed);

      // Resolve variables if resolver provided
      const resolvedTokens = variableResolver
        ? this.resolveVariables(tokens, variableResolver)
        : tokens;

      // Parse to AST
      const ast = this.parse(resolvedTokens);

      // Evaluate AST
      const result = this.evaluateAST(ast);

      logger.debug(`Expression evaluated: ${expression} = ${result}`);
      return result;
    } catch (error) {
      logger.error(`Expression evaluation failed: ${expression}`, { error: error.message });
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Preprocess expression to handle special syntax
   * @param {string} expression
   * @returns {string}
   */
  preprocess(expression) {
    let processed = expression.toString().trim().toUpperCase();

    // Handle square brackets (G-code standard for expressions)
    processed = processed.replace(/\[/g, '(').replace(/\]/g, ')');

    // Handle IF/THEN/ELSE conditionals
    processed = this.preprocessConditionals(processed);

    // Handle ** power operator (convert to POW function)
    processed = processed.replace(/\*\*/g, '^');

    return processed;
  }

  /**
   * Handle conditional expressions (IF/THEN/ELSE)
   * @param {string} expression
   * @returns {string}
   */
  preprocessConditionals(expression) {
    // Handle nested IF/THEN/ELSE expressions
    // Convert IF[condition]THEN[value1]ELSE[value2] to CONDITIONAL(condition,value1,value2)

    const conditionalPattern = /IF\s*\(([^)]+)\)\s*THEN\s*\(([^)]+)\)\s*(?:ELSE\s*\(([^)]+)\))?/g;

    return expression.replace(
      conditionalPattern,
      (match, condition, thenValue, elseValue = '0') => {
        return `CONDITIONAL(${condition},${thenValue},${elseValue})`;
      }
    );
  }

  /**
   * Tokenize expression into components
   * @param {string} expression
   * @returns {Array} Tokens
   */
  tokenize(expression) {
    const tokens = [];
    const tokenPattern = /(\d+\.?\d*|[A-Z_]+\d*|[+\-*/()^,]|#\w+|\w+)/g;
    let match;

    while ((match = tokenPattern.exec(expression)) !== null) {
      const token = match[0];

      if (/^\d+\.?\d*$/.test(token)) {
        tokens.push({ type: 'number', value: parseFloat(token) });
      } else if (/^#\w+$/.test(token)) {
        tokens.push({ type: 'variable', value: token });
      } else if (this.functions[token] || this.logicalFunctions[token] || token === 'CONDITIONAL') {
        tokens.push({ type: 'function', value: token });
      } else if (['+', '-', '*', '/', '^', 'MOD'].includes(token)) {
        tokens.push({ type: 'operator', value: token });
      } else if (['(', ')'].includes(token)) {
        tokens.push({ type: 'parenthesis', value: token });
      } else if (token === ',') {
        tokens.push({ type: 'comma', value: token });
      } else if (['EQ', 'NE', 'GT', 'GE', 'LT', 'LE', 'AND', 'OR', 'XOR'].includes(token)) {
        tokens.push({ type: 'logical', value: token });
      } else {
        throw new Error(`Unknown token: ${token}`);
      }
    }

    return tokens;
  }

  /**
   * Resolve variables in token stream
   * @param {Array} tokens
   * @param {Function} variableResolver
   * @returns {Array}
   */
  resolveVariables(tokens, variableResolver) {
    return tokens.map(token => {
      if (token.type === 'variable') {
        const value = variableResolver(token.value);
        return { type: 'number', value: value };
      }
      return token;
    });
  }

  /**
   * Parse tokens to Abstract Syntax Tree
   * @param {Array} tokens
   * @returns {Object} AST
   */
  parse(tokens) {
    this.tokens = tokens;
    this.position = 0;
    return this.parseExpression();
  }

  /**
   * Parse expression with operator precedence
   * @param {number} minPrecedence
   * @returns {Object}
   */
  parseExpression(minPrecedence = 0) {
    let left = this.parsePrimary();

    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position];

      if (token.type !== 'operator' && token.type !== 'logical') {
        break;
      }

      const precedence = this.operatorPrecedence[token.value];
      if (precedence < minPrecedence) {
        break;
      }

      this.position++; // consume operator

      const right = this.parseExpression(precedence + 1);

      left = {
        type: 'binary',
        operator: token.value,
        left: left,
        right: right,
      };
    }

    return left;
  }

  /**
   * Parse primary expressions (numbers, functions, parentheses)
   * @returns {Object}
   */
  parsePrimary() {
    if (this.position >= this.tokens.length) {
      throw new Error('Unexpected end of expression');
    }

    const token = this.tokens[this.position];

    if (token.type === 'number') {
      this.position++;
      return { type: 'number', value: token.value };
    }

    if (token.type === 'function') {
      return this.parseFunction();
    }

    if (token.type === 'parenthesis' && token.value === '(') {
      this.position++; // consume '('
      const expr = this.parseExpression();

      if (
        this.position >= this.tokens.length ||
        this.tokens[this.position].type !== 'parenthesis' ||
        this.tokens[this.position].value !== ')'
      ) {
        throw new Error('Missing closing parenthesis');
      }

      this.position++; // consume ')'
      return expr;
    }

    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      this.position++; // consume unary operator
      const operand = this.parsePrimary();
      return {
        type: 'unary',
        operator: token.value,
        operand: operand,
      };
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  /**
   * Parse function calls
   * @returns {Object}
   */
  parseFunction() {
    const functionToken = this.tokens[this.position];
    this.position++; // consume function name

    if (
      this.position >= this.tokens.length ||
      this.tokens[this.position].type !== 'parenthesis' ||
      this.tokens[this.position].value !== '('
    ) {
      throw new Error(`Expected '(' after function ${functionToken.value}`);
    }

    this.position++; // consume '('

    const args = [];

    if (
      this.position < this.tokens.length &&
      !(
        this.tokens[this.position].type === 'parenthesis' &&
        this.tokens[this.position].value === ')'
      )
    ) {
      args.push(this.parseExpression());

      while (this.position < this.tokens.length && this.tokens[this.position].type === 'comma') {
        this.position++; // consume ','
        args.push(this.parseExpression());
      }
    }

    if (
      this.position >= this.tokens.length ||
      this.tokens[this.position].type !== 'parenthesis' ||
      this.tokens[this.position].value !== ')'
    ) {
      throw new Error(`Missing closing parenthesis for function ${functionToken.value}`);
    }

    this.position++; // consume ')'

    return {
      type: 'function',
      name: functionToken.value,
      arguments: args,
    };
  }

  /**
   * Evaluate Abstract Syntax Tree
   * @param {Object} node
   * @returns {number}
   */
  evaluateAST(node) {
    switch (node.type) {
      case 'number':
        return node.value;

      case 'binary':
        const left = this.evaluateAST(node.left);
        const right = this.evaluateAST(node.right);
        return this.evaluateBinaryOperation(node.operator, left, right);

      case 'unary':
        const operand = this.evaluateAST(node.operand);
        return node.operator === '-' ? -operand : operand;

      case 'function':
        const args = node.arguments.map(arg => this.evaluateAST(arg));
        return this.evaluateFunction(node.name, args);

      default:
        throw new Error(`Unknown AST node type: ${node.type}`);
    }
  }

  /**
   * Evaluate binary operation
   * @param {string} operator
   * @param {number} left
   * @param {number} right
   * @returns {number}
   */
  evaluateBinaryOperation(operator, left, right) {
    switch (operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (Math.abs(right) < 1e-10) {
          throw new Error('Division by zero');
        }
        return left / right;
      case '^':
        return Math.pow(left, right);
      case 'MOD':
        return left % right;
      default:
        // Logical operations
        if (this.logicalFunctions[operator]) {
          return this.logicalFunctions[operator](left, right);
        }
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Evaluate function call
   * @param {string} name
   * @param {Array} args
   * @returns {number}
   */
  evaluateFunction(name, args) {
    if (name === 'CONDITIONAL') {
      // Special handling for conditional expressions
      if (args.length !== 3) {
        throw new Error('CONDITIONAL function requires exactly 3 arguments');
      }
      return Math.abs(args[0]) > 1e-10 ? args[1] : args[2];
    }

    if (this.functions[name]) {
      const func = this.functions[name];

      // Validate argument count for known functions
      const expectedArgs = func.length;
      if (expectedArgs > 0 && args.length !== expectedArgs && name !== 'MIN' && name !== 'MAX') {
        throw new Error(`Function ${name} expects ${expectedArgs} arguments, got ${args.length}`);
      }

      return func(...args);
    }

    if (this.logicalFunctions[name]) {
      const func = this.logicalFunctions[name];
      if (args.length !== 2) {
        throw new Error(`Logical function ${name} expects exactly 2 arguments, got ${args.length}`);
      }
      return func(args[0], args[1]);
    }

    throw new Error(`Unknown function: ${name}`);
  }

  /**
   * Test if expression is valid (syntax check only)
   * @param {string} expression
   * @returns {boolean}
   */
  isValidExpression(expression) {
    try {
      const preprocessed = this.preprocess(expression);
      const tokens = this.tokenize(preprocessed);
      this.parse(tokens);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of variables referenced in expression
   * @param {string} expression
   * @returns {Array<string>}
   */
  getVariableReferences(expression) {
    try {
      const preprocessed = this.preprocess(expression);
      const tokens = this.tokenize(preprocessed);

      return tokens
        .filter(token => token.type === 'variable')
        .map(token => token.value)
        .filter((value, index, array) => array.indexOf(value) === index); // unique values
    } catch (error) {
      logger.warn(`Failed to extract variable references from: ${expression}`, {
        error: error.message,
      });
      return [];
    }
  }
}

module.exports = { ExpressionParser };
