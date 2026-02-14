# Arctos Robot Controller - Troubleshooting Guide

## 🚨 Emergency Procedures

### Immediate Safety Response

**Robot Won't Stop / Runaway Motion:**
1. **🔴 EMERGENCY STOP**: Press physical red button on robot controller
2. **💻 Software Stop**: Click large red "EMERGENCY STOP" in interface  
3. **⚡ Power Disconnect**: Turn off main power switch if buttons fail
4. **📢 Clear Area**: Evacuate all personnel from robot work area
5. **📞 Call Support**: Emergency hotline 1-800-ARCTOS-1

**Communication Lost During Movement:**
1. **🔴 Emergency Stop**: Press physical button immediately
2. **🔌 Check Cables**: Verify all connections secure
3. **🖥️ Restart Software**: Close and reopen control interface
4. **🔄 Reconnect**: Wait for "Connected" status before resuming
5. **✅ Test Small**: Try small jog movement to verify control

**Unusual Sounds or Vibration:**
1. **🛑 Stop Immediately**: Use emergency stop or soft stop
2. **👀 Visual Inspection**: Look for loose parts, obstructions, or damage
3. **📝 Document**: Note what operation was running when problem occurred
4. **❌ Do Not Resume**: Contact maintenance before restarting
5. **📋 Report**: Log incident for investigation

## 🔍 Diagnostic Tools

### System Health Check

**Quick Status Verification:**
```bash
# Check backend server health
curl http://localhost:5000/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-01-21T10:30:00Z",
  "services": {
    "database": "healthy", 
    "robot": "connected",
    "gcode": "ready"
  }
}
```

**Connection Test:**
1. Open browser developer tools (F12)
2. Go to Console tab
3. Look for WebSocket connection messages
4. Should see: "Socket connected to server"
5. Red errors indicate connection problems

**Performance Check:**
1. Navigate to Configuration > System Monitoring
2. Check CPU usage (should be < 70%)
3. Check memory usage (should be < 80%) 
4. Monitor response times (should be < 100ms)

### Log Analysis

**Backend Logs Location:**
- **Console Output**: Terminal running `npm start`
- **File Logs**: `logs/` directory (if configured)
- **Error Logs**: Look for lines with `[ERROR]` or `[WARN]`

**Frontend Browser Logs:**
1. Press F12 to open developer tools
2. Go to Console tab
3. Look for red error messages
4. Check Network tab for failed requests

**Common Log Patterns:**
```bash
# Successful operation
[INFO] Robot moved to position successfully

# Connection issue  
[ERROR] Robot controller connection timeout

# Configuration problem
[WARN] Axis limit exceeded, movement cancelled

# Authentication failure
[ERROR] Invalid token, authentication required
```

## 🚫 Connection Issues

### "Disconnected" Status

**Symptom**: Interface shows red "Disconnected" status
**Impact**: Cannot control robot, no real-time updates

**Diagnosis Steps:**
1. **Check Backend**: Terminal should show "Server running on port 5000"
2. **Check Network**: Can you access http://localhost:5000/api/health?
3. **Check Firewall**: Windows/Mac firewall may block ports
4. **Check Browser**: Try different browser or incognito mode

**Solutions by Cause:**

**Backend Not Running:**
```bash
# Navigate to project directory
cd /path/to/arctos-robot-controller

# Start backend server
npm start

# Wait for confirmation message
```

**Port Conflict:**
```bash
# Check what's using port 5000
lsof -i :5000

# If another process is using it, kill it or change port
```

**Firewall Issues (Windows):**
1. Open Windows Defender Firewall
2. Click "Allow an app through firewall"
3. Add Node.js or allow ports 3000 and 5000

**Firewall Issues (Mac):**
1. System Preferences > Security & Privacy > Firewall
2. Firewall Options > Add Node.js to exceptions

**Network Configuration:**
```bash
# Test local connectivity
ping localhost
curl http://localhost:5000/api/health

# Check if ports are listening
netstat -an | grep 5000
```

### Robot Controller Communication

**Symptom**: Software connected, but robot doesn't respond
**Impact**: Interface works but robot won't move

**Hardware Checklist:**
- [ ] Robot controller power LED is on
- [ ] Communication cable securely connected
- [ ] Correct cable type (USB, Ethernet, CAN, Serial)
- [ ] Cable not damaged or bent excessively

**Software Checklist:**
- [ ] Correct communication protocol selected (Serial/CAN/RS485)
- [ ] Correct port/interface name in configuration
- [ ] Matching baud rate settings
- [ ] No other software using the same port

**Serial Connection Issues:**
```bash
# List available serial ports (Linux/Mac)
ls /dev/tty*

# List COM ports (Windows)
mode

# Test serial port access
# Should be readable/writable by user account
```

**CAN Bus Issues:**
```bash
# Check CAN interface status (Linux)
ip link show can0

# Bring up CAN interface
sudo ip link set can0 up type can bitrate 250000

# Test CAN communication
candump can0
```

## ⚙️ Movement Problems

### Robot Won't Move

**Symptom**: Jog buttons clicked but no robot movement
**Impact**: Cannot position robot manually

**Systematic Diagnosis:**

**1. Emergency Stop Check:**
- Look for red "EMERGENCY STOP ACTIVE" message
- Physical button may be pressed/twisted
- Solution: Twist red button to release, click interface button

**2. Position Limits:**
- Check if position values are red (at limits)
- Review axis limits in Configuration tab
- Solution: Move away from limits or adjust limit settings

**3. Robot Homing:**
- Some systems require homing after power-on
- Check if "HOMING REQUIRED" message appears
- Solution: Click "Home Robot" button or send G28 command

**4. Communication Timeout:**
- Interface may show "TIMEOUT" or connection warnings
- Solution: Check cables, restart robot controller

**5. Safety Interlocks:**
- External safety systems may prevent movement
- Check door switches, light curtains, guard switches
- Solution: Close doors, clear safety zones

**Speed and Movement Quality Issues:**

**Symptom**: Robot moves too slowly or jerkily
**Possible Causes**:
- Speed setting too low
- Acceleration limits too conservative  
- Mechanical binding or wear
- Power supply issues

**Solutions**:
1. **Adjust Speed**: Increase speed slider gradually (25% → 50% → 75%)
2. **Check Acceleration**: Review axis acceleration settings
3. **Mechanical Check**: Look for obstructions, loose cables
4. **Power Check**: Verify voltage levels at robot controller

### Position Accuracy Problems

**Symptom**: Robot doesn't return to same position repeatedly
**Impact**: Poor product quality, program failures

**Causes and Solutions**:

**Mechanical Backlash:**
- Solution: Enable backlash compensation in Configuration
- Solution: Approach positions from consistent direction
- Solution: Use slower speeds for final positioning

**Encoder Issues:**
- Check for encoder cable damage
- Verify encoder power supply voltage
- Solution: Recalibrate encoders or replace if defective

**Temperature Effects:**
- Metal expansion changes dimensions
- Solution: Allow warm-up time before precision work
- Solution: Monitor and compensate for temperature

**Calibration Drift:**
- Home position may drift over time
- Solution: Re-home robot more frequently
- Solution: Verify home switch operation

## 📝 G-Code Execution Issues

### Program Upload Problems

**Symptom**: G-code file won't upload or shows validation errors
**Impact**: Cannot run automated programs

**File Format Issues:**
```
Common Valid Extensions: .gcode, .nc, .txt, .cnc
File Size Limit: 10MB maximum
Line Limit: 10,000 lines maximum
Character Encoding: UTF-8 recommended
```

**Validation Error Solutions:**

**"Unknown G-Code Command":**
```gcode
# Problem: Unsupported command
G17 X10 Y20  ; G17 not supported

# Solution: Use supported commands only
G01 X10 Y20 F1000  ; Linear move instead
```

**"Position Exceeds Limits":**
```gcode
# Problem: Movement beyond axis limits
G01 X500 Y300  ; X=500 exceeds 200mm limit

# Solution: Check limits in Configuration tab
# Or modify G-code coordinates
G01 X150 Y200  ; Within limits
```

**"Missing Feed Rate":**
```gcode  
# Problem: No feed rate specified
G01 X10 Y20    ; Missing F parameter

# Solution: Add feed rate
G01 X10 Y20 F800  ; Add feed rate
```

### Execution Failures

**Symptom**: Program starts but stops with error mid-execution
**Impact**: Incomplete operations, potential damage

**Common Execution Errors:**

**"Position Limit Exceeded":**
- G-code tries to move beyond configured limits
- Solution: Review G-code coordinates vs. Configuration limits
- Solution: Use G28 (home) before program to establish reference

**"Communication Timeout":**
- Robot stops responding during program
- Solution: Check cables, reduce program speed
- Solution: Break long programs into shorter segments

**"Emergency Stop Triggered":**
- Safety system or operator stopped execution
- Solution: Clear safety condition, reset emergency stop
- Solution: Resume from safe position or restart program

**"Tool/Gripper Error":**
- M-code commands fail (M100, M101, etc.)
- Solution: Check gripper/manipulator configuration
- Solution: Test gripper operation manually first

### Performance Optimization

**Slow G-Code Execution:**
- **Increase Feed Rates**: Use F1000 instead of F100
- **Optimize Paths**: Minimize unnecessary movements
- **Reduce Precision**: Use G01 instead of G02/G03 for simple moves
- **Batch Operations**: Group similar operations together

**Memory Issues with Large Programs:**
- **Split Files**: Break large programs into smaller parts
- **Remove Comments**: Delete unnecessary comment lines
- **Optimize Coordinates**: Use incremental (G91) mode when appropriate

## 🔧 Configuration Problems

### Settings Won't Save

**Symptom**: Configuration changes don't persist after restart
**Impact**: Must reconfigure system repeatedly

**File Permission Issues:**
```bash
# Check if config directory is writable
ls -la config/
# Should show write permissions for user

# Fix permissions if needed (Linux/Mac)
chmod 755 config/
chmod 644 config/robot-config.json

# Windows: Right-click folder > Properties > Security > Edit
```

**Configuration File Corruption:**
```bash
# Backup current config
cp config/robot-config.json config/robot-config.json.backup

# Restore default configuration
rm config/robot-config.json
# Restart application to recreate defaults
```

### Invalid Configuration Values

**Symptom**: Configuration validation errors
**Solutions**:

**Axis Limits:**
```json
// Problem: Min > Max
"axis1": { "min": 100, "max": 50 }

// Solution: Fix values
"axis1": { "min": -50, "max": 100 }
```

**Speed Settings:**
```json
// Problem: Speed too high
"maxSpeed": 10000

// Solution: Use reasonable values
"maxSpeed": 1000
```

**Port Names:**
```json
// Problem: Invalid port name
"port": "COM999"

// Solution: Check available ports
// Windows: COM1, COM2, etc.
// Linux: /dev/ttyUSB0, /dev/ttyS0
// Mac: /dev/cu.usbserial-*
```

## 🔐 Authentication Issues

### Login Problems

**Symptom**: Cannot log in with correct credentials
**Solutions**:

**Password Reset (Admin):**
```bash
# Reset admin password (from server directory)
node -e "
const { authService } = require('./lib/auth');
authService.resetPassword('admin', 'newpassword123')
  .then(() => console.log('Password reset successful'))
  .catch(err => console.error('Reset failed:', err));
"
```

**Account Locked:**
- Wait 15 minutes for automatic unlock
- Or contact administrator for manual unlock
- Check audit logs for failed login attempts

**Token Expiration:**
- Tokens expire after 1 hour by default
- Use refresh token to get new access token
- Or log out and log back in

### Permission Denied

**Symptom**: "Insufficient permissions" errors
**Solutions**:

**Check User Role:**
1. Go to Configuration > User Management
2. Verify user has appropriate role:
   - `operator`: Basic robot control
   - `technician`: Advanced configuration  
   - `admin`: Full access

**Required Permissions by Action:**
- **Robot Movement**: `execute` permission
- **Configuration Changes**: `configure` permission  
- **User Management**: `admin` role
- **System Logs**: `technician` or `admin` role

## 📱 Mobile/Browser Issues

### Mobile Interface Problems

**Symptom**: Touch controls don't work on mobile devices
**Solutions**:

**Browser Compatibility:**
- Use Chrome, Firefox, or Safari mobile browsers
- Enable JavaScript and WebSocket support
- Update to latest browser version

**Touch Control Issues:**
- Use landscape orientation for better layout
- Tap and hold for continuous jog movements
- Double-tap to access fine control mode

**Performance on Mobile:**
- Close other apps to free memory
- Use WiFi instead of cellular data
- Reduce number of open browser tabs

### Browser-Specific Issues

**Chrome:**
- Clear browser cache and cookies
- Disable ad blockers for localhost
- Check if hardware acceleration causes issues

**Firefox:**
- Enable WebSocket connections in about:config
- Check if strict privacy settings block functionality
- Try Firefox Developer Edition

**Safari:**
- Enable JavaScript in preferences
- Allow WebSocket connections for localhost
- Check if Intelligent Tracking Prevention interferes

## 📊 Performance Issues

### Slow Interface Response

**Symptom**: Interface lags or freezes
**Solutions**:

**Browser Performance:**
- Close unnecessary tabs and applications
- Clear browser cache and temporary files
- Restart browser completely
- Try different browser

**Network Issues:**
- Use wired Ethernet connection instead of WiFi
- Check for network congestion
- Test with laptop connected directly to robot controller

**System Resources:**
```bash
# Check system performance (Linux/Mac)
top
htop

# Windows Task Manager
# Look for high CPU or memory usage

# Node.js memory usage
node --inspect server.js
# Open chrome://inspect to monitor
```

### Database Performance

**Symptom**: Position loading or saving is slow
**Solutions**:

**Database Optimization:**
```bash
# Backup current database
cp data/positions.db data/positions.db.backup

# Vacuum database to reclaim space
sqlite3 data/positions.db "VACUUM;"

# Reindex for better performance  
sqlite3 data/positions.db "REINDEX;"
```

**Large Position Database:**
- Archive old positions to separate files
- Delete unused test positions
- Organize positions into groups for faster filtering

## 🛠️ Maintenance Procedures

### Regular Maintenance Tasks

**Daily:**
- [ ] Check system status indicators
- [ ] Verify emergency stop functionality
- [ ] Clear any error messages
- [ ] Monitor robot temperature readings

**Weekly:**
- [ ] Export position database backup
- [ ] Review error logs for patterns
- [ ] Clean browser cache and temporary files
- [ ] Test G-code program execution

**Monthly:**
- [ ] Full configuration backup
- [ ] Database optimization (vacuum/reindex)
- [ ] Update software if new versions available
- [ ] Review and archive old log files

### Backup and Recovery

**Critical Files to Backup:**
```
config/robot-config.json    - Robot configuration
data/saved-positions.json   - Position database  
data/gcode-programs/        - G-code program files
logs/                       - System logs
```

**Backup Script Example:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="backup_$DATE"

mkdir -p $BACKUP_DIR
cp -r config/ $BACKUP_DIR/
cp -r data/ $BACKUP_DIR/  
cp -r logs/ $BACKUP_DIR/

tar -czf "arctos_backup_$DATE.tar.gz" $BACKUP_DIR
echo "Backup complete: arctos_backup_$DATE.tar.gz"
```

## 📞 Getting Support

### Self-Service Tools

**Built-in Diagnostics:**
1. Configuration > System Health
2. Review error codes and descriptions
3. Export system logs for analysis
4. Use built-in connection test tools

**Community Resources:**
- **Forum**: forum.arctos-robotics.com
- **Documentation**: docs.arctos-robotics.com  
- **Video Tutorials**: youtube.com/arctos-robotics
- **Knowledge Base**: kb.arctos-robotics.com

### When to Contact Support

**Contact Immediately For:**
- Safety-related issues or injuries
- Robot runaway or control loss
- Fire, smoke, or burning odors
- Structural damage to robot or equipment

**Contact During Business Hours For:**
- Software bugs or unexpected behavior
- Configuration assistance
- Performance optimization
- Training requests

**Support Information to Provide:**
```
System Information:
- Robot model and serial number
- Software version (shown in interface)
- Operating system and browser
- Network configuration

Problem Details:
- Exact error messages (copy/paste)
- Steps to reproduce the issue  
- When problem first occurred
- Recent configuration changes

Files to Include:
- Configuration backup
- Error logs (last 24 hours)
- Screenshots of error messages
- G-code files if execution problem
```

**Support Contacts:**
- **Technical Support**: support@arctos-robotics.com
- **Emergency Hotline**: 1-800-ARCTOS-1 (24/7)
- **Sales/General**: info@arctos-robotics.com
- **Training**: training@arctos-robotics.com

**Response Time Expectations:**
- **Critical/Safety Issues**: 1 hour
- **System Down**: 4 hours business time
- **General Issues**: 24 hours business time
- **Enhancement Requests**: 1 week

---

*Troubleshooting Guide v1.0 - Updated January 21, 2025*  
*For latest version and updates: docs.arctos-robotics.com*