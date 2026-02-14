// eslint.config.js - Enhanced ESLint v9.x Configuration for Code Quality
module.exports = [
  // Base JavaScript configuration with comprehensive quality rules
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      // Essential rules from eslint:recommended
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off', // Allowed for server logging
      'no-debugger': 'error',

      // Code Quality Rules (targeting current warnings)
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      curly: ['warn', 'all'],

      // Security Rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Performance Rules
      'no-loop-func': 'warn',
      'no-await-in-loop': 'warn',

      // Best Practices
      'consistent-return': 'warn',
      'no-unused-expressions': [
        'warn',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      'no-useless-return': 'warn',
      'require-await': 'warn',

      // Style Rules (gentle enforcement)
      'comma-dangle': ['warn', 'never'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      semi: ['warn', 'always'],
      'no-trailing-spaces': 'warn',
    },
  },

  // Server-specific configuration
  {
    files: ['server.js'],
    rules: {
      'max-lines': ['warn', { max: 2000, skipComments: true }],
      complexity: ['warn', { max: 15 }], // Higher limit for main server file
    },
  },

  // Library files configuration
  {
    files: ['lib/**/*.js'],
    rules: {
      'max-lines': ['warn', { max: 800, skipComments: true }],
      complexity: ['warn', { max: 12 }],
    },
  },

  // Test file configuration
  {
    files: ['test/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        // Node.js test globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        test: 'readonly',
        expect: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off', // Tests often have unused parameters
      'no-console': 'off',
      complexity: 'off', // Tests can be complex
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'client/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'logs/**',
      'tmp/**',
      '.git/**',
      'persona-outputs/**',
    ],
  },
];
