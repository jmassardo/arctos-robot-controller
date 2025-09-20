const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');

test('Socket.IO Real-time Communication', async (t) => {
  let httpServer;
  let io;
  let serverSocket;
  let clientSocket;
  
  // Setup Socket.IO server for testing
  await t.before(async () => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    await new Promise((resolve) => {
      httpServer.listen(3098, resolve);
    });
    
    io.on('connection', (socket) => {
      serverSocket = socket;
      
      // Simulate robot controller event handlers
      socket.on('requestCurrentPosition', () => {
        socket.emit('positionUpdate', {
          axis1: 0, axis2: 0, axis3: 0, axis4: 0, axis5: 0, axis6: 0,
          gripper: 'open',
          timestamp: new Date().toISOString()
        });
      });
      
      socket.on('manualMove', (data) => {
        // Validate data before processing
        if (!data || !data.axis || typeof data.amount !== 'number') {
          return; // Ignore invalid data
        }
        
        // Simulate manual movement
        socket.emit('movementComplete', {
          axis: data.axis,
          newPosition: data.amount,
          success: true
        });
        
        // Broadcast position update
        socket.broadcast.emit('positionUpdate', {
          [data.axis]: data.amount,
          timestamp: new Date().toISOString()
        });
      });
      
      socket.on('executeGCode', (data) => {
        // Simulate G-code execution
        socket.emit('gcodeStatus', { status: 'executing', progress: 0 });
        
        // Simulate progress updates
        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          socket.emit('gcodeStatus', { status: 'executing', progress });
          
          if (progress >= 100) {
            clearInterval(interval);
            socket.emit('gcodeStatus', { status: 'completed', progress: 100 });
          }
        }, 100);
      });
      
      socket.on('homeAxes', (axes) => {
        // Simulate homing operation
        socket.emit('homingStatus', { status: 'homing', axes });
        
        setTimeout(() => {
          socket.emit('homingStatus', { status: 'completed', axes });
          socket.emit('positionUpdate', {
            axis1: 0, axis2: 0, axis3: 0, axis4: 0, axis5: 0, axis6: 0,
            timestamp: new Date().toISOString()
          });
        }, 500);
      });
      
      socket.on('emergencyStop', () => {
        socket.emit('emergencyStopResponse', { success: true, timestamp: new Date().toISOString() });
        socket.emit('gcodeStatus', { status: 'stopped', progress: 0 });
      });
    });
  });
  
  await t.beforeEach(async () => {
    clientSocket = new Client('http://localhost:3098', {
      transports: ['websocket']
    });
    
    await new Promise((resolve) => {
      clientSocket.on('connect', resolve);
    });
  });
  
  await t.afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });
  
  await t.after(() => {
    if (httpServer) {
      httpServer.close();
    }
  });
  
  await t.test('should establish WebSocket connection', async () => {
    assert.ok(clientSocket.connected, 'Client should be connected');
    assert.ok(serverSocket, 'Server should have socket connection');
  });
  
  await t.test('should handle position requests', async () => {
    const positionPromise = new Promise((resolve) => {
      clientSocket.on('positionUpdate', resolve);
    });
    
    clientSocket.emit('requestCurrentPosition');
    
    const position = await positionPromise;
    assert.ok(position, 'Should receive position update');
    assert.ok(typeof position.axis1 === 'number', 'Should have numeric axis1');
    assert.ok(typeof position.axis2 === 'number', 'Should have numeric axis2');
    assert.ok(position.gripper, 'Should have gripper state');
    assert.ok(position.timestamp, 'Should have timestamp');
  });
  
  await t.test('should handle manual movement commands', async () => {
    const moveCompletePromise = new Promise((resolve) => {
      clientSocket.on('movementComplete', resolve);
    });
    
    const positionUpdatePromise = new Promise((resolve) => {
      clientSocket.on('positionUpdate', resolve);
    });
    
    clientSocket.emit('manualMove', {
      axis: 'axis1',
      amount: 45,
      direction: 'positive'
    });
    
    const moveResult = await moveCompletePromise;
    assert.ok(moveResult.success, 'Movement should succeed');
    assert.strictEqual(moveResult.axis, 'axis1', 'Should move correct axis');
    assert.strictEqual(moveResult.newPosition, 45, 'Should move to correct position');
    
    // Note: positionUpdate is broadcast to other clients, not the sender
    // In a real test environment with multiple clients, we would test this
  });
  
  await t.test('should handle G-code execution with progress updates', async () => {
    const statusUpdates = [];
    
    clientSocket.on('gcodeStatus', (status) => {
      statusUpdates.push(status);
    });
    
    const completionPromise = new Promise((resolve) => {
      clientSocket.on('gcodeStatus', (status) => {
        if (status.status === 'completed') {
          resolve(status);
        }
      });
    });
    
    clientSocket.emit('executeGCode', {
      gcode: 'G28\\nG1 X10 Y20 F1000\\nM2'
    });
    
    const completion = await completionPromise;
    
    assert.strictEqual(completion.status, 'completed', 'G-code should complete');
    assert.strictEqual(completion.progress, 100, 'Progress should reach 100%');
    assert.ok(statusUpdates.length > 1, 'Should receive multiple progress updates');
    
    // Check progress sequence
    const progressValues = statusUpdates.map(s => s.progress).filter(p => p !== undefined);
    assert.ok(progressValues.every(p => p >= 0 && p <= 100), 'All progress values should be 0-100');
  });
  
  await t.test('should handle homing operations', async () => {
    const homingPromise = new Promise((resolve) => {
      const statusUpdates = [];
      clientSocket.on('homingStatus', (status) => {
        statusUpdates.push(status);
        if (status.status === 'completed') {
          resolve(statusUpdates);
        }
      });
    });
    
    const positionPromise = new Promise((resolve) => {
      clientSocket.on('positionUpdate', resolve);
    });
    
    clientSocket.emit('homeAxes', ['axis1', 'axis2', 'axis3']);
    
    const homingUpdates = await homingPromise;
    const finalPosition = await positionPromise;
    
    assert.ok(homingUpdates.length >= 2, 'Should receive homing status updates');
    assert.strictEqual(homingUpdates[0].status, 'homing', 'Should start homing');
    assert.strictEqual(homingUpdates[homingUpdates.length - 1].status, 'completed', 'Should complete homing');
    
    // Check that all axes are reset to 0
    assert.strictEqual(finalPosition.axis1, 0, 'Axis1 should be homed to 0');
    assert.strictEqual(finalPosition.axis2, 0, 'Axis2 should be homed to 0');
    assert.strictEqual(finalPosition.axis3, 0, 'Axis3 should be homed to 0');
  });
  
  await t.test('should handle emergency stop', async () => {
    const emergencyPromise = new Promise((resolve) => {
      clientSocket.on('emergencyStopResponse', resolve);
    });
    
    const gcodeStopPromise = new Promise((resolve) => {
      clientSocket.on('gcodeStatus', (status) => {
        if (status.status === 'stopped') {
          resolve(status);
        }
      });
    });
    
    clientSocket.emit('emergencyStop');
    
    const emergencyResponse = await emergencyPromise;
    const gcodeStop = await gcodeStopPromise;
    
    assert.ok(emergencyResponse.success, 'Emergency stop should succeed');
    assert.ok(emergencyResponse.timestamp, 'Should have timestamp');
    assert.strictEqual(gcodeStop.status, 'stopped', 'G-code should be stopped');
    assert.strictEqual(gcodeStop.progress, 0, 'Progress should reset to 0');
  });
  
  await t.test('should handle connection and disconnection events', async () => {
    let disconnectFired = false;
    
    serverSocket.on('disconnect', () => {
      disconnectFired = true;
    });
    
    // Test disconnection
    clientSocket.disconnect();
    
    // Wait for disconnect event to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert.ok(disconnectFired, 'Disconnect event should fire');
  });
  
  await t.test('should handle multiple concurrent clients', async () => {
    // Create second client
    const client2 = new Client('http://localhost:3098', {
      transports: ['websocket']
    });
    
    await new Promise((resolve) => {
      client2.on('connect', resolve);
    });
    
    // Set up listeners for broadcast messages
    const client1Updates = [];
    const client2Updates = [];
    
    clientSocket.on('positionUpdate', (data) => {
      client1Updates.push(data);
    });
    
    client2.on('positionUpdate', (data) => {
      client2Updates.push(data);
    });
    
    // Client 1 makes a move (should broadcast to client 2)
    clientSocket.emit('manualMove', {
      axis: 'axis1',
      amount: 90
    });
    
    // Wait for broadcast
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Client 2 should receive the broadcast, Client 1 should not
    assert.strictEqual(client1Updates.length, 0, 'Client 1 should not receive its own broadcast');
    assert.strictEqual(client2Updates.length, 1, 'Client 2 should receive broadcast');
    assert.strictEqual(client2Updates[0].axis1, 90, 'Client 2 should receive correct position');
    
    client2.disconnect();
  });
  
  await t.test('should handle error conditions gracefully', async () => {
    // Test invalid event data
    let errorHandled = false;
    
    serverSocket.on('error', () => {
      errorHandled = true;
    });
    
    // Send malformed data
    clientSocket.emit('manualMove', null);
    clientSocket.emit('executeGCode', undefined);
    clientSocket.emit('homeAxes', 'invalid');
    
    // Wait for potential errors to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Socket.IO should handle these gracefully without crashing
    assert.ok(clientSocket.connected, 'Connection should remain stable after invalid data');
  });
});