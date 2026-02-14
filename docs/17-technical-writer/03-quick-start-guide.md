# Arctos Robot Controller - Quick Start Guide

**🎯 Goal: Get your robot moving in 15 minutes**

This guide gets you up and running with basic robot control quickly. For comprehensive documentation, see the [User Guide](02-user-guide.md).

## ⚡ 5-Minute Setup

### Step 1: Start the Application (2 minutes)

**Backend Server:**
```bash
cd /path/to/arctos-robot-controller
npm start
```
*Wait for: "Server running on port 5000" message*

**Frontend Interface (new terminal):**
```bash
cd client
npm start
```
*Wait for: "Compiled successfully" and browser opens to http://localhost:3000*

### Step 2: First Login (1 minute)

1. **Default Account**: If this is a new installation, use:
   - Username: `admin`  
   - Password: `admin123`
   - **⚠️ Change password immediately after first login**

2. **New Installation**: If no default account exists:
   - Click "Register" 
   - Create admin account with strong password
   - Use role: `admin`

### Step 3: Verify Connection (2 minutes)

**Check Status:**
- Look for **"Connected"** status in green at the top of the interface
- If shows "Disconnected" in red, check:
  - Backend server is running (terminal shows "Server running")
  - No firewall blocking ports 3000 or 5000
  - Refresh browser page

**Test Interface:**
1. Navigate between tabs: Manual Control, G-Code Control, Position Replay, Configuration
2. All tabs should load without errors
3. Position values should be visible (may show 0.00 for all axes initially)

## 🤖 10-Minute Robot Operation

### Step 4: Safety First (2 minutes)

**Essential Safety Checks:**
- [ ] **Emergency stop button visible and accessible** (large red button in interface)
- [ ] **Work area clear** of people and obstacles  
- [ ] **Robot power on** and status lights normal
- [ ] **Communication cable connected** between computer and robot controller

**Test Emergency Stop:**
1. Click the red **"EMERGENCY STOP"** button in the interface
2. Verify robot stops immediately (if moving)
3. Click button again to reset and continue

### Step 5: First Movement (4 minutes)

**Home the Robot:**
1. Go to **"Manual Control"** tab
2. Click **"Home Robot"** button (if available)
3. Wait for robot to move to home position
4. All position values should now show meaningful numbers

**Manual Jog Test:**
1. **Start small**: Use **"+0.1"** and **"-0.1"** buttons first
2. **Pick one axis**: Try **Axis 1** movement buttons
3. **Watch the numbers**: Position value should change
4. **Test both directions**: + and - buttons
5. **Gradually increase**: Try **"+1"** and **"-1"** buttons

**Success Indicators:**
- ✅ Position numbers change when you click jog buttons
- ✅ Robot moves smoothly without jerking
- ✅ No error messages appear
- ✅ Emergency stop works when tested

### Step 6: Save Your First Position (2 minutes)

**Create Reference Position:**
1. Move robot to a memorable position using jog controls
2. In "Position Name" field, enter: **"My First Position"**
3. Click **"Save Current Position"**
4. Success message should appear: *"Position saved successfully"*

**Verify Position Saved:**
1. Go to **"Position Replay"** tab  
2. You should see "My First Position" in the list
3. It should show the exact axis values where you saved it

### Step 7: Test Position Replay (2 minutes)

**Replay Your Position:**
1. Move robot to a different location using manual controls
2. Go to **"Position Replay"** tab
3. Check the box next to "My First Position"
4. Click **"Replay Selected Positions"**
5. Robot should move back to your saved position

**Success**: Robot returns to exact same position you saved!

## 🎮 Basic Operations Summary

### Manual Control Quick Reference

**Movement Controls:**
- **+10 / -10**: Large movements (coarse positioning)
- **+1 / -1**: Medium movements (normal positioning)  
- **+0.1 / -0.1**: Small movements (fine positioning)

**Gripper/Manipulator:**
- **Open**: Fully open gripper (0%)
- **50%**: Half-open position
- **Close**: Fully close gripper (100%)

**Essential Buttons:**
- **🔴 Emergency Stop**: Stops everything immediately
- **🏠 Home**: Returns to reference position
- **💾 Save Position**: Stores current location

### Interface Navigation

**Four Main Tabs:**
1. **Manual Control** 📱 - Direct robot movement, position saving
2. **G-Code Control** 📝 - Automated program execution  
3. **Position Replay** 🔄 - Sequence multiple saved positions
4. **Configuration** ⚙️ - System settings and limits

**Status Indicators:**
- **🟢 Connected**: Normal operation
- **🟡 Moving**: Robot in motion
- **🔴 Error**: Problem needs attention
- **⚫ Disconnected**: Communication lost

## 🚨 Common Issues & Quick Fixes

### "Disconnected" Status
**Problem**: Interface shows red "Disconnected" 
**Fix**: 
1. Check backend terminal - should show "Server running on port 5000"
2. If not running: `npm start` in main directory
3. Refresh browser page
4. Check robot controller power and cables

### Robot Not Moving
**Problem**: Jog buttons clicked but robot doesn't move
**Fixes**:
1. **Check Emergency Stop**: Click red button to reset if activated
2. **Home Robot**: Click "Home" button to establish position reference
3. **Check Position**: Make sure not at movement limits (red numbers)
4. **Verify Connection**: Status should show "Connected"

### Can't Save Positions  
**Problem**: "Save Position" button doesn't work
**Fixes**:
1. **Enter Position Name**: Field cannot be empty
2. **Check Permissions**: Login with operator or higher role
3. **Try Again**: Sometimes requires second click
4. **Check Browser Console**: F12 > Console for error messages

### Slow Performance
**Problem**: Interface updates slowly or freezes
**Fixes**:
1. **Close Extra Tabs**: Only keep one browser tab open
2. **Refresh Page**: Ctrl+F5 to force reload
3. **Check Network**: WiFi should be strong, wired is better
4. **Restart Browser**: Close and reopen browser completely

## 📋 15-Minute Checklist

Copy this checklist for new operators:

**Setup (5 min):**
- [ ] Backend server started and shows "Server running on port 5000"
- [ ] Frontend opened and shows interface at localhost:3000  
- [ ] Successfully logged in (admin/admin123 or registered account)
- [ ] Status shows "Connected" in green

**Safety (2 min):**
- [ ] Emergency stop button tested and works
- [ ] Work area cleared of people and obstacles
- [ ] Robot controller powered on with normal status lights

**Basic Operation (8 min):**
- [ ] Robot homed to reference position (if available)
- [ ] Manual jog controls tested on at least one axis
- [ ] Position values change when jog buttons pressed
- [ ] First position saved with name "My First Position"
- [ ] Position replay tested and robot returns to saved location
- [ ] All four tabs accessible (Manual, G-Code, Replay, Config)

**Success Criteria:**
✅ Can manually move robot in small increments  
✅ Can save and replay positions accurately  
✅ Emergency stop works reliably  
✅ Interface responds quickly to commands  
✅ No error messages or connection issues  

## 🎯 Next Steps

**Once basic operation works:**

1. **Read Full User Guide**: [User Guide](02-user-guide.md) for comprehensive features
2. **Learn G-Code**: Try the sample programs in G-Code Control tab
3. **Create Position Sequences**: Build multi-step workflows in Position Replay
4. **Configure for Your Robot**: Adjust settings in Configuration tab
5. **Set Up Additional Users**: Add operator accounts for your team

**Advanced Features to Explore:**
- **3D Visualization**: Real-time robot model display
- **Mobile Interface**: Touch controls for smartphones/tablets  
- **Advanced G-Code**: Custom macros and complex programs
- **System Monitoring**: Performance metrics and health tracking
- **Security Features**: Two-factor authentication and audit logs

## 📞 Getting Help

**If you're stuck after 15 minutes:**

**Quick Self-Help:**
1. **Check browser console**: Press F12, look for red error messages
2. **Try different browser**: Chrome/Firefox/Safari compatibility
3. **Restart everything**: Close all software, restart application
4. **Check documentation**: [Full API Reference](01-api-reference.md)

**Contact Support:**
- **Email**: support@arctos-robotics.com
- **Emergency**: 1-800-ARCTOS-1 (24/7 for critical issues)
- **Community**: forum.arctos-robotics.com
- **Documentation**: Complete guides at docs.arctos-robotics.com

**Include When Asking for Help:**
- Operating system (Windows/Mac/Linux)
- Browser and version
- Error messages (copy exact text)
- Steps that led to the problem
- Screenshots of any error screens

---

**🎉 Congratulations!** 

If you completed this checklist successfully, you now have basic robot control working. The full [User Guide](02-user-guide.md) and [API Reference](01-api-reference.md) provide detailed information for advanced usage.

**Happy robot controlling! 🤖**

---
*Quick Start Guide v1.0 - Updated January 21, 2025*