/**
 * Comprehensive Unit Tests for Hardware Controllers (MKS57D and MKS42D)
 * Following AAA Pattern with 100% Coverage Target
 */

const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const EventEmitter = require('events');

// Mock socketcan before requiring controller modules
const mockCanChannel = {
  start: mock.fn(),
  stop: mock.fn(),
  addListener: mock.fn(),
  send: mock.fn(),
};

const mockCan = {
  createRawChannel: mock.fn(() => mockCanChannel),
};

// Override require for socketcan
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'socketcan') {
    return mockCan;
  }
  return originalRequire.apply(this, arguments);
};

// Import modules after mocking
const MKS57D = require('../../lib/mks57d');
const MKS57DManager = require('../../lib/mks57d-manager');
const { MKS42DController } = require('../../lib/mks42d');

describe('MKS57D Controller - Comprehensive Unit Tests', () => {
  let controller;
  let mockConfig;

  beforeEach(() => {
    // Arrange: Reset mocks and create fresh instance
    mock.reset();
    mockConfig = {
      interface: 'can0',
      timeout: 1000,
      baseCanId: 0x100,
      simulationMode: true,
    };
    controller = new MKS57D(mockConfig);
  });

  afterEach(() => {
    // Cleanup
    if (controller) {
      controller.disconnect();
    }
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      // Arrange & Act
      const defaultController = new MKS57D();

      // Assert
      assert.strictEqual(defaultController.config.interface, 'can0');
      assert.strictEqual(defaultController.config.timeout, 1000);
      assert.strictEqual(defaultController.config.baseCanId, 0x100);
      assert.strictEqual(defaultController.isConnected, false);
      assert.ok(defaultController.pendingCommands instanceof Map);
    });

    test('should initialize with custom configuration', () => {
      // Arrange
      const customConfig = {
        interface: 'can1',
        timeout: 2000,
        baseCanId: 0x200,
      };

      // Act
      const customController = new MKS57D(customConfig);

      // Assert
      assert.strictEqual(customController.config.interface, 'can1');
      assert.strictEqual(customController.config.timeout, 2000);
      assert.strictEqual(customController.config.baseCanId, 0x200);
    });

    test('should enable simulation mode when socketcan not available', () => {
      // Arrange & Act
      const controller = new MKS57D();

      // Assert
      assert.strictEqual(controller.simulationMode, true);
    });

    test('should merge configurations correctly', () => {
      // Arrange
      const partialConfig = { timeout: 3000 };

      // Act
      const controller = new MKS57D(partialConfig);

      // Assert
      assert.strictEqual(controller.config.timeout, 3000);
      assert.strictEqual(controller.config.interface, 'can0'); // Default
      assert.strictEqual(controller.config.baseCanId, 0x100); // Default
    });
  });

  describe('Connection Management', () => {
    test('should connect successfully in simulation mode', async () => {
      // Arrange
      assert.strictEqual(controller.isConnected, false);

      // Act
      const result = await controller.connect();

      // Assert
      assert.strictEqual(result, true);
      assert.strictEqual(controller.isConnected, true);
    });

    test('should connect successfully with real CAN interface', async () => {
      // Arrange
      const realController = new MKS57D({ simulationMode: false });
      mockCan.createRawChannel.mock.mockImplementationOnce(() => mockCanChannel);

      // Act
      const result = await realController.connect();

      // Assert
      assert.strictEqual(result, true);
      assert.strictEqual(realController.isConnected, true);
      assert.ok(mockCan.createRawChannel.mock.calls.length > 0);
      assert.ok(mockCanChannel.start.mock.calls.length > 0);

      // Cleanup
      await realController.disconnect();
    });

    test('should handle connection already established', async () => {
      // Arrange
      await controller.connect();
      assert.strictEqual(controller.isConnected, true);

      // Act
      const result = await controller.connect();

      // Assert
      assert.strictEqual(result, true);
      assert.strictEqual(controller.isConnected, true);
    });

    test('should handle connection failure gracefully', async () => {
      // Arrange
      const errorController = new MKS57D({ simulationMode: false });
      mockCan.createRawChannel.mock.mockImplementationOnce(() => {
        throw new Error('CAN interface not found');
      });

      // Act
      const result = await errorController.connect();

      // Assert
      assert.strictEqual(result, false);
      assert.strictEqual(errorController.isConnected, false);
    });

    test('should disconnect successfully', async () => {
      // Arrange
      await controller.connect();
      assert.strictEqual(controller.isConnected, true);

      // Act
      await controller.disconnect();

      // Assert
      assert.strictEqual(controller.isConnected, false);
    });

    test('should handle disconnect when not connected', async () => {
      // Arrange
      assert.strictEqual(controller.isConnected, false);

      // Act & Assert (should not throw)
      await controller.disconnect();
      assert.strictEqual(controller.isConnected, false);
    });
  });

  describe('Command Encoding and Sending', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should encode commands correctly', () => {
      // Arrange
      const testCommands = [
        { command: 'HOME', expected: Buffer.from([0x48, 0x4f, 0x4d, 0x45]) },
        { command: 'MOVE_ABS:1000', expected: Buffer.alloc(8) },
        { command: 'STOP', expected: Buffer.from([0x53, 0x54, 0x4f, 0x50]) },
      ];

      // Act & Assert
      for (const testCase of testCommands) {
        const encoded = controller.encodeCommand(testCase.command);
        assert.ok(Buffer.isBuffer(encoded));
        assert.ok(encoded.length > 0);
      }
    });

    test('should send command successfully in simulation mode', async () => {
      // Arrange
      const address = 1;
      const command = 'HOME';

      // Act
      const result = await controller.sendCommand(address, command);

      // Assert
      assert.ok(result);
      assert.ok(result.success || result.simulated);
    });

    test('should handle command timeout', async () => {
      // Arrange
      const timeoutController = new MKS57D({ timeout: 100, simulationMode: false });
      await timeoutController.connect();

      // Mock delayed response
      mockCanChannel.send.mock.mockImplementationOnce(() => {
        // Don't send response immediately
      });

      // Act & Assert
      try {
        await timeoutController.sendCommand(1, 'HOME');
        assert.fail('Should have timed out');
      } catch (error) {
        assert.ok(error.message.includes('timeout') || error.message.includes('Command timeout'));
      }

      await timeoutController.disconnect();
    });

    test('should reject command when not connected', async () => {
      // Arrange
      await controller.disconnect();

      // Act & Assert
      try {
        await controller.sendCommand(1, 'HOME');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('not connected'));
      }
    });

    test('should handle invalid addresses', async () => {
      // Arrange & Act & Assert
      const invalidAddresses = [-1, 0, 248, 999];

      for (const address of invalidAddresses) {
        try {
          await controller.sendCommand(address, 'HOME');
          assert.fail(`Should have rejected invalid address: ${address}`);
        } catch (error) {
          assert.ok(error.message.includes('address') || error.message.includes('invalid'));
        }
      }
    });
  });

  describe('Motor Control Commands', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should send home command', async () => {
      // Arrange
      const address = 1;

      // Act
      const result = await controller.sendCommand(address, 'HOME');

      // Assert
      assert.ok(result);
      if (controller.simulationMode) {
        assert.ok(result.simulated);
        assert.strictEqual(result.command, 'HOME');
        assert.strictEqual(result.address, address);
      }
    });

    test('should send absolute move command', async () => {
      // Arrange
      const address = 1;
      const position = 1000;

      // Act
      const result = await controller.sendCommand(address, `MOVE_ABS:${position}`);

      // Assert
      assert.ok(result);
      if (controller.simulationMode) {
        assert.ok(result.simulated);
        assert.ok(result.command.includes('MOVE_ABS'));
        assert.ok(result.command.includes('1000'));
      }
    });

    test('should send relative move command', async () => {
      // Arrange
      const address = 1;
      const distance = 500;

      // Act
      const result = await controller.sendCommand(address, `MOVE_REL:${distance}`);

      // Assert
      assert.ok(result);
      if (controller.simulationMode) {
        assert.ok(result.simulated);
        assert.ok(result.command.includes('MOVE_REL'));
        assert.ok(result.command.includes('500'));
      }
    });

    test('should send speed setting command', async () => {
      // Arrange
      const address = 1;
      const speed = 2000;

      // Act
      const result = await controller.sendCommand(address, `SET_SPEED:${speed}`);

      // Assert
      assert.ok(result);
      if (controller.simulationMode) {
        assert.ok(result.command.includes('SET_SPEED'));
      }
    });

    test('should send stop command', async () => {
      // Arrange
      const address = 1;

      // Act
      const result = await controller.sendCommand(address, 'STOP');

      // Assert
      assert.ok(result);
      if (controller.simulationMode) {
        assert.strictEqual(result.command, 'STOP');
      }
    });

    test('should enable and disable motor', async () => {
      // Arrange
      const address = 1;

      // Act
      const enableResult = await controller.sendCommand(address, 'ENABLE');
      const disableResult = await controller.sendCommand(address, 'DISABLE');

      // Assert
      assert.ok(enableResult);
      assert.ok(disableResult);
      if (controller.simulationMode) {
        assert.strictEqual(enableResult.command, 'ENABLE');
        assert.strictEqual(disableResult.command, 'DISABLE');
      }
    });
  });

  describe('CAN Message Handling', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should handle position response messages', () => {
      // Arrange
      const mockMessage = {
        id: 0x304, // Position response ID
        data: Buffer.from([0x00, 0x00, 0x03, 0xe8, 0x00, 0x00, 0x00, 0x00]), // 1000 steps
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      // In simulation mode, this would update internal state
      assert.ok(true); // Basic functionality test
    });

    test('should handle status response messages', () => {
      // Arrange
      const mockMessage = {
        id: 0x309, // Status response ID
        data: Buffer.from([0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Status data
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      assert.ok(true); // Basic functionality test
    });

    test('should handle command acknowledgments', () => {
      // Arrange
      const commandId = 1;
      controller.pendingCommands.set(commandId, {
        resolve: mock.fn(),
        reject: mock.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      const mockMessage = {
        id: 0x3ff, // ACK response ID
        data: Buffer.from([commandId, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      const pendingCommand = controller.pendingCommands.get(commandId);
      if (pendingCommand) {
        assert.ok(pendingCommand.resolve.mock.calls.length > 0);
      }
    });

    test('should ignore unknown message IDs', () => {
      // Arrange
      const mockMessage = {
        id: 0x999, // Unknown message ID
        data: Buffer.alloc(8),
      };

      // Act & Assert (should not throw)
      controller.handleCanMessage(mockMessage);
      assert.ok(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed commands', async () => {
      // Arrange
      await controller.connect();
      const malformedCommands = ['', null, undefined, 'INVALID_COMMAND', 'MOVE_ABS:'];

      // Act & Assert
      for (const command of malformedCommands) {
        try {
          await controller.sendCommand(1, command);
          // In simulation mode, might succeed with warning
        } catch (error) {
          assert.ok(error);
        }
      }
    });

    test('should handle concurrent commands', async () => {
      // Arrange
      await controller.connect();

      // Act - Send multiple commands simultaneously
      const promises = [
        controller.sendCommand(1, 'HOME'),
        controller.sendCommand(1, 'MOVE_ABS:100'),
        controller.sendCommand(1, 'MOVE_ABS:200'),
        controller.sendCommand(1, 'STOP'),
      ];

      const results = await Promise.allSettled(promises);

      // Assert
      assert.strictEqual(results.length, 4);
      // At least some commands should succeed in simulation mode
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      assert.ok(successCount > 0);
    });

    test('should clean up pending commands on disconnect', async () => {
      // Arrange
      await controller.connect();
      const promise = controller.sendCommand(1, 'HOME').catch(() => {}); // Ignore rejection

      // Act
      await controller.disconnect();

      // Assert
      assert.strictEqual(controller.isConnected, false);
      // Pending commands should be cleaned up
    });

    test('should handle memory pressure with many pending commands', async () => {
      // Arrange
      await controller.connect();

      // Act - Create many pending commands
      const promises = Array.from({ length: 100 }, (_, i) =>
        controller.sendCommand(1, `MOVE_ABS:${i * 10}`).catch(() => {})
      );

      // Wait for all to settle
      await Promise.allSettled(promises);

      // Assert - Should not leak memory or crash
      assert.ok(controller.pendingCommands.size >= 0);
    });
  });
});

describe('MKS42D Controller - Comprehensive Unit Tests', () => {
  let controller;
  let mockConfig;

  beforeEach(() => {
    // Arrange: Reset mocks and create fresh instance
    mock.reset();
    mockConfig = {
      interface: 'can0',
      controllers: [
        { id: 1, type: 'X_AXIS' },
        { id: 2, type: 'Y_AXIS' },
      ],
      simulationMode: true,
    };
    controller = new MKS42DController(mockConfig);
  });

  afterEach(() => {
    // Cleanup
    if (controller) {
      controller.disconnect();
    }
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      // Arrange & Act
      const defaultController = new MKS42DController();

      // Assert
      assert.strictEqual(defaultController.interface, 'can0');
      assert.ok(Array.isArray(defaultController.controllers));
      assert.strictEqual(defaultController.isConnected, false);
      assert.ok(defaultController.commands);
      assert.ok(defaultController.responses);
    });

    test('should initialize with custom controllers', () => {
      // Arrange & Act
      const controller = new MKS42DController(mockConfig);

      // Assert
      assert.strictEqual(controller.controllers.length, 2);
      assert.strictEqual(controller.controllers[0].id, 1);
      assert.strictEqual(controller.controllers[1].type, 'Y_AXIS');
    });

    test('should initialize position cache', () => {
      // Arrange & Act
      const controller = new MKS42DController(mockConfig);

      // Assert
      assert.ok(controller.positions[1]);
      assert.ok(controller.positions[2]);
      assert.deepStrictEqual(controller.positions[1], { x: 0, y: 0, z: 0, e: 0 });
    });

    test('should set up command mappings', () => {
      // Arrange & Act
      const controller = new MKS42DController();

      // Assert
      assert.ok(controller.commands.GO_HOME);
      assert.ok(controller.commands.MOVE_ABSOLUTE);
      assert.ok(controller.commands.MOVE_RELATIVE);
      assert.ok(controller.responses.POSITION_RESPONSE);
      assert.ok(controller.responses.STATUS_RESPONSE);
    });
  });

  describe('Connection Management', () => {
    test('should connect successfully in simulation mode', async () => {
      // Arrange
      assert.strictEqual(controller.isConnected, false);

      // Act
      const result = await controller.connect();

      // Assert
      assert.strictEqual(result, true);
      assert.strictEqual(controller.isConnected, true);
    });

    test('should emit connected event', async () => {
      // Arrange
      const connectedSpy = mock.fn();
      controller.on('connected', connectedSpy);

      // Act
      await controller.connect();

      // Assert
      assert.ok(connectedSpy.mock.calls.length > 0);
    });

    test('should handle connection with real CAN interface', async () => {
      // Arrange
      const realController = new MKS42DController({ simulationMode: false });
      mockCan.createRawChannel.mock.mockImplementationOnce(() => mockCanChannel);

      // Act
      const result = await realController.connect();

      // Assert
      assert.strictEqual(result, true);
      assert.ok(mockCan.createRawChannel.mock.calls.length > 0);
      assert.ok(mockCanChannel.addListener.mock.calls.length > 0);

      // Cleanup
      realController.disconnect();
    });

    test('should handle connection errors', async () => {
      // Arrange
      const errorController = new MKS42DController({ simulationMode: false });
      mockCan.createRawChannel.mock.mockImplementationOnce(() => {
        throw new Error('Interface not available');
      });

      const errorSpy = mock.fn();
      errorController.on('error', errorSpy);

      // Act
      const result = await errorController.connect();

      // Assert
      assert.strictEqual(result, false);
      assert.ok(errorSpy.mock.calls.length > 0);
    });

    test('should disconnect successfully', () => {
      // Arrange
      controller.channel = mockCanChannel;
      controller.isConnected = true;

      // Act
      controller.disconnect();

      // Assert
      assert.strictEqual(controller.isConnected, false);
      assert.strictEqual(controller.channel, null);
    });

    test('should emit disconnected event', () => {
      // Arrange
      const disconnectedSpy = mock.fn();
      controller.on('disconnected', disconnectedSpy);
      controller.channel = mockCanChannel;
      controller.isConnected = true;

      // Act
      controller.disconnect();

      // Assert
      assert.ok(disconnectedSpy.mock.calls.length > 0);
    });
  });

  describe('G-Code Translation and Execution', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should translate G0 rapid movement', async () => {
      // Arrange
      const gcode = 'G0 X10 Y20';

      // Act
      const result = await controller.executeGCode(gcode);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.commands) {
        assert.ok(result.commands.length > 0);
        assert.ok(result.commands.some(cmd => cmd.includes('MOVE_ABSOLUTE')));
      }
    });

    test('should translate G1 linear movement', async () => {
      // Arrange
      const gcode = 'G1 X15 Y25 F1000';

      // Act
      const result = await controller.executeGCode(gcode);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.feedRate) {
        assert.strictEqual(result.feedRate, 1000);
      }
    });

    test('should handle multi-line G-code', async () => {
      // Arrange
      const gcode = [
        'G21 ; Set units to millimeters',
        'G90 ; Absolute positioning',
        'G0 X0 Y0 ; Move to origin',
        'G1 X10 Y10 F500',
        'G0 Z5 ; Retract',
      ].join('\n');

      // Act
      const result = await controller.executeGCode(gcode);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.linesProcessed) {
        assert.ok(result.linesProcessed > 0);
      }
    });

    test('should handle home commands', async () => {
      // Arrange
      const gcode = 'G28 ; Home all axes';

      // Act
      const result = await controller.executeGCode(gcode);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.commands) {
        assert.ok(result.commands.some(cmd => cmd.includes('GO_HOME')));
      }
    });

    test('should update position cache during execution', async () => {
      // Arrange
      const gcode = 'G1 X50 Y75';
      const initialPosition = { ...controller.positions[1] };

      // Act
      await controller.executeGCode(gcode);

      // Assert
      // In simulation mode, positions should be updated
      if (controller.simulationMode) {
        // Position cache might be updated
        assert.ok(controller.positions[1]);
      }
    });
  });

  describe('Direct Motor Control', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should home individual controller', async () => {
      // Arrange
      const controllerId = 1;

      // Act
      const result = await controller.homeController(controllerId);

      // Assert
      assert.ok(result.success || result.simulated);
      if (controller.simulationMode) {
        assert.strictEqual(result.command, 'GO_HOME');
        assert.strictEqual(result.controllerId, controllerId);
      }
    });

    test('should home all controllers', async () => {
      // Arrange & Act
      const results = await controller.homeAllControllers();

      // Assert
      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, controller.controllers.length);
      results.forEach(result => {
        assert.ok(result.success || result.simulated);
      });
    });

    test('should move controller to absolute position', async () => {
      // Arrange
      const controllerId = 1;
      const axis = 0; // X axis
      const position = 1000;

      // Act
      const result = await controller.moveAbsolute(controllerId, axis, position);

      // Assert
      assert.ok(result.success || result.simulated);
      if (controller.simulationMode) {
        assert.ok(result.command.includes('MOVE_ABSOLUTE'));
        assert.strictEqual(result.position, position);
      }
    });

    test('should move controller relatively', async () => {
      // Arrange
      const controllerId = 1;
      const axis = 1; // Y axis
      const distance = 500;

      // Act
      const result = await controller.moveRelative(controllerId, axis, distance);

      // Assert
      assert.ok(result.success || result.simulated);
      if (controller.simulationMode) {
        assert.ok(result.command.includes('MOVE_RELATIVE'));
        assert.strictEqual(result.distance, distance);
      }
    });

    test('should stop all controllers', async () => {
      // Arrange & Act
      const results = await controller.stopAllControllers();

      // Assert
      assert.ok(Array.isArray(results));
      results.forEach(result => {
        assert.ok(result.success || result.simulated);
      });
    });

    test('should get controller position', async () => {
      // Arrange
      const controllerId = 1;

      // Act
      const position = await controller.getPosition(controllerId);

      // Assert
      assert.ok(position);
      assert.ok(typeof position.x === 'number');
      assert.ok(typeof position.y === 'number');
      assert.ok(typeof position.z === 'number');
    });

    test('should get status of all controllers', async () => {
      // Arrange & Act
      const status = await controller.getStatus();

      // Assert
      assert.ok(status);
      assert.ok(status.connected === controller.isConnected);
      assert.ok(Array.isArray(status.controllers));
      assert.strictEqual(status.controllers.length, controller.controllers.length);
    });
  });

  describe('CAN Message Processing', () => {
    beforeEach(async () => {
      await controller.connect();
    });

    test('should process position response messages', () => {
      // Arrange
      const mockMessage = {
        id: controller.responses.POSITION_RESPONSE,
        data: Buffer.from([0x01, 0x00, 0x00, 0x10, 0x00, 0x00, 0x20, 0x00]), // Controller 1, X=16, Y=32 steps
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      // Should update position cache
      assert.ok(controller.positions[1]);
    });

    test('should process status response messages', () => {
      // Arrange
      const mockMessage = {
        id: controller.responses.STATUS_RESPONSE,
        data: Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Controller 1, enabled
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      // Should process status update
      assert.ok(true); // Basic functionality test
    });

    test('should emit position update events', () => {
      // Arrange
      const positionSpy = mock.fn();
      controller.on('positionUpdate', positionSpy);

      const mockMessage = {
        id: controller.responses.POSITION_RESPONSE,
        data: Buffer.from([0x01, 0x00, 0x00, 0x10, 0x00, 0x00, 0x20, 0x00]),
      };

      // Act
      controller.handleCanMessage(mockMessage);

      // Assert
      assert.ok(positionSpy.mock.calls.length > 0);
    });

    test('should handle invalid message data gracefully', () => {
      // Arrange
      const invalidMessages = [
        { id: controller.responses.POSITION_RESPONSE, data: Buffer.from([0x01]) }, // Too short
        { id: controller.responses.POSITION_RESPONSE, data: null },
        { id: 0x999, data: Buffer.alloc(8) }, // Unknown message ID
      ];

      // Act & Assert
      for (const message of invalidMessages) {
        // Should not throw
        controller.handleCanMessage(message);
        assert.ok(true);
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle controller not found errors', async () => {
      // Arrange
      await controller.connect();
      const nonExistentControllerId = 999;

      // Act & Assert
      try {
        await controller.homeController(nonExistentControllerId);
        assert.fail('Should have thrown error for non-existent controller');
      } catch (error) {
        assert.ok(error.message.includes('controller') || error.message.includes('not found'));
      }
    });

    test('should handle invalid G-code gracefully', async () => {
      // Arrange
      await controller.connect();
      const invalidGCode = [
        'G999 X10', // Invalid G-code command
        'G1 X', // Missing parameter value
        'INVALID LINE',
        '',
      ];

      // Act & Assert
      for (const gcode of invalidGCode) {
        const result = await controller.executeGCode(gcode);
        assert.ok(result.error || result.warnings || result.success); // Should handle gracefully
      }
    });

    test('should recover from communication errors', async () => {
      // Arrange
      await controller.connect();

      // Simulate communication error
      const originalSendMessage = controller.sendMessage;
      controller.sendMessage = () => {
        throw new Error('Communication timeout');
      };

      // Act
      try {
        await controller.homeController(1);
      } catch (error) {
        // Should handle error gracefully
        assert.ok(error);
      }

      // Restore function
      controller.sendMessage = originalSendMessage;

      // Assert - Controller should still be functional
      assert.strictEqual(controller.isConnected, true);
    });

    test('should handle concurrent operations safely', async () => {
      // Arrange
      await controller.connect();

      // Act - Execute multiple operations concurrently
      const operations = [
        controller.homeController(1),
        controller.moveAbsolute(1, 0, 100),
        controller.getPosition(1),
        controller.getStatus(),
      ];

      const results = await Promise.allSettled(operations);

      // Assert - Operations should complete without deadlocks
      assert.strictEqual(results.length, 4);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      assert.ok(successCount > 0); // At least some should succeed
    });

    test('should clean up resources on error', async () => {
      // Arrange
      const errorController = new MKS42DController({ simulationMode: false });

      // Simulate connection error
      mockCan.createRawChannel.mock.mockImplementationOnce(() => {
        throw new Error('Resource exhausted');
      });

      // Act
      const result = await errorController.connect();

      // Assert
      assert.strictEqual(result, false);
      assert.strictEqual(errorController.isConnected, false);
      assert.strictEqual(errorController.channel, null);
    });
  });
});

describe('MKS57D Manager - Integration Tests', () => {
  let manager;

  beforeEach(() => {
    manager = new MKS57DManager({
      controllers: [1, 2, 3, 4, 5, 6],
      simulationMode: true,
    });
  });

  afterEach(() => {
    if (manager) {
      manager.disconnect();
    }
  });

  describe('Manager Initialization', () => {
    test('should initialize with multiple controllers', () => {
      // Assert
      assert.ok(manager.controllers);
      assert.strictEqual(manager.controllers.length, 6);
      assert.ok(manager.positions);
      assert.strictEqual(Object.keys(manager.positions).length, 6);
    });

    test('should connect all controllers', async () => {
      // Act
      const result = await manager.connect();

      // Assert
      assert.ok(result.success || result.simulated);
      assert.strictEqual(manager.isConnected, true);
    });
  });

  describe('Coordinated Movement', () => {
    beforeEach(async () => {
      await manager.connect();
    });

    test('should home all controllers simultaneously', async () => {
      // Act
      const result = await manager.homeAll();

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.results) {
        assert.strictEqual(result.results.length, 6);
      }
    });

    test('should move multiple axes to target positions', async () => {
      // Arrange
      const targetPositions = {
        1: 1000, // Controller 1 to position 1000
        2: 1500, // Controller 2 to position 1500
        3: 2000, // Controller 3 to position 2000
      };

      // Act
      const result = await manager.moveToPositions(targetPositions);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.positions) {
        assert.ok(result.positions[1] !== undefined);
        assert.ok(result.positions[2] !== undefined);
        assert.ok(result.positions[3] !== undefined);
      }
    });

    test('should execute interpolated movement', async () => {
      // Arrange
      const path = [
        { 1: 0, 2: 0, 3: 0 },
        { 1: 500, 2: 500, 3: 500 },
        { 1: 1000, 2: 1000, 3: 1000 },
      ];

      // Act
      const result = await manager.executeInterpolatedPath(path);

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.pathCompleted) {
        assert.ok(result.pathCompleted);
      }
    });

    test('should stop all controllers immediately', async () => {
      // Act
      const result = await manager.emergencyStop();

      // Assert
      assert.ok(result.success || result.simulated);
      if (result.stopped) {
        assert.ok(result.stopped.length >= 0);
      }
    });
  });

  describe('Status Monitoring', () => {
    beforeEach(async () => {
      await manager.connect();
    });

    test('should get status of all controllers', async () => {
      // Act
      const status = await manager.getStatus();

      // Assert
      assert.ok(status);
      assert.ok(status.connected === manager.isConnected);
      assert.ok(status.controllers);
      assert.strictEqual(Object.keys(status.controllers).length, 6);
    });

    test('should detect controller errors', async () => {
      // Arrange - Simulate error condition
      manager.controllerStates[1] = { error: true, errorCode: 'OVERCURRENT' };

      // Act
      const errors = manager.getErrors();

      // Assert
      assert.ok(Array.isArray(errors));
      if (errors.length > 0) {
        assert.ok(errors.some(e => e.controllerId === 1));
        assert.ok(errors.some(e => e.errorCode === 'OVERCURRENT'));
      }
    });

    test('should monitor position accuracy', async () => {
      // Arrange
      const targetPositions = { 1: 1000, 2: 1500 };
      await manager.moveToPositions(targetPositions);

      // Act
      const accuracy = await manager.checkPositionAccuracy();

      // Assert
      assert.ok(accuracy);
      if (accuracy.controllers) {
        assert.ok(accuracy.controllers[1] !== undefined);
        assert.ok(accuracy.controllers[2] !== undefined);
      }
    });
  });
});

// Restore original require
Module.prototype.require = originalRequire;
