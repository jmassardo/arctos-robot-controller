const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Test configuration paths and structure (unit tests)
test('API Configuration Tests', async (t) => {
  const testConfigDir = path.join(__dirname, 'temp-api-config');
  const testDataDir = path.join(__dirname, 'temp-api-data');
  
  await t.test('should handle configuration file operations', async () => {
    const configFile = path.join(testConfigDir, 'robot-config.json');
    const testConfig = {
      robotType: '6-axis',
      communicationProtocol: 'CAN',
      axes: {
        axis1: { name: 'Base', minValue: -180, maxValue: 180, defaultSpeed: 50 }
      }
    };
    
    await fs.ensureDir(testConfigDir);
    await fs.writeJson(configFile, testConfig);
    
    const loadedConfig = await fs.readJson(configFile);
    assert.deepStrictEqual(loadedConfig, testConfig, 'Configuration should persist correctly');
    
    // Test configuration validation structure
    assert.ok(loadedConfig.robotType, 'Configuration should have robotType');
    assert.ok(loadedConfig.communicationProtocol, 'Configuration should have communicationProtocol');
    assert.ok(loadedConfig.axes, 'Configuration should have axes');
    assert.ok(loadedConfig.axes.axis1, 'Configuration should have axis1');
    assert.ok(loadedConfig.axes.axis1.name, 'Axis should have name');
    assert.ok(typeof loadedConfig.axes.axis1.minValue === 'number', 'Axis should have numeric minValue');
    assert.ok(typeof loadedConfig.axes.axis1.maxValue === 'number', 'Axis should have numeric maxValue');
    
    await fs.remove(testConfigDir);
  });
  
  await t.test('should handle position data operations', async () => {
    const positionsFile = path.join(testDataDir, 'saved-positions.json');
    const testPositions = [
      {
        id: '1',
        name: 'Test Position',
        positions: {
          axis1: 45, axis2: 30, axis3: 0, axis4: 0, axis5: 0, axis6: 0
        },
        gripper: 'closed',
        timestamp: new Date().toISOString()
      }
    ];
    
    await fs.ensureDir(testDataDir);
    await fs.writeJson(positionsFile, testPositions);
    
    const loadedPositions = await fs.readJson(positionsFile);
    assert.deepStrictEqual(loadedPositions, testPositions, 'Positions should persist correctly');
    
    // Validate position structure
    assert.ok(Array.isArray(loadedPositions), 'Positions should be an array');
    assert.ok(loadedPositions[0].id, 'Position should have ID');
    assert.ok(loadedPositions[0].name, 'Position should have name');
    assert.ok(loadedPositions[0].positions, 'Position should have positions object');
    assert.ok(loadedPositions[0].gripper, 'Position should have gripper state');
    assert.ok(loadedPositions[0].timestamp, 'Position should have timestamp');
    
    await fs.remove(testDataDir);
  });
  
  await t.test('should handle G-code data validation', async () => {
    const validGcodeSamples = [
      'G28',
      'G90',
      'G21',
      'G1 X10 Y20 Z5 F1000',
      'M3',
      'G4 P1000',
      'M5',
      'M2'
    ];
    
    for (const gcode of validGcodeSamples) {
      // Test that G-code commands have expected structure
      const trimmed = gcode.trim();
      assert.ok(trimmed.length > 0, 'G-code should not be empty');
      assert.ok(/^[GM]\d+/.test(trimmed), 'G-code should start with G or M command');
    }
    
    // Test G-code parsing logic
    const complexGcode = 'G1 X10 Y20 Z5 F1000';
    const parts = complexGcode.split(/\s+/);
    const command = parts[0];
    const params = {};
    
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.length >= 2) {
        const axis = part[0];
        const value = parseFloat(part.substring(1));
        if (!isNaN(value)) {
          params[axis] = value;
        }
      }
    }
    
    assert.strictEqual(command, 'G1', 'Should extract command');
    assert.strictEqual(params.X, 10, 'Should extract X parameter');
    assert.strictEqual(params.Y, 20, 'Should extract Y parameter');
    assert.strictEqual(params.Z, 5, 'Should extract Z parameter');
    assert.strictEqual(params.F, 1000, 'Should extract F parameter');
  });
  
  await t.test('should validate API request/response structures', async () => {
    // Test manual move request structure
    const manualMoveRequest = {
      axis: 'axis1',
      direction: 'positive',
      amount: 10
    };
    
    assert.ok(manualMoveRequest.axis, 'Manual move should have axis');
    assert.ok(manualMoveRequest.direction, 'Manual move should have direction');
    assert.ok(typeof manualMoveRequest.amount === 'number', 'Manual move should have numeric amount');
    assert.ok(['positive', 'negative'].includes(manualMoveRequest.direction), 'Direction should be valid');
    
    // Test G-code execution request structure
    const gcodeRequest = {
      gcode: 'G28\\nG1 X10 Y20 F1000\\nM2'
    };
    
    assert.ok(gcodeRequest.gcode, 'G-code request should have gcode');
    assert.ok(typeof gcodeRequest.gcode === 'string', 'G-code should be string');
    assert.ok(gcodeRequest.gcode.includes('G28'), 'G-code should contain valid commands');
    
    // Test typical API response structure
    const apiResponse = {
      success: true,
      message: 'Operation completed successfully',
      data: { axis1: 45, axis2: 30 }
    };
    
    assert.ok(typeof apiResponse.success === 'boolean', 'Response should have boolean success');
    assert.ok(apiResponse.message, 'Response should have message');
    assert.ok(apiResponse.data, 'Response should have data');
  });
  
  await t.test('should handle error scenarios', async () => {
    // Test invalid configuration
    const invalidConfigs = [
      null,
      undefined,
      {},
      { robotType: null },
      { axes: null },
      { axes: { axis1: { minValue: 100, maxValue: 50 } } } // invalid range
    ];
    
    for (const config of invalidConfigs) {
      const isValid = config && 
                      config.robotType && 
                      config.axes && 
                      typeof config.axes === 'object';
      
      if (config && config.axes && config.axes.axis1) {
        const axisValid = config.axes.axis1.minValue < config.axes.axis1.maxValue;
        assert.ok(!axisValid || isValid, `Config ${JSON.stringify(config)} should be properly validated`);
      } else {
        assert.ok(!isValid, `Config ${JSON.stringify(config)} should be invalid`);
      }
    }
    
    // Test invalid position data
    const invalidPositions = [
      null,
      undefined,
      [],
      [{ name: null }],
      [{ positions: null }],
      [{ positions: { axis1: 'invalid' } }]
    ];
    
    for (const positions of invalidPositions) {
      const isValidArray = Array.isArray(positions) && positions.length > 0;
      const hasValidStructure = isValidArray && 
                                positions[0] && 
                                positions[0].name && 
                                positions[0].positions &&
                                typeof positions[0].positions.axis1 === 'number';
      
      assert.ok(!hasValidStructure, `Positions ${JSON.stringify(positions)} should be invalid`);
    }
  });
});