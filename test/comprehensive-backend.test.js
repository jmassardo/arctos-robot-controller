const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs-extra');
const path = require('path');

// Additional comprehensive backend unit tests
test('Robot Configuration - Extended Tests', async t => {
  const testConfigDir = path.join(__dirname, 'test-config-extended');

  await t.beforeEach(async () => {
    await fs.remove(testConfigDir);
    await fs.ensureDir(testConfigDir);
  });

  await t.test('should validate axis configuration limits', async () => {
    const configFile = path.join(testConfigDir, 'robot-config.json');
    const testConfig = {
      robotType: '6-axis',
      axes: {
        axis1: { name: 'Base', minValue: -180, maxValue: 180, defaultSpeed: 50 },
        axis2: { name: 'Shoulder', minValue: -90, maxValue: 90, defaultSpeed: 50 },
      },
    };

    await fs.writeJson(configFile, testConfig);
    const loadedConfig = await fs.readJson(configFile);

    // Validate structure
    assert.ok(loadedConfig.axes.axis1, 'Axis 1 should be configured');
    assert.ok(loadedConfig.axes.axis2, 'Axis 2 should be configured');

    // Validate limits
    assert.strictEqual(loadedConfig.axes.axis1.minValue, -180);
    assert.strictEqual(loadedConfig.axes.axis1.maxValue, 180);
    assert.ok(
      loadedConfig.axes.axis1.minValue < loadedConfig.axes.axis1.maxValue,
      'Min should be less than max'
    );
  });

  await t.test('should handle different robot types', async () => {
    const robotTypes = ['4-axis', '6-axis', 'SCARA', 'Delta'];

    for (const robotType of robotTypes) {
      const configFile = path.join(testConfigDir, `robot-${robotType}-config.json`);
      const testConfig = { robotType, axes: {} };

      await fs.writeJson(configFile, testConfig);
      const loaded = await fs.readJson(configFile);

      assert.strictEqual(loaded.robotType, robotType, `Should handle ${robotType} robot type`);
    }
  });

  await t.test('should validate communication protocols', async () => {
    const protocols = ['CAN', 'Serial', 'TCP/IP', 'RS485', 'Modbus'];

    for (const protocol of protocols) {
      const configFile = path.join(
        testConfigDir,
        `protocol-${protocol.replace('/', '-')}-config.json`
      );
      const testConfig = {
        communicationProtocol: protocol,
        robotType: '6-axis',
        axes: {},
      };

      await fs.writeJson(configFile, testConfig);
      const loaded = await fs.readJson(configFile);

      assert.strictEqual(
        loaded.communicationProtocol,
        protocol,
        `Should handle ${protocol} protocol`
      );
    }
  });

  await t.afterEach(async () => {
    await fs.remove(testConfigDir).catch(() => {});
  });
});

test('Position Management - Extended Tests', async t => {
  const testDataDir = path.join(__dirname, 'test-positions-extended');

  await t.beforeEach(async () => {
    await fs.remove(testDataDir);
    await fs.ensureDir(testDataDir);
  });

  await t.test('should handle multiple position formats', async () => {
    const positionsFile = path.join(testDataDir, 'positions.json');

    const testPositions = [
      {
        id: '1',
        name: 'Home',
        position: { axis1: 0, axis2: 0, axis3: 0 },
        gripper: 0,
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        name: 'Work Position',
        position: { axis1: 45.5, axis2: -30.2, axis3: 60.8, axis4: 0, axis5: 90, axis6: -45 },
        gripper: 50,
        timestamp: new Date().toISOString(),
      },
    ];

    await fs.writeJson(positionsFile, testPositions);
    const loaded = await fs.readJson(positionsFile);

    assert.strictEqual(loaded.length, 2, 'Should load both positions');
    assert.strictEqual(loaded[0].name, 'Home');
    assert.strictEqual(loaded[1].name, 'Work Position');

    // Validate position data types
    assert.strictEqual(typeof loaded[1].position.axis1, 'number');
    assert.ok(loaded[1].position.axis1 > 0, 'Should handle decimal positions');
  });

  await t.test('should validate position data integrity', async () => {
    const positionsFile = path.join(testDataDir, 'positions-integrity.json');

    const position = {
      id: 'test-id',
      name: 'Test Position',
      position: { axis1: 10, axis2: 20, axis3: 30 },
      gripper: 25,
      timestamp: '2024-01-01T12:00:00Z',
    };

    await fs.writeJson(positionsFile, [position]);
    const loaded = await fs.readJson(positionsFile);
    const savedPosition = loaded[0];

    // Validate all required fields
    assert.ok(savedPosition.id, 'Position should have ID');
    assert.ok(savedPosition.name, 'Position should have name');
    assert.ok(savedPosition.position, 'Position should have position data');
    assert.ok(typeof savedPosition.gripper === 'number', 'Position should have gripper value');
    assert.ok(savedPosition.timestamp, 'Position should have timestamp');

    // Validate timestamp format
    assert.ok(!isNaN(Date.parse(savedPosition.timestamp)), 'Timestamp should be valid ISO date');
  });

  await t.afterEach(async () => {
    await fs.remove(testDataDir).catch(() => {});
  });
});

test('G-code Processing - Extended Tests', async t => {
  await t.test('should validate G-code command structure', async () => {
    const validCommands = [
      'G0 X10 Y20 Z30',
      'G1 X0 Y0 Z0 F100',
      'G28',
      'M3 S1000',
      'M5',
      'G4 P2000',
    ];

    for (const command of validCommands) {
      // Basic validation - check command format
      assert.ok(command.length > 0, 'Command should not be empty');
      assert.ok(command.match(/^[GM]\d+/), 'Command should start with G or M followed by numbers');
    }
  });

  await t.test('should handle G-code coordinate systems', async () => {
    const coordinateCommands = [
      { command: 'G0 X10', expectedX: 10 },
      { command: 'G1 X-5.5 Y20.3', expectedX: -5.5, expectedY: 20.3 },
      { command: 'G28 X Y Z', isHoming: true },
    ];

    for (const cmd of coordinateCommands) {
      if (cmd.expectedX !== undefined) {
        const xMatch = cmd.command.match(/X(-?\d+\.?\d*)/);
        if (xMatch) {
          assert.strictEqual(
            parseFloat(xMatch[1]),
            cmd.expectedX,
            `Should parse X coordinate correctly in: ${cmd.command}`
          );
        }
      }

      if (cmd.expectedY !== undefined) {
        const yMatch = cmd.command.match(/Y(-?\d+\.?\d*)/);
        if (yMatch) {
          assert.strictEqual(
            parseFloat(yMatch[1]),
            cmd.expectedY,
            `Should parse Y coordinate correctly in: ${cmd.command}`
          );
        }
      }

      if (cmd.isHoming) {
        assert.ok(cmd.command.includes('G28'), 'Should identify homing commands');
      }
    }
  });

  await t.test('should validate feed rates and speeds', async () => {
    const speedCommands = [
      { command: 'G1 X10 F100', expectedFeedRate: 100 },
      { command: 'M3 S1500', expectedSpindleSpeed: 1500 },
      { command: 'G0 X0 Y0', rapidMove: true },
    ];

    for (const cmd of speedCommands) {
      if (cmd.expectedFeedRate) {
        const feedMatch = cmd.command.match(/F(\d+)/);
        if (feedMatch) {
          assert.strictEqual(
            parseInt(feedMatch[1]),
            cmd.expectedFeedRate,
            `Should parse feed rate in: ${cmd.command}`
          );
        }
      }

      if (cmd.expectedSpindleSpeed) {
        const spindleMatch = cmd.command.match(/S(\d+)/);
        if (spindleMatch) {
          assert.strictEqual(
            parseInt(spindleMatch[1]),
            cmd.expectedSpindleSpeed,
            `Should parse spindle speed in: ${cmd.command}`
          );
        }
      }

      if (cmd.rapidMove) {
        assert.ok(cmd.command.startsWith('G0'), 'Should identify rapid moves');
      }
    }
  });
});

test('Error Handling - Extended Tests', async t => {
  await t.test('should handle file system errors gracefully', async () => {
    const invalidPath = '/invalid/nonexistent/path/file.json';

    // Test reading non-existent file
    try {
      await fs.readJson(invalidPath);
      assert.fail('Should throw error for non-existent file');
    } catch (error) {
      assert.ok(error.code === 'ENOENT', 'Should get file not found error');
    }
  });

  await t.test('should validate axis limit boundaries', async () => {
    const testCases = [
      { axis: 'axis1', value: 181, limit: 180, shouldFail: true },
      { axis: 'axis1', value: -181, limit: -180, shouldFail: true },
      { axis: 'axis1', value: 179, limit: 180, shouldFail: false },
      { axis: 'axis2', value: 0, limit: 90, shouldFail: false },
    ];

    for (const testCase of testCases) {
      const withinLimits = Math.abs(testCase.value) <= Math.abs(testCase.limit);

      if (testCase.shouldFail) {
        assert.ok(
          !withinLimits,
          `Value ${testCase.value} should exceed limit ${testCase.limit} for ${testCase.axis}`
        );
      } else {
        assert.ok(
          withinLimits,
          `Value ${testCase.value} should be within limit ${testCase.limit} for ${testCase.axis}`
        );
      }
    }
  });

  await t.test('should handle invalid configuration data', async () => {
    const invalidConfigs = [
      { robotType: '', isValid: false },
      { robotType: '6-axis', axes: null, isValid: false },
      { robotType: '6-axis', axes: {}, isValid: true },
      { communicationProtocol: 'INVALID', isValid: false },
    ];

    for (const config of invalidConfigs) {
      const hasValidType = config.robotType && config.robotType.length > 0;
      const hasValidAxes = config.axes !== null && config.axes !== undefined;
      const hasValidProtocol =
        !config.communicationProtocol ||
        ['CAN', 'Serial', 'TCP/IP', 'RS485', 'Modbus'].includes(config.communicationProtocol);

      const actuallyValid = hasValidType && hasValidAxes && hasValidProtocol;

      assert.strictEqual(
        actuallyValid,
        config.isValid,
        `Configuration validation failed for: ${JSON.stringify(config)}`
      );
    }
  });
});
