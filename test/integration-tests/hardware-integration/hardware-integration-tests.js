/**
 * Hardware Integration Tests
 * Testing hardware communication interfaces and protocols
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  getTestHelper,
} = require('../integration-test-helpers');
const { TEST_CONFIG, createTestGCode } = require('../integration-test-config');

// Import hardware modules for direct testing
const { MKS42DController, GCodeTranslator } = require('../../../lib/mks42d');
const MKS57DManager = require('../../../lib/mks57d-manager');

describe('Hardware Integration Tests', () => {
  let helper;
  let operatorAuth;

  before(async () => {
    helper = await setupIntegrationTestEnvironment();
    operatorAuth = await helper.registerAndLoginUser('operator');
  });

  after(async () => {
    await teardownIntegrationTestEnvironment();
  });

  beforeEach(async () => {
    await helper.cleanupTestData();
    await helper.setupTestRobotConfig();
  });

  describe('MKS42D Controller Integration', () => {
    it('should initialize MKS42D controller in simulation mode', async () => {
      const config = {
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }],
        stepsPerMM: { x: 80, y: 80 },
        maxSpeed: { x: 3000, y: 3000 },
      };

      const controller = new MKS42DController(config);
      await controller.initialize();

      assert.strictEqual(controller.isConnected(), true);
      assert.strictEqual(controller.isSimulationMode(), true);

      const status = controller.getStatus();
      assert(status);
      assert.strictEqual(typeof status.connected, 'boolean');
      assert.strictEqual(typeof status.simulationMode, 'boolean');
    });

    it('should handle motor movement commands', async () => {
      const controller = new MKS42DController({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }],
      });

      await controller.initialize();

      // Test absolute movement
      const moveResult = await controller.moveAbsolute(
        {
          x: 10.5,
          y: 20.3,
        },
        1000
      ); // 1000 mm/min speed

      assert(moveResult.success);
      assert.strictEqual(typeof moveResult.duration, 'number');

      // Verify position was updated
      const currentPosition = controller.getCurrentPosition();
      assert.strictEqual(currentPosition.x, 10.5);
      assert.strictEqual(currentPosition.y, 20.3);
    });

    it('should handle relative movement commands', async () => {
      const controller = new MKS42DController({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }],
      });

      await controller.initialize();

      // Set initial position
      await controller.moveAbsolute({ x: 5, y: 10 }, 1000);

      // Test relative movement
      const moveResult = await controller.moveRelative(
        {
          x: 3.5,
          y: -2.5,
        },
        1500
      );

      assert(moveResult.success);

      // Verify final position
      const currentPosition = controller.getCurrentPosition();
      assert.strictEqual(currentPosition.x, 8.5);
      assert.strictEqual(currentPosition.y, 7.5);
    });

    it('should handle homing sequence', async () => {
      const controller = new MKS42DController({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X', 'Y'], type: 'axis' }],
      });

      await controller.initialize();

      // Move to non-zero position first
      await controller.moveAbsolute({ x: 50, y: 75 }, 1000);

      // Execute homing
      const homeResult = await controller.home(['X', 'Y']);
      assert(homeResult.success);

      // Verify position is at origin
      const currentPosition = controller.getCurrentPosition();
      assert.strictEqual(currentPosition.x, 0);
      assert.strictEqual(currentPosition.y, 0);
    });

    it('should enforce axis limits', async () => {
      const controller = new MKS42DController({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X'], type: 'axis' }],
        limits: {
          x: { min: -100, max: 100 },
        },
      });

      await controller.initialize();

      // Test movement within limits - should succeed
      const validMoveResult = await controller.moveAbsolute({ x: 50 }, 1000);
      assert(validMoveResult.success);

      // Test movement beyond limits - should fail
      const invalidMoveResult = await controller.moveAbsolute({ x: 150 }, 1000);
      assert.strictEqual(invalidMoveResult.success, false);
      assert(
        invalidMoveResult.error.includes('limit') || invalidMoveResult.error.includes('boundary')
      );
    });

    it('should handle emergency stop', async () => {
      const controller = new MKS42DController({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', axes: ['X'], type: 'axis' }],
      });

      await controller.initialize();

      // Start a long movement
      const movePromise = controller.moveAbsolute({ x: 100 }, 100); // Very slow movement

      // Trigger emergency stop
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const stopResult = await controller.emergencyStop();

      assert(stopResult.success);

      const status = controller.getStatus();
      assert(status.emergencyStop === true || status.stopped === true);

      // Movement should be interrupted
      const moveResult = await movePromise;
      assert.strictEqual(moveResult.success, false);
    });
  });

  describe('G-Code Translation Integration', () => {
    it('should translate G-code to MKS42D commands', async () => {
      const translator = new GCodeTranslator({
        stepsPerMM: { x: 80, y: 80, z: 400 },
        maxSpeed: { x: 3000, y: 3000, z: 1500 },
      });

      const gcode = [
        'G28 ; Home all axes',
        'G1 X10 Y20 Z5 F1000',
        'G1 X20 Y30 F1500',
        'M84 ; Disable motors',
      ];

      const translation = await translator.translateGCode(gcode);

      assert(translation.success);
      assert(Array.isArray(translation.commands));
      assert(translation.commands.length > 0);

      // Verify command structure
      const commands = translation.commands;
      assert(commands.some(cmd => cmd.type === 'home'));
      assert(commands.some(cmd => cmd.type === 'move'));
      assert(commands.some(cmd => cmd.type === 'disable_motors'));

      // Verify move command details
      const moveCommands = commands.filter(cmd => cmd.type === 'move');
      assert(moveCommands.length >= 2);

      const firstMove = moveCommands[0];
      assert.strictEqual(firstMove.position.x, 10);
      assert.strictEqual(firstMove.position.y, 20);
      assert.strictEqual(firstMove.position.z, 5);
      assert.strictEqual(firstMove.feedrate, 1000);
    });

    it('should handle G-code parsing errors', async () => {
      const translator = new GCodeTranslator({});

      const invalidGcode = [
        'G999 ; Invalid G-code command',
        'G1 X Y Z ; Missing values',
        'INVALID_COMMAND',
      ];

      const translation = await translator.translateGCode(invalidGcode);

      assert.strictEqual(translation.success, false);
      assert(Array.isArray(translation.errors));
      assert(translation.errors.length > 0);

      // Verify error details
      translation.errors.forEach(error => {
        assert.strictEqual(typeof error.line, 'number');
        assert.strictEqual(typeof error.command, 'string');
        assert.strictEqual(typeof error.error, 'string');
      });
    });

    it('should validate coordinate systems', async () => {
      const translator = new GCodeTranslator({});

      const gcode = [
        'G90 ; Absolute positioning',
        'G1 X10 Y10',
        'G91 ; Relative positioning',
        'G1 X5 Y5',
        'G90 ; Back to absolute',
      ];

      const translation = await translator.translateGCode(gcode);

      assert(translation.success);

      const commands = translation.commands;
      const moveCommands = commands.filter(cmd => cmd.type === 'move');

      // First move should be absolute
      assert.strictEqual(moveCommands[0].mode, 'absolute');
      assert.strictEqual(moveCommands[0].position.x, 10);

      // Second move should be relative
      assert.strictEqual(moveCommands[1].mode, 'relative');
      assert.strictEqual(moveCommands[1].position.x, 5);
    });
  });

  describe('MKS57D Manager Integration', () => {
    it('should initialize MKS57D manager with multiple controllers', async () => {
      const config = {
        simulationMode: true,
        controllers: [
          { id: 1, name: 'Controller 1', canId: 0x100 },
          { id: 2, name: 'Controller 2', canId: 0x101 },
        ],
        canInterface: 'test-can0',
      };

      const manager = new MKS57DManager(config);
      await manager.initialize();

      assert(manager.isConnected());
      assert.strictEqual(manager.getControllerCount(), 2);

      const controllers = manager.getControllers();
      assert.strictEqual(controllers.length, 2);
      assert.strictEqual(controllers[0].name, 'Controller 1');
      assert.strictEqual(controllers[1].name, 'Controller 2');
    });

    it('should handle individual controller commands', async () => {
      const manager = new MKS57DManager({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', canId: 0x100 }],
      });

      await manager.initialize();

      // Test position command
      const positionResult = await manager.setPosition(1, 1000, 500); // controller 1, position 1000, speed 500
      assert(positionResult.success);

      // Test velocity command
      const velocityResult = await manager.setVelocity(1, 300); // controller 1, velocity 300
      assert(velocityResult.success);

      // Test enable/disable
      const enableResult = await manager.enableController(1);
      assert(enableResult.success);

      const disableResult = await manager.disableController(1);
      assert(disableResult.success);
    });

    it('should read controller status and feedback', async () => {
      const manager = new MKS57DManager({
        simulationMode: true,
        controllers: [{ id: 1, name: 'Test Controller', canId: 0x100 }],
      });

      await manager.initialize();

      // Get controller status
      const status = await manager.getControllerStatus(1);
      assert(status);
      assert.strictEqual(typeof status.position, 'number');
      assert.strictEqual(typeof status.velocity, 'number');
      assert.strictEqual(typeof status.current, 'number');
      assert.strictEqual(typeof status.temperature, 'number');
      assert.strictEqual(typeof status.enabled, 'boolean');

      // Get all controllers status
      const allStatus = await manager.getAllStatus();
      assert(Array.isArray(allStatus));
      assert.strictEqual(allStatus.length, 1);
      assert.strictEqual(allStatus[0].controllerId, 1);
    });

    it('should handle CAN communication errors gracefully', async () => {
      const manager = new MKS57DManager({
        simulationMode: false, // Try real communication
        controllers: [{ id: 1, name: 'Test Controller', canId: 0x100 }],
        canInterface: 'non-existent-can',
      });

      try {
        await manager.initialize();

        // If initialization succeeds (fallback to simulation), test error handling
        const result = await manager.setPosition(999, 1000, 500); // Non-existent controller
        assert.strictEqual(result.success, false);
        assert(result.error);
      } catch (error) {
        // Expected if CAN interface doesn't exist
        assert(error.message.includes('CAN') || error.message.includes('interface'));
      }
    });
  });

  describe('Hardware Integration via API', () => {
    it('should integrate hardware commands through manual control API', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Test axis movement
      const moveResponse = await client
        .post('/api/manual/move')
        .send({
          axis: 'axis1',
          direction: 'positive',
          amount: 10.5,
        })
        .expect(200);

      const moveData = helper.assertApiResponse(moveResponse);
      assert(moveData.success);
      assert(moveData.position);
      assert.strictEqual(typeof moveData.position.axis1, 'number');
    });

    it('should integrate hardware homing through API', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const homeResponse = await client
        .post('/api/home')
        .send({
          axes: ['axis1', 'axis2', 'axis3'],
        })
        .expect(200);

      const homeData = helper.assertApiResponse(homeResponse);
      assert(homeData.success);
      assert(typeof homeData.message === 'string');
    });

    it('should integrate G-code execution with hardware', async () => {
      const client = helper.createAuthenticatedRequest('operator');
      const gcode = createTestGCode('simple');

      const executeResponse = await client.post('/api/gcode/execute').send({ gcode }).expect(200);

      const executeData = helper.assertApiResponse(executeResponse);
      assert(executeData.success);
      assert(typeof executeData.executionId === 'string');

      // Check execution status
      const statusResponse = await client.get('/api/gcode/execution/state').expect(200);

      const statusData = helper.assertApiResponse(statusResponse);
      assert(statusData.state);
      assert(typeof statusData.state.status === 'string');
      assert(typeof statusData.state.progress === 'number');
    });

    it('should handle emergency stop through API', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const stopResponse = await client.post('/api/emergency-stop').send({}).expect(200);

      const stopData = helper.assertApiResponse(stopResponse);
      assert(stopData.success);
    });
  });

  describe('Hardware Status Monitoring', () => {
    it('should monitor hardware connection status', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const healthResponse = await client.get('/api/monitoring/health').expect(200);

      const healthData = helper.assertApiResponse(healthResponse);
      assert(healthData.hardware);
      assert(typeof healthData.hardware.connected === 'boolean');
      assert(typeof healthData.hardware.protocol === 'string');

      if (healthData.hardware.controllers) {
        assert(Array.isArray(healthData.hardware.controllers));
      }
    });

    it('should track hardware metrics', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const metricsResponse = await client.get('/api/monitoring/metrics').expect(200);

      const metricsData = helper.assertApiResponse(metricsResponse);

      // Should include hardware-related metrics
      if (metricsData.hardware) {
        assert(typeof metricsData.hardware.commandsExecuted === 'number');
        assert(typeof metricsData.hardware.uptime === 'number');
      }
    });

    it('should handle hardware error reporting', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Try to trigger a hardware error (invalid axis)
      const errorResponse = await client
        .post('/api/manual/move')
        .send({
          axis: 'invalid_axis',
          direction: 'positive',
          amount: 1,
        })
        .expect(400);

      assert(errorResponse.body.error);
      assert(typeof errorResponse.body.error === 'string');
    });
  });

  describe('Hardware Configuration Management', () => {
    it('should update hardware configuration dynamically', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const newConfig = {
        robotType: 'updated-robot',
        communicationProtocol: 'serial',
        serialConfig: {
          port: '/dev/ttyUSB1',
          baudRate: 9600,
        },
        axes: {
          count: 4,
          limits: {
            axis1: { min: -90, max: 90 },
            axis2: { min: -45, max: 45 },
            axis3: { min: 0, max: 180 },
            axis4: { min: -270, max: 270 },
          },
        },
        manipulators: {
          count: 1,
          gripper1: { min: 0, max: 50 },
        },
      };

      const updateResponse = await client.post('/api/config').send(newConfig).expect(200);

      const updateData = helper.assertApiResponse(updateResponse);
      assert(updateData.success);

      // Verify configuration was applied
      const getResponse = await client.get('/api/config').expect(200);

      assert.strictEqual(getResponse.body.robotType, newConfig.robotType);
      assert.strictEqual(getResponse.body.communicationProtocol, newConfig.communicationProtocol);
    });

    it('should validate hardware configuration constraints', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Test invalid axis count
      const invalidConfig = {
        robotType: 'test-robot',
        axes: {
          count: -1, // Invalid
        },
      };

      await client.post('/api/config').send(invalidConfig).expect(400);

      // Test invalid limits
      const invalidLimitsConfig = {
        robotType: 'test-robot',
        axes: {
          count: 2,
          limits: {
            axis1: { min: 100, max: 50 }, // Min > Max
          },
        },
      };

      await client.post('/api/config').send(invalidLimitsConfig).expect(400);
    });
  });

  describe('Hardware Communication Protocols', () => {
    it('should handle CAN bus communication configuration', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const canConfig = {
        robotType: 'can-robot',
        communicationProtocol: 'can',
        canConfig: {
          interface: 'can0',
          baseCanId: 256,
          baudRate: 500000,
        },
        axes: { count: 6 },
        manipulators: { count: 2 },
      };

      const response = await client.post('/api/config').send(canConfig).expect(200);

      const data = helper.assertApiResponse(response);
      assert(data.success);
    });

    it('should handle serial communication configuration', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const serialConfig = {
        robotType: 'serial-robot',
        communicationProtocol: 'serial',
        serialConfig: {
          port: '/dev/ttyUSB0',
          baudRate: 115200,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
        },
        axes: { count: 4 },
        manipulators: { count: 1 },
      };

      const response = await client.post('/api/config').send(serialConfig).expect(200);

      const data = helper.assertApiResponse(response);
      assert(data.success);
    });

    it('should handle RS485 communication configuration', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      const rs485Config = {
        robotType: 'rs485-robot',
        communicationProtocol: 'rs485',
        rs485Config: {
          port: '/dev/ttyUSB2',
          baudRate: 9600,
          slaveId: 1,
        },
        axes: { count: 3 },
        manipulators: { count: 1 },
      };

      const response = await client.post('/api/config').send(rs485Config).expect(200);

      const data = helper.assertApiResponse(response);
      assert(data.success);
    });
  });

  describe('Hardware Safety and Limits', () => {
    it('should enforce software limits during movement', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Set strict limits
      const configWithLimits = {
        robotType: 'limited-robot',
        communicationProtocol: 'can',
        axes: {
          count: 1,
          limits: {
            axis1: { min: -10, max: 10 },
          },
        },
        manipulators: { count: 1 },
      };

      await client.post('/api/config').send(configWithLimits).expect(200);

      // Try to move within limits - should succeed
      const validMoveResponse = await client
        .post('/api/manual/move')
        .send({
          axis: 'axis1',
          direction: 'positive',
          amount: 5,
        })
        .expect(200);

      assert(validMoveResponse.body.success);

      // Try to move beyond limits - should fail or be clamped
      const invalidMoveResponse = await client.post('/api/manual/move').send({
        axis: 'axis1',
        direction: 'positive',
        amount: 50, // Would exceed limit
      });

      // Should either fail (400) or succeed with clamped value
      assert(invalidMoveResponse.status === 400 || invalidMoveResponse.status === 200);

      if (invalidMoveResponse.status === 200) {
        // If succeeded, position should be clamped to limit
        assert(invalidMoveResponse.body.position.axis1 <= 10);
      }
    });

    it('should handle emergency stop properly', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Start a movement
      const movePromise = client.post('/api/manual/move').send({
        axis: 'axis1',
        direction: 'positive',
        amount: 100,
      });

      // Trigger emergency stop quickly
      await new Promise(resolve => setTimeout(resolve, 10));

      const stopResponse = await client.post('/api/emergency-stop').send({}).expect(200);

      assert(stopResponse.body.success);

      // Complete the movement request
      const moveResponse = await movePromise;

      // Movement might complete or be interrupted - both are valid
      assert(moveResponse.status === 200 || moveResponse.status === 400);
    });

    it('should validate movement parameters', async () => {
      const client = helper.createAuthenticatedRequest('operator');

      // Test invalid axis
      await client
        .post('/api/manual/move')
        .send({
          axis: 'nonexistent_axis',
          direction: 'positive',
          amount: 1,
        })
        .expect(400);

      // Test invalid direction
      await client
        .post('/api/manual/move')
        .send({
          axis: 'axis1',
          direction: 'invalid_direction',
          amount: 1,
        })
        .expect(400);

      // Test invalid amount
      await client
        .post('/api/manual/move')
        .send({
          axis: 'axis1',
          direction: 'positive',
          amount: -1,
        })
        .expect(400);
    });
  });
});
