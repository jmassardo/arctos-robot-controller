const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs-extra');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { TwoFactorAuth } = require('./two-factor-auth');

// Authentication middleware and utilities
class AuthService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'arctos-robot-controller-secret-2025';
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
    this.REFRESH_TOKEN_EXPIRES_IN = '7d';
    
    // User storage file
    this.USERS_FILE = path.join(__dirname, '../data', 'users.json');
    this.SESSIONS_FILE = path.join(__dirname, '../data', 'sessions.json');
    
    // Initialize 2FA service
    this.twoFactorAuth = new TwoFactorAuth();
    
    // Ensure data directory exists
    fs.ensureDirSync(path.dirname(this.USERS_FILE));
    
    // Initialize with default admin user if no users exist
    this.initializeDefaultUser();
  }

  async initializeDefaultUser() {
    try {
      let users = [];
      if (fs.existsSync(this.USERS_FILE)) {
        users = await fs.readJson(this.USERS_FILE);
      }
      
      // Create default admin user if no users exist
      if (users.length === 0) {
        const defaultAdmin = {
          id: 1,
          username: 'admin',
          email: 'admin@arctos-robot.local',
          password: await bcrypt.hash('admin123', 12),
          role: 'admin',
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLogin: null,
          loginAttempts: 0,
          lockoutUntil: null
        };
        
        users.push(defaultAdmin);
        await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
        console.log('✓ Default admin user created (username: admin, password: admin123)');
      }
    } catch (error) {
      console.error('Failed to initialize default user:', error);
    }
  }

  async getAllUsers() {
    try {
      if (!fs.existsSync(this.USERS_FILE)) {
        return [];
      }
      return await fs.readJson(this.USERS_FILE);
    } catch (error) {
      console.error('Error reading users:', error);
      return [];
    }
  }

  async getUserByUsername(username) {
    const users = await this.getAllUsers();
    return users.find(user => user.username === username);
  }

  async getUserById(id) {
    const users = await this.getAllUsers();
    return users.find(user => user.id === parseInt(id));
  }

  async createUser(userData) {
    const users = await this.getAllUsers();
    
    // Check if username or email already exists
    const existingUser = users.find(u => 
      u.username === userData.username || u.email === userData.email
    );
    
    if (existingUser) {
      throw new Error('Username or email already exists');
    }
    
    const newUser = {
      id: Math.max(0, ...users.map(u => u.id)) + 1,
      username: userData.username,
      email: userData.email,
      password: await bcrypt.hash(userData.password, 12),
      role: userData.role || 'operator',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      loginAttempts: 0,
      lockoutUntil: null
    };
    
    users.push(newUser);
    await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
    
    // Return user without password
    const { password, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  async updateUser(id, updateData) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.id === parseInt(id));
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    // Hash password if provided
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 12);
    }
    
    users[userIndex] = { ...users[userIndex], ...updateData };
    await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
    
    // Return user without password
    const { password, ...userWithoutPassword } = users[userIndex];
    return userWithoutPassword;
  }

  async deleteUser(id) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.id === parseInt(id));
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    // Don't allow deleting the last admin
    const user = users[userIndex];
    if (user.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin' && u.isActive).length;
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last admin user');
      }
    }
    
    users.splice(userIndex, 1);
    await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
    
    return true;
  }

  async authenticateUser(username, password) {
    const user = await this.getUserByUsername(username);
    
    if (!user || !user.isActive) {
      return { success: false, message: 'Invalid credentials' };
    }
    
    // Check for account lockout
    if (user.lockoutUntil && new Date() < new Date(user.lockoutUntil)) {
      return { success: false, message: 'Account temporarily locked due to too many failed attempts' };
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      // Increment login attempts
      await this.incrementLoginAttempts(user.id);
      return { success: false, message: 'Invalid credentials' };
    }
    
    // Reset login attempts and update last login
    await this.resetLoginAttempts(user.id);
    
    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    
    // Store refresh token session
    await this.storeRefreshToken(user.id, refreshToken);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      success: true,
      user: userWithoutPassword,
      accessToken,
      refreshToken
    };
  }

  async incrementLoginAttempts(userId) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex !== -1) {
      users[userIndex].loginAttempts = (users[userIndex].loginAttempts || 0) + 1;
      
      // Lock account after 5 failed attempts for 15 minutes
      if (users[userIndex].loginAttempts >= 5) {
        users[userIndex].lockoutUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      
      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
    }
  }

  async resetLoginAttempts(userId) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex !== -1) {
      users[userIndex].loginAttempts = 0;
      users[userIndex].lockoutUntil = null;
      users[userIndex].lastLogin = new Date().toISOString();
      
      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        type: 'access'
      },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        type: 'refresh'
      },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );
  }

  async storeRefreshToken(userId, refreshToken) {
    let sessions = [];
    if (fs.existsSync(this.SESSIONS_FILE)) {
      sessions = await fs.readJson(this.SESSIONS_FILE);
    }
    
    // Remove old sessions for this user (keep only last 3)
    sessions = sessions.filter(s => s.userId !== userId);
    
    sessions.push({
      userId,
      refreshToken,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    });
    
    // Keep only recent sessions
    sessions = sessions.slice(-100);
    
    await fs.writeJson(this.SESSIONS_FILE, sessions, { spaces: 2 });
  }

  async validateRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET);
      
      if (decoded.type !== 'refresh') {
        return { success: false, message: 'Invalid token type' };
      }
      
      // Check if refresh token exists in sessions
      let sessions = [];
      if (fs.existsSync(this.SESSIONS_FILE)) {
        sessions = await fs.readJson(this.SESSIONS_FILE);
      }
      
      const session = sessions.find(s => s.refreshToken === refreshToken && s.userId === decoded.id);
      if (!session) {
        return { success: false, message: 'Invalid refresh token' };
      }
      
      // Check if session is expired
      if (new Date() > new Date(session.expiresAt)) {
        return { success: false, message: 'Refresh token expired' };
      }
      
      const user = await this.getUserById(decoded.id);
      if (!user || !user.isActive) {
        return { success: false, message: 'User not found or inactive' };
      }
      
      return { success: true, user };
    } catch (error) {
      return { success: false, message: 'Invalid refresh token' };
    }
  }

  async revokeRefreshToken(refreshToken) {
    let sessions = [];
    if (fs.existsSync(this.SESSIONS_FILE)) {
      sessions = await fs.readJson(this.SESSIONS_FILE);
    }
    
    sessions = sessions.filter(s => s.refreshToken !== refreshToken);
    await fs.writeJson(this.SESSIONS_FILE, sessions, { spaces: 2 });
  }

  async revokeAllUserTokens(userId) {
    let sessions = [];
    if (fs.existsSync(this.SESSIONS_FILE)) {
      sessions = await fs.readJson(this.SESSIONS_FILE);
    }
    
    sessions = sessions.filter(s => s.userId !== userId);
    await fs.writeJson(this.SESSIONS_FILE, sessions, { spaces: 2 });
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET);
      
      if (decoded.type !== 'access') {
        return { success: false, message: 'Invalid token type' };
      }
      
      return { success: true, user: decoded };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { success: false, message: 'Token expired' };
      }
      return { success: false, message: 'Invalid token' };
    }
  }

  // Two-Factor Authentication Methods
  // =================================

  /**
   * Setup 2FA for a user
   */
  async setup2FA(userId) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Generate 2FA setup
      const setup = await this.twoFactorAuth.setupTwoFactor(user.username, user.email);
      
      // Store the secret temporarily (user must verify to enable)
      user.tempTwoFactorSecret = setup.secret;
      user.tempBackupCodes = this.twoFactorAuth.hashBackupCodes(setup.backupCodes);
      
      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });

      return {
        success: true,
        setup: {
          qrCode: setup.qrCode,
          backupCodes: setup.backupCodes, // Show once for user to save
          instructions: setup.setupInstructions
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Verify and enable 2FA for a user
   */
  async verify2FASetup(userId, token) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user || !user.tempTwoFactorSecret) {
        return { success: false, message: 'No 2FA setup in progress' };
      }

      // Verify the token
      if (!this.twoFactorAuth.verifySetup(token, user.tempTwoFactorSecret)) {
        return { success: false, message: 'Invalid verification code' };
      }

      // Enable 2FA
      user.twoFactorSecret = user.tempTwoFactorSecret;
      user.twoFactorEnabled = true;
      user.backupCodes = user.tempBackupCodes;
      user.twoFactorSetupDate = new Date().toISOString();

      // Clear temporary data
      delete user.tempTwoFactorSecret;
      delete user.tempBackupCodes;

      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });

      return {
        success: true,
        message: '2FA enabled successfully',
        enabledAt: user.twoFactorSetupDate
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Verify 2FA token during login
   */
  async verify2FAToken(userId, token, isBackupCode = false) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user || !user.twoFactorEnabled) {
        return { success: false, message: 'User not found or 2FA not enabled' };
      }

      let verified = false;

      if (isBackupCode) {
        // Verify backup code
        if (!user.backupCodes || user.backupCodes.length === 0) {
          return { success: false, message: 'No backup codes available' };
        }

        // Check each backup code
        for (let i = 0; i < user.backupCodes.length; i++) {
          if (this.twoFactorAuth.verifyBackupCode(token, user.backupCodes[i])) {
            // Remove used backup code
            user.backupCodes.splice(i, 1);
            verified = true;
            break;
          }
        }

        if (verified) {
          await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
        }
      } else {
        // Verify TOTP token
        verified = this.twoFactorAuth.verifyToken(token, user.twoFactorSecret);
      }

      if (verified) {
        user.lastTwoFactorUse = new Date().toISOString();
        await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });
      }

      return {
        success: verified,
        message: verified ? '2FA verification successful' : 'Invalid 2FA code',
        backupCodesRemaining: user.backupCodes?.length || 0
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Disable 2FA for a user
   */
  async disable2FA(userId, adminUserId = null) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Clear 2FA data
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.backupCodes = null;
      user.tempTwoFactorSecret = null;
      user.tempBackupCodes = null;
      user.twoFactorDisabledDate = new Date().toISOString();
      
      if (adminUserId) {
        const admin = users.find(u => u.id === adminUserId);
        user.twoFactorDisabledBy = admin?.username || 'admin';
      }

      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });

      return {
        success: true,
        message: '2FA disabled successfully',
        disabledAt: user.twoFactorDisabledDate
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user || !user.twoFactorEnabled) {
        return { success: false, message: 'User not found or 2FA not enabled' };
      }

      // Generate new backup codes
      const newCodes = this.twoFactorAuth.generateBackupCodes();
      user.backupCodes = this.twoFactorAuth.hashBackupCodes(newCodes);
      user.backupCodesRegeneratedDate = new Date().toISOString();

      await fs.writeJson(this.USERS_FILE, users, { spaces: 2 });

      return {
        success: true,
        backupCodes: newCodes, // Show once for user to save
        message: 'New backup codes generated successfully'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Get 2FA status for a user
   */
  async get2FAStatus(userId) {
    try {
      const users = await fs.readJson(this.USERS_FILE);
      const user = users.find(u => u.id === userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      return {
        success: true,
        status: {
          enabled: user.twoFactorEnabled || false,
          setupDate: user.twoFactorSetupDate || null,
          lastUsed: user.lastTwoFactorUse || null,
          backupCodesRemaining: user.backupCodes?.length || 0,
          hasTempSetup: !!user.tempTwoFactorSecret
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// Middleware functions
const authService = new AuthService();

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const result = authService.verifyAccessToken(token);
  
  if (!result.success) {
    return res.status(401).json({ success: false, message: result.message });
  }

  // Get fresh user data
  const user = await authService.getUserById(result.user.id);
  if (!user || !user.isActive) {
    return res.status(401).json({ success: false, message: 'User not found or inactive' });
  }

  req.user = { ...result.user, isActive: user.isActive };
  next();
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const userRoles = Array.isArray(roles) ? roles : [roles];
    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    
    next();
  };
};

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['admin', 'operator', 'viewer'])
    .withMessage('Role must be admin, operator, or viewer')
];

const loginValidation = [
  body('username')
    .isLength({ min: 1 })
    .withMessage('Username is required'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
];

const changePasswordValidation = [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
];

module.exports = {
  AuthService,
  authService,
  authenticateToken,
  requireRole,
  registerValidation,
  loginValidation,
  changePasswordValidation
};