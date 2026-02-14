/**
 * Comprehensive Unit Tests for G-Code Parser Module
 * Following AAA Pattern with 100% Coverage Target
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Import modules under test
const { GCodeParser, GCodeManager } = require('../../lib/gcode-parser');

describe('GCodeParser - Comprehensive Unit Tests', () => {
  let parser;
  let testConfig;

  beforeEach(() => {
    // Arrange: Setup test configuration
    testConfig = {
      maxLines: 1000,
      maxFileSize: 1024 * 100, // 100KB for testing
      strictValidation: true,
      workspaceSize: {
        x: { min: -100, max: 100 },
        y: { min: -100, max: 100 },
        z: { min: -50, max: 50 },
        a: { min: -180, max: 180 },
        b: { min: -90, max: 90 },
        c: { min: -180, max: 180 },
      },
      arcSegmentResolution: 0.5,
    };

    parser = new GCodeParser(testConfig);
  });

  afterEach(() => {
    // Cleanup
    parser = null;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default configuration', () => {
      // Arrange & Act
      const defaultParser = new GCodeParser();

      // Assert
      assert.strictEqual(defaultParser.config.maxLines, 10000);
      assert.strictEqual(defaultParser.config.maxFileSize, 1024 * 1024);
      assert.strictEqual(defaultParser.config.strictValidation, false);
      assert.ok(defaultParser.config.supportedCommands.includes('G0'));
      assert.ok(defaultParser.config.supportedCommands.includes('G1'));
      assert.ok(defaultParser.config.supportedCommands.includes('M3'));
    });

    test('should initialize with custom configuration', () => {
      // Arrange & Act
      const customParser = new GCodeParser(testConfig);

      // Assert
      assert.strictEqual(customParser.config.maxLines, 1000);
      assert.strictEqual(customParser.config.maxFileSize, 1024 * 100);
      assert.strictEqual(customParser.config.strictValidation, true);
      assert.strictEqual(customParser.config.arcSegmentResolution, 0.5);
    });

    test('should merge custom config with defaults', () => {
      // Arrange
      const partialConfig = { maxLines: 500 };

      // Act
      const parser = new GCodeParser(partialConfig);

      // Assert
      assert.strictEqual(parser.config.maxLines, 500);
      assert.strictEqual(parser.config.maxFileSize, 1024 * 1024); // Default
      assert.ok(parser.config.supportedCommands.includes('G0')); // Default
    });

    test('should initialize parser state correctly', () => {
      // Arrange & Act
      const parser = new GCodeParser();

      // Assert
      assert.strictEqual(parser.state.absoluteMode, true);
      assert.strictEqual(parser.state.unitsInMM, true);
      assert.strictEqual(parser.state.currentPlane, 'XY');
      assert.deepStrictEqual(parser.state.currentPosition, { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 });
    });
  });

  describe('Basic G-Code Parsing', () => {
    test('should parse simple linear movement command', () => {
      // Arrange
      const gcode = 'G1 X10 Y20 Z5 F1000';

      // Act
      const result = parser.parseLine(gcode);

      // Assert
      assert.ok(result.valid);
      assert.strictEqual(result.command, 'G1');
      assert.strictEqual(result.parameters.X, 10);
      assert.strictEqual(result.parameters.Y, 20);
      assert.strictEqual(result.parameters.Z, 5);
      assert.strictEqual(result.parameters.F, 1000);
    });

    test('should parse rapid movement command', () => {
      // Arrange
      const gcode = 'G0 X50 Y-30';

      // Act
      const result = parser.parseLine(gcode);

      // Assert
      assert.ok(result.valid);
      assert.strictEqual(result.command, 'G0');
      assert.strictEqual(result.parameters.X, 50);
      assert.strictEqual(result.parameters.Y, -30);
      assert.strictEqual(result.type, 'rapid');
    });

    test('should parse circular interpolation commands', () => {
      // Arrange & Act & Assert
      const testCases = [
        { gcode: 'G2 X10 Y10 I5 J5', command: 'G2', type: 'arc_cw' },
        { gcode: 'G3 X-10 Y-10 I-5 J-5', command: 'G3', type: 'arc_ccw' },
      ];

      for (const testCase of testCases) {
        const result = parser.parseLine(testCase.gcode);
        assert.ok(result.valid, `Failed to parse: ${testCase.gcode}`);
        assert.strictEqual(result.command, testCase.command);
        assert.strictEqual(result.type, testCase.type);
        assert.ok(result.parameters.I !== undefined);
        assert.ok(result.parameters.J !== undefined);
      }
    });

    test('should parse spindle control commands', () => {
      // Arrange & Act & Assert
      const testCases = [
        { gcode: 'M3 S1000', command: 'M3', type: 'spindle_on', speed: 1000 },
        { gcode: 'M5', command: 'M5', type: 'spindle_off' },
      ];

      for (const testCase of testCases) {
        const result = parser.parseLine(testCase.gcode);
        assert.ok(result.valid, `Failed to parse: ${testCase.gcode}`);
        assert.strictEqual(result.command, testCase.command);
        assert.strictEqual(result.type, testCase.type);
        if (testCase.speed) {
          assert.strictEqual(result.parameters.S, testCase.speed);
        }
      }
    });

    test('should parse coordinate system commands', () => {
      // Arrange & Act & Assert
      const coordinateSystems = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];

      for (const system of coordinateSystems) {
        const result = parser.parseLine(system);
        assert.ok(result.valid, `Failed to parse: ${system}`);
        assert.strictEqual(result.command, system);
        assert.strictEqual(result.type, 'coordinate_system');
      }
    });

    test('should parse positioning mode commands', () => {
      // Arrange & Act & Assert
      const testCases = [
        { gcode: 'G90', command: 'G90', type: 'absolute_mode' },
        { gcode: 'G91', command: 'G91', type: 'incremental_mode' },
        { gcode: 'G20', command: 'G20', type: 'units_inches' },
        { gcode: 'G21', command: 'G21', type: 'units_mm' },
      ];

      for (const testCase of testCases) {
        const result = parser.parseLine(testCase.gcode);
        assert.ok(result.valid, `Failed to parse: ${testCase.gcode}`);
        assert.strictEqual(result.command, testCase.command);
        assert.strictEqual(result.type, testCase.type);
      }
    });
  });

  describe('State Management', () => {
    test('should track position changes in absolute mode', () => {
      // Arrange
      parser.reset();
      assert.deepStrictEqual(parser.state.currentPosition, { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 });

      // Act
      parser.parseLine('G1 X10 Y20 Z5');

      // Assert
      assert.strictEqual(parser.state.currentPosition.x, 10);
      assert.strictEqual(parser.state.currentPosition.y, 20);
      assert.strictEqual(parser.state.currentPosition.z, 5);
    });

    test('should track position changes in incremental mode', () => {
      // Arrange
      parser.reset();
      parser.parseLine('G1 X10 Y10'); // Set initial position
      parser.parseLine('G91'); // Switch to incremental

      // Act
      parser.parseLine('G1 X5 Y-5');

      // Assert
      assert.strictEqual(parser.state.currentPosition.x, 15);
      assert.strictEqual(parser.state.currentPosition.y, 5);
      assert.strictEqual(parser.state.absoluteMode, false);
    });

    test('should track units changes', () => {
      // Arrange & Act & Assert
      parser.parseLine('G20'); // Inches
      assert.strictEqual(parser.state.unitsInMM, false);

      parser.parseLine('G21'); // Millimeters
      assert.strictEqual(parser.state.unitsInMM, true);
    });

    test('should track plane selection', () => {
      // Arrange & Act & Assert
      const testCases = [
        { gcode: 'G17', plane: 'XY' },
        { gcode: 'G18', plane: 'XZ' },
        { gcode: 'G19', plane: 'YZ' },
      ];

      for (const testCase of testCases) {
        parser.parseLine(testCase.gcode);
        assert.strictEqual(parser.state.currentPlane, testCase.plane);
      }
    });

    test('should track coordinate system changes', () => {
      // Arrange & Act & Assert
      const systems = ['G54', 'G55', 'G56'];

      for (let i = 0; i < systems.length; i++) {
        parser.parseLine(systems[i]);
        assert.strictEqual(parser.state.currentCoordinateSystem, i + 1);
      }
    });

    test('should reset state correctly', () => {
      // Arrange
      parser.parseLine('G91'); // Incremental mode
      parser.parseLine('G20'); // Inches
      parser.parseLine('G1 X10 Y10');

      // Act
      parser.reset();

      // Assert
      assert.strictEqual(parser.state.absoluteMode, true);
      assert.strictEqual(parser.state.unitsInMM, true);
      assert.strictEqual(parser.state.currentPlane, 'XY');
      assert.deepStrictEqual(parser.state.currentPosition, { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 });
    });
  });

  describe('G-Code Validation', () => {
    test('should validate workspace limits', () => {
      // Arrange
      const parser = new GCodeParser({ ...testConfig, strictValidation: true });

      // Act & Assert
      const validMove = parser.parseLine('G1 X50 Y50 Z25');
      assert.ok(validMove.valid);

      const invalidMove = parser.parseLine('G1 X200 Y200 Z100'); // Exceeds limits
      assert.strictEqual(invalidMove.valid, false);
      assert.ok(invalidMove.errors.some(e => e.includes('workspace') || e.includes('limit')));
    });

    test('should validate supported commands', () => {
      // Arrange
      const parser = new GCodeParser({ strictValidation: true });

      // Act & Assert
      const supportedCommand = parser.parseLine('G1 X10');
      assert.ok(supportedCommand.valid);

      const unsupportedCommand = parser.parseLine('G999 X10');
      assert.strictEqual(unsupportedCommand.valid, false);
      assert.ok(
        unsupportedCommand.errors.some(e => e.includes('unsupported') || e.includes('G999'))
      );
    });

    test('should validate parameter ranges', () => {
      // Arrange
      const parser = new GCodeParser({ strictValidation: true });

      // Act & Assert
      const testCases = [
        { gcode: 'M3 S50000', valid: false, reason: 'spindle speed too high' },
        { gcode: 'G1 F60000', valid: false, reason: 'feed rate too high' },
        { gcode: 'G1 F100', valid: true, reason: 'valid feed rate' },
      ];

      for (const testCase of testCases) {
        const result = parser.parseLine(testCase.gcode);
        assert.strictEqual(
          result.valid,
          testCase.valid,
          `Expected ${testCase.gcode} to be ${testCase.valid}: ${testCase.reason}`
        );
      }
    });

    test('should validate arc parameters', () => {
      // Arrange
      const parser = new GCodeParser({ strictValidation: true });

      // Act & Assert
      const validArc = parser.parseLine('G2 X10 Y10 I5 J5');
      assert.ok(validArc.valid);

      const invalidArc = parser.parseLine('G2 X10 Y10'); // Missing I/J parameters
      assert.strictEqual(invalidArc.valid, false);
      assert.ok(
        invalidArc.errors.some(e => e.includes('arc') && (e.includes('I') || e.includes('J')))
      );
    });
  });

  describe('Comment and Line Number Handling', () => {
    test('should handle comments correctly', () => {
      // Arrange & Act & Assert
      const testCases = [
        { gcode: 'G1 X10 ; Move to X10', command: 'G1', comment: 'Move to X10' },
        { gcode: '(This is a comment)', command: null, comment: 'This is a comment' },
        { gcode: 'G1 X10 (inline comment) Y20', command: 'G1', x: 10, y: 20 },
      ];

      for (const testCase of testCases) {
        const result = parser.parseLine(testCase.gcode);
        if (testCase.command) {
          assert.strictEqual(result.command, testCase.command);
        }
        if (testCase.comment) {
          assert.ok(result.comment || result.originalLine.includes(testCase.comment));
        }
        if (testCase.x) {
          assert.strictEqual(result.parameters.X, testCase.x);
        }
        if (testCase.y) {
          assert.strictEqual(result.parameters.Y, testCase.y);
        }
      }
    });

    test('should handle line numbers', () => {
      // Arrange & Act
      const result = parser.parseLine('N100 G1 X10 Y10');

      // Assert
      assert.ok(result.valid);
      assert.strictEqual(result.lineNumber, 100);
      assert.strictEqual(result.command, 'G1');
      assert.strictEqual(result.parameters.X, 10);
      assert.strictEqual(result.parameters.Y, 10);
    });

    test('should handle empty lines and whitespace', () => {
      // Arrange & Act & Assert
      const testCases = ['', '   ', '\t', '\n', '   \t  \n  '];

      for (const gcode of testCases) {
        const result = parser.parseLine(gcode);
        assert.ok(result.valid || result.empty);
      }
    });
  });

  describe('Program Parsing', () => {
    test('should parse complete G-code program', () => {
      // Arrange
      const program = [
        'G21 ; Set units to millimeters',
        'G90 ; Absolute positioning',
        'G1 F1000 ; Set feed rate',
        'G0 X0 Y0 Z10 ; Move to start position',
        'G1 Z-5 ; Plunge',
        'G1 X10 Y0',
        'G1 X10 Y10',
        'G1 X0 Y10',
        'G1 X0 Y0',
        'G0 Z10 ; Retract',
        'M30 ; Program end',
      ].join('\n');

      // Act
      const result = parser.parseProgram(program);

      // Assert
      assert.ok(result.valid);
      assert.ok(result.lines.length > 0);
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.statistics);
      assert.ok(result.statistics.totalLines > 0);
      assert.ok(result.statistics.validLines > 0);
      assert.ok(result.boundingBox);
    });

    test('should calculate bounding box correctly', () => {
      // Arrange
      const program = ['G90', 'G1 X-10 Y-20 Z-5', 'G1 X30 Y40 Z10'].join('\n');

      // Act
      const result = parser.parseProgram(program);

      // Assert
      assert.ok(result.boundingBox);
      assert.strictEqual(result.boundingBox.min.x, -10);
      assert.strictEqual(result.boundingBox.min.y, -20);
      assert.strictEqual(result.boundingBox.min.z, -5);
      assert.strictEqual(result.boundingBox.max.x, 30);
      assert.strictEqual(result.boundingBox.max.y, 40);
      assert.strictEqual(result.boundingBox.max.z, 10);
    });

    test('should estimate execution time', () => {
      // Arrange
      const program = [
        'G1 F1000',
        'G1 X10 Y0', // 10mm at 1000mm/min = 0.6s
        'G1 X10 Y10', // 10mm at 1000mm/min = 0.6s
        'G0 X0 Y0', // Rapid move
      ].join('\n');

      // Act
      const result = parser.parseProgram(program);

      // Assert
      assert.ok(result.statistics.estimatedTime > 0);
      // Should be at least 1.2 seconds for the two G1 moves
      assert.ok(result.statistics.estimatedTime >= 1.0);
    });

    test('should collect used tools and coordinate systems', () => {
      // Arrange
      const program = [
        'T1 M6', // Tool change
        'G54', // Work coordinate system
        'M3 S1000',
        'G1 X10',
        'G55', // Another coordinate system
        'T2 M6',
      ].join('\n');

      // Act
      const result = parser.parseProgram(program);

      // Assert
      assert.ok(result.statistics.toolsUsed.includes(1));
      assert.ok(result.statistics.toolsUsed.includes(2));
      assert.ok(result.statistics.coordinateSystemsUsed.includes(1)); // G54
      assert.ok(result.statistics.coordinateSystemsUsed.includes(2)); // G55
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed G-code lines', () => {
      // Arrange & Act & Assert
      const malformedLines = [
        'G1 X', // Missing parameter value
        'G1 XYZ', // Invalid parameter format
        'G X10', // Missing command number
        'GG1 X10', // Invalid command format
        'G1 X10.5.5', // Invalid decimal format
      ];

      for (const line of malformedLines) {
        const result = parser.parseLine(line);
        assert.strictEqual(result.valid, false, `Line should be invalid: ${line}`);
        assert.ok(result.errors.length > 0);
      }
    });

    test('should handle large programs gracefully', () => {
      // Arrange
      const largeProgram = Array.from({ length: 2000 }, (_, i) => `G1 X${i} Y${i}`).join('\n');

      // Act
      const result = parser.parseProgram(largeProgram);

      // Assert
      if (parser.config.maxLines < 2000) {
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('too many lines') || e.includes('maxLines')));
      } else {
        assert.ok(result.valid);
      }
    });

    test('should handle programs exceeding file size limit', () => {
      // Arrange
      const largeLine = 'G1 X10 ' + 'Y10 '.repeat(1000); // Very long line
      const largeProgram = Array.from({ length: 200 }, () => largeLine).join('\n');

      // Act
      const result = parser.parseProgram(largeProgram);

      // Assert
      if (largeProgram.length > parser.config.maxFileSize) {
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('file size') || e.includes('too large')));
      }
    });

    test('should handle infinite loops in subroutines', () => {
      // Arrange
      const program = [
        'O100 SUB',
        'M98 P100', // Call self - infinite loop
        'M99',
        'M30',
      ].join('\n');

      // Act
      const result = parser.parseProgram(program);

      // Assert
      // Should detect and prevent infinite loops
      assert.ok(
        result.errors.length === 0 ||
          result.errors.some(e => e.includes('loop') || e.includes('recursion'))
      );
    });

    test('should validate parameter consistency', () => {
      // Arrange
      const inconsistentProgram = [
        'G90', // Absolute mode
        'G1 X10',
        'G91', // Switch to incremental
        'G1 X10', // Should be relative to previous position
        'G90', // Back to absolute
        'G1 X5', // Should move back (absolute)
      ].join('\n');

      // Act
      const result = parser.parseProgram(inconsistentProgram);

      // Assert
      assert.ok(result.valid);
      // Final position should be X=5 (absolute)
      assert.strictEqual(parser.state.currentPosition.x, 5);
    });
  });

  describe('Arc Interpolation', () => {
    test('should interpolate circular arcs correctly', () => {
      // Arrange
      const arcCommand = 'G2 X10 Y0 I5 J0'; // 180-degree arc

      // Act
      const result = parser.parseLine(arcCommand);
      const interpolatedPoints = parser.interpolateArc(result);

      // Assert
      assert.ok(interpolatedPoints);
      assert.ok(interpolatedPoints.length > 2); // Should have intermediate points

      // First point should be start position
      assert.deepStrictEqual(interpolatedPoints[0], { x: 0, y: 0, z: 0 });

      // Last point should be end position
      const lastPoint = interpolatedPoints[interpolatedPoints.length - 1];
      assert.ok(Math.abs(lastPoint.x - 10) < 0.001);
      assert.ok(Math.abs(lastPoint.y - 0) < 0.001);
    });

    test('should handle different arc planes', () => {
      // Arrange & Act & Assert
      const testCases = [
        { plane: 'G17', arc: 'G2 X10 Y0 I5 J0', axes: ['x', 'y'] },
        { plane: 'G18', arc: 'G2 X10 Z0 I5 K0', axes: ['x', 'z'] },
        { plane: 'G19', arc: 'G2 Y10 Z0 J5 K0', axes: ['y', 'z'] },
      ];

      for (const testCase of testCases) {
        parser.reset();
        parser.parseLine(testCase.plane);
        const result = parser.parseLine(testCase.arc);
        assert.ok(result.valid, `Arc in ${testCase.plane} plane should be valid`);
      }
    });
  });

  describe('Performance and Memory', () => {
    test('should handle parsing within reasonable time limits', () => {
      // Arrange
      const startTime = Date.now();
      const mediumProgram = Array.from(
        { length: 1000 },
        (_, i) => `G1 X${i} Y${Math.sin(i / 100) * 50} F1000`
      ).join('\n');

      // Act
      const result = parser.parseProgram(mediumProgram);
      const endTime = Date.now();

      // Assert
      assert.ok(result.valid);
      assert.ok(endTime - startTime < 5000, 'Parsing should complete within 5 seconds');
    });

    test('should not consume excessive memory', () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;

      // Act
      const program = Array.from({ length: 500 }, (_, i) => `G1 X${i} Y${i}`).join('\n');
      const result = parser.parseProgram(program);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Assert
      assert.ok(result.valid);
      assert.ok(memoryIncrease < 50 * 1024 * 1024, 'Memory increase should be less than 50MB');
    });
  });
});

describe('GCodeManager - Comprehensive Unit Tests', () => {
  let manager;
  let testFilePath;

  beforeEach(() => {
    // Arrange
    manager = new GCodeManager();
    testFilePath = path.join(__dirname, '../fixtures/test-gcode.nc');
  });

  afterEach(async () => {
    // Cleanup
    await fs.remove(testFilePath);
  });

  describe('File Operations', () => {
    test('should load G-code from file', async () => {
      // Arrange
      const testProgram = ['G21', 'G90', 'G1 X10 Y10 F1000', 'M30'].join('\n');
      await fs.writeFile(testFilePath, testProgram);

      // Act
      const result = await manager.loadFromFile(testFilePath);

      // Assert
      assert.ok(result.success);
      assert.ok(result.program);
      assert.ok(result.program.includes('G21'));
      assert.ok(result.program.includes('G1 X10 Y10'));
    });

    test('should save G-code to file', async () => {
      // Arrange
      const testProgram = ['G21', 'G90', 'G1 X10 Y10 F1000', 'M30'].join('\n');

      // Act
      const result = await manager.saveToFile(testFilePath, testProgram);

      // Assert
      assert.ok(result.success);
      assert.ok(await fs.pathExists(testFilePath));

      const savedContent = await fs.readFile(testFilePath, 'utf8');
      assert.strictEqual(savedContent.trim(), testProgram.trim());
    });

    test('should handle file not found error', async () => {
      // Arrange
      const nonExistentFile = path.join(__dirname, '../fixtures/nonexistent.nc');

      // Act
      const result = await manager.loadFromFile(nonExistentFile);

      // Assert
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('not found') || result.error.includes('ENOENT'));
    });

    test('should validate file extension', async () => {
      // Arrange
      const invalidFile = path.join(__dirname, '../fixtures/test.txt');

      // Act
      const result = await manager.loadFromFile(invalidFile);

      // Assert
      // Should either load successfully or warn about extension
      assert.ok(result.success || result.warnings.some(w => w.includes('extension')));
    });
  });

  describe('Program Validation and Processing', () => {
    test('should validate complete G-code program', () => {
      // Arrange
      const program = [
        'G21 ; Units in millimeters',
        'G90 ; Absolute positioning',
        'G1 F1000 ; Set feed rate',
        'G0 X0 Y0 Z5 ; Move to start',
        'G1 Z-2 ; Plunge',
        'G1 X10 Y10',
        'G0 Z5 ; Retract',
        'M30 ; End program',
      ].join('\n');

      // Act
      const result = manager.validateProgram(program);

      // Assert
      assert.ok(result.valid);
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.statistics.totalLines > 0);
    });

    test('should detect missing program end', () => {
      // Arrange
      const program = [
        'G21',
        'G1 X10 Y10 F1000',
        // Missing M30 or M2
      ].join('\n');

      // Act
      const result = manager.validateProgram(program);

      // Assert
      assert.ok(
        result.warnings.some(w => w.includes('end') || w.includes('M30') || w.includes('M2'))
      );
    });

    test('should optimize G-code program', () => {
      // Arrange
      const unoptimizedProgram = [
        'G1 F1000',
        'G1 F1000 X10', // Redundant F command
        'G1 F1000 Y10', // Redundant F command
        'G0 X20',
        'G0 Y20', // Could be combined
      ].join('\n');

      // Act
      const result = manager.optimizeProgram(unoptimizedProgram);

      // Assert
      assert.ok(result.success);
      assert.ok(result.optimizedProgram);
      assert.ok(result.optimizations.length > 0);

      // Should have fewer redundant commands
      const optimized = result.optimizedProgram;
      const originalFCount = (unoptimizedProgram.match(/F1000/g) || []).length;
      const optimizedFCount = (optimized.match(/F1000/g) || []).length;
      assert.ok(optimizedFCount <= originalFCount);
    });
  });

  describe('Program Analysis', () => {
    test('should analyze tool usage', () => {
      // Arrange
      const program = [
        'T1 M6',
        'G1 X10 Y10',
        'T2 M6',
        'G1 X20 Y20',
        'T1 M6', // Tool change back to T1
      ].join('\n');

      // Act
      const result = manager.analyzeProgram(program);

      // Assert
      assert.ok(result.toolAnalysis);
      assert.ok(result.toolAnalysis.toolsUsed.includes(1));
      assert.ok(result.toolAnalysis.toolsUsed.includes(2));
      assert.ok(result.toolAnalysis.toolChanges >= 3);
    });

    test('should calculate machining time accurately', () => {
      // Arrange
      const program = [
        'G1 F1000', // 1000 mm/min
        'G1 X60 Y0', // 60mm distance = 3.6 seconds
        'G1 X60 Y80', // 80mm distance = 4.8 seconds
        'G0 X0 Y0', // Rapid, minimal time
      ].join('\n');

      // Act
      const result = manager.analyzeProgram(program);

      // Assert
      assert.ok(result.timeAnalysis);
      assert.ok(result.timeAnalysis.estimatedTime > 8); // At least 8.4 seconds
      assert.ok(result.timeAnalysis.cuttingTime > 8);
      assert.ok(result.timeAnalysis.rapidTime >= 0);
    });

    test('should detect potential collisions', () => {
      // Arrange
      const program = [
        'G0 Z-50', // Deep Z move that might collide
        'G1 X100 Y100', // Movement while at low Z
      ].join('\n');

      // Act
      const result = manager.analyzeProgram(program);

      // Assert
      assert.ok(result.safetyAnalysis);
      // Should detect potential issues with deep Z moves
      assert.ok(
        result.safetyAnalysis.warnings.length > 0 ||
          result.safetyAnalysis.potentialCollisions.length > 0
      );
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle corrupted G-code gracefully', () => {
      // Arrange
      const corruptedProgram = [
        'G21',
        'G1 X@@#$%', // Corrupted line
        'G1 Y10',
        'M30',
      ].join('\n');

      // Act
      const result = manager.validateProgram(corruptedProgram);

      // Assert
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(e => e.includes('line') || e.includes('parse')));
    });

    test('should handle empty programs', () => {
      // Arrange & Act
      const result = manager.validateProgram('');

      // Assert
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('empty') || e.includes('no commands')));
    });

    test('should handle very long programs', () => {
      // Arrange
      const longProgram = Array.from({ length: 5000 }, (_, i) => `G1 X${i} Y${i}`).join('\n');

      // Act
      const result = manager.validateProgram(longProgram);

      // Assert
      // Should either succeed or fail gracefully with size limit error
      assert.ok(
        result.valid || result.errors.some(e => e.includes('too large') || e.includes('limit'))
      );
    });
  });
});
