# Runbook: Robot Hardware Communication Failure
**Incident Type**: Hardware Interface Failure  
**Severity**: P1 (Critical) - P0 (Emergency if safety implications)  
**SLO Impact**: Hardware Communication Uptime < 99.5%

## 🎯 Overview
This runbook addresses failures in robot hardware communication across all supported protocols (Serial, CAN Bus, RS485, Modbus, TCP/IP). Hardware communication failures can prevent robot control and may pose safety risks.

## 🚨 Symptoms and Indicators
- **Prometheus Alerts**:
  - `HardwareCommunicationDown`
  - `SerialProtocolLatencyHigh`
  - `CANBusLatencyHigh`
- **User Reports**: "Robot not responding to commands"
- **Dashboard Indicators**: Hardware status showing "disconnected"
- **Log Messages**: Connection timeout errors, protocol errors

## ⚡ Immediate Safety Actions (< 2 minutes)
1. **Safety Assessment**
   ```bash
   # Check current robot position and movement status
   curl -s http://localhost:5000/api/status | jq '.robot.current_position'
   
   # Verify emergency stop systems are functional
   curl -s http://localhost:5000/api/emergency-stop/test
   ```

2. **Stop Active Operations**
   ```bash
   # Send emergency stop command
   curl -X POST http://localhost:5000/api/emergency-stop
   
   # Cancel any running G-code execution
   curl -X POST http://localhost:5000/api/gcode/cancel
   ```

3. **Isolate Hardware**
   - Ensure robot is in safe position
   - Verify no physical obstructions
   - Check power indicators and emergency stops

## 🔍 Diagnosis Steps

### Step 1: Identify Affected Protocol(s)
```bash
# Check hardware communication status for all protocols
kubectl logs -n arctos deployment/arctos-robot-controller | grep -i "hardware\|protocol\|communication" | tail -20

# Check specific protocol status
curl -s http://localhost:5000/api/hardware/status | jq '.protocols'
```

**Expected Output**: Protocol status and last successful communication timestamp

### Step 2: Physical Connection Verification
```bash
# For Serial connections
ls -la /dev/ttyUSB* /dev/ttyACM*
dmesg | grep -i usb | tail -10

# For CAN Bus (if applicable)
ip link show can0
candump can0 -n 10

# For RS485/Modbus
modbus-client -r 1 -a 1 -t 4 192.168.1.100  # Example IP
```

### Step 3: Application-Level Diagnostics
```bash
# Check system monitor status
curl -s http://localhost:5000/api/monitoring/system | jq '.hardware'

# Review recent error logs
tail -100 /var/log/arctos/error.log | grep -i hardware

# Check database for recent hardware events
sqlite3 /app/data/robot.db "SELECT * FROM hardware_events ORDER BY timestamp DESC LIMIT 10;"
```

### Step 4: Network and Infrastructure Checks
```bash
# For TCP/IP based protocols
ping <robot_controller_ip>
telnet <robot_controller_ip> <port>

# Check firewall and network policies
iptables -L | grep <robot_port>
netstat -tuln | grep <robot_port>
```

## 🛠️ Resolution Procedures

### Procedure A: Serial Communication Recovery
```bash
# Reset USB-Serial device
echo "Resetting USB-Serial connection..."
usb_modeswitch -v 0x1234 -p 0x5678 -R  # Replace with actual vendor/product ID

# Restart serialport service
sudo systemctl restart serialport-manager
sleep 5

# Test communication
curl -X POST http://localhost:5000/api/hardware/test-connection \
  -H "Content-Type: application/json" \
  -d '{"protocol": "serial", "port": "/dev/ttyUSB0", "baudRate": 115200}'
```

### Procedure B: CAN Bus Recovery
```bash
# Reset CAN interface
sudo ip link set can0 down
sleep 2
sudo ip link set can0 up type can bitrate 500000
sleep 2

# Test CAN communication
cansend can0 123#DEADBEEF
candump can0 -n 1

# Restart CAN service
sudo systemctl restart can-interface
```

### Procedure C: Network Protocol Recovery (TCP/IP, Modbus)
```bash
# Reset network connection
sudo systemctl restart networking
sleep 5

# Test network connectivity
ping -c 3 <robot_controller_ip>

# Reset Modbus service if applicable
sudo systemctl restart modbus-service

# Test protocol communication
curl -X POST http://localhost:5000/api/hardware/modbus/test \
  -H "Content-Type: application/json" \
  -d '{"address": "192.168.1.100", "port": 502}'
```

### Procedure D: Application Service Recovery
```bash
# Restart hardware interface service
sudo systemctl restart arctos-hardware-interface

# Restart main application (if other methods fail)
sudo systemctl restart arctos-robot-controller

# Verify service startup
sudo systemctl status arctos-robot-controller
journalctl -u arctos-robot-controller -n 20
```

## ✅ Verification Steps

### Step 1: Communication Test
```bash
# Test basic communication for all protocols
curl -X POST http://localhost:5000/api/hardware/test-all-protocols

# Expected response: {"status": "success", "protocols": {"serial": "ok", "can": "ok", ...}}
```

### Step 2: Robot Movement Test
```bash
# Send test movement command (small, safe movement)
curl -X POST http://localhost:5000/api/robot/move \
  -H "Content-Type: application/json" \
  -d '{"x": 0, "y": 0, "z": 1, "relative": true}'  # 1mm Z-axis movement

# Verify position update
curl -s http://localhost:5000/api/status | jq '.robot.current_position'
```

### Step 3: Real-time Communication Test
```bash
# Test WebSocket updates
wscat -c ws://localhost:5000/socket.io/?EIO=4&transport=websocket

# Should receive real-time position and status updates
```

### Step 4: Full System Validation
```bash
# Run comprehensive hardware test
curl -X POST http://localhost:5000/api/diagnostics/full-hardware-test

# Load and execute simple G-code test
curl -X POST http://localhost:5000/api/gcode/execute \
  -H "Content-Type: application/json" \
  -d '{"gcode": "G1 X0 Y0 Z0\nG1 X1 Y1 Z1\nG1 X0 Y0 Z0"}'
```

## 🔄 Prevention Measures

### Immediate Actions
1. **Update Monitoring Thresholds**
   - Lower alerting threshold for early detection
   - Add protocol-specific health checks
   
2. **Hardware Health Checks**
   ```bash
   # Add automated hardware health monitoring
   crontab -e
   # Add: */5 * * * * /usr/local/bin/hardware-health-check.sh
   ```

3. **Connection Pooling and Retry Logic**
   - Implement exponential backoff for reconnections
   - Add circuit breaker pattern to prevent cascading failures

### Long-term Improvements
1. **Hardware Redundancy**
   - Implement backup communication channels
   - Add hardware failover mechanisms

2. **Enhanced Monitoring**
   - Add protocol-specific metrics
   - Implement synthetic health checks

3. **Automation**
   - Automated recovery procedures
   - Self-healing connection management

## 📊 Post-Incident Actions

### Data Collection
```bash
# Collect diagnostic information
mkdir -p /tmp/incident-$(date +%Y%m%d-%H%M%S)
cd /tmp/incident-$(date +%Y%m%d-%H%M%S)

# System logs
journalctl -u arctos-robot-controller --since="1 hour ago" > system.log

# Hardware logs
cp /var/log/arctos/hardware.log .

# Network diagnostics
ss -tuln > network-status.txt
ip addr show > network-interfaces.txt

# Create incident report bundle
tar -czf incident-diagnostics-$(date +%Y%m%d-%H%M%S).tar.gz *
```

### Metrics Update
```bash
# Update incident tracking
curl -X POST http://localhost:5000/api/monitoring/incident \
  -H "Content-Type: application/json" \
  -d '{
    "type": "hardware_communication_failure",
    "duration_minutes": 15,
    "protocols_affected": ["serial", "can"],
    "root_cause": "USB hub power failure",
    "resolution": "Hardware reset and service restart"
  }'
```

## 📞 Escalation Contacts

### Technical Escalation
- **Hardware Engineer**: John Smith (+1-555-0123)
- **Robotics Specialist**: Jane Doe (+1-555-0124)
- **Infrastructure Team**: infra-oncall@company.com

### Management Escalation
- **Engineering Manager**: Alice Johnson (+1-555-0125)
- **VP Engineering**: Bob Wilson (+1-555-0126)

### Vendor Support
- **Robot Manufacturer**: support@robotvendor.com (+1-800-ROBOT-1)
- **Hardware Supplier**: hardware@supplier.com (+1-800-HW-HELP)

## 🔗 Related Runbooks
- [Robot Position Data Corruption](./robot-position-corruption.md)
- [Emergency Stop System Failure](./emergency-stop-failure.md)
- [High Latency Troubleshooting](./high-latency-troubleshooting.md)
- [Network Connectivity Issues](./network-connectivity.md)

## 📚 Additional Resources
- [Hardware Interface Documentation](../documentation/hardware-interfaces.md)
- [Protocol Configuration Guide](../documentation/protocol-configuration.md)
- [Monitoring Dashboard](https://grafana.example.com/d/hardware/hardware-communication)
- [Troubleshooting FAQ](../documentation/troubleshooting-faq.md)

---

**Last Updated**: 2024-01-15  
**Reviewed By**: SRE Team  
**Next Review**: 2024-04-15