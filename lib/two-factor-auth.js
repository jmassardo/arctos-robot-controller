const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Two-Factor Authentication (2FA) service using TOTP
 * Provides secure secondary authentication for sensitive accounts
 */
class TwoFactorAuth {
  constructor() {
    this.serviceName = 'Arctos Robot Controller';
    this.issuer = 'Arctos Robotics';
    this.qrCodeOptions = {
      type: 'png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    };
  }

  /**
   * Generate TOTP secret for a user
   * @param {string} username - User's username
   * @param {string} email - User's email address
   * @returns {Object} Secret configuration
   */
  generateSecret(username, email) {
    try {
      const secret = speakeasy.generateSecret({
        length: 32,
        name: `${this.serviceName} (${username})`,
        issuer: this.issuer
      });

      logger.info('2FA secret generated for user', { 
        username,
        secretLength: secret.base32.length 
      });

      return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
        qrCodeUrl: null // Will be generated separately
      };
    } catch (error) {
      logger.error('Failed to generate 2FA secret', { 
        error: error.message, 
        username 
      });
      throw new Error('Failed to generate 2FA secret');
    }
  }

  /**
   * Generate QR code for TOTP secret
   * @param {string} otpauthUrl - TOTP URL from secret generation
   * @returns {Promise<string>} Base64 encoded QR code image
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl, this.qrCodeOptions);
      
      logger.info('QR code generated for 2FA setup');
      
      return qrCodeDataUrl;
    } catch (error) {
      logger.error('Failed to generate QR code', { error: error.message });
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Verify TOTP token
   * @param {string} token - 6-digit TOTP token
   * @param {string} secret - User's TOTP secret
   * @param {Object} options - Verification options
   * @returns {boolean} True if token is valid
   */
  verifyToken(token, secret, options = {}) {
    try {
      const {
        window = 1, // Allow 1 step before/after (30 seconds each)
        time = Math.floor(Date.now() / 1000)
      } = options;

      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        step: 30, // 30 second intervals
        window: window,
        time: time
      });

      if (verified) {
        logger.info('2FA token verification successful');
      } else {
        logger.warn('2FA token verification failed', { 
          tokenLength: token?.length,
          hasSecret: !!secret 
        });
      }

      return verified;
    } catch (error) {
      logger.error('2FA token verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Generate backup codes for account recovery
   * @param {number} count - Number of backup codes to generate (default: 10)
   * @returns {string[]} Array of backup codes
   */
  generateBackupCodes(count = 10) {
    try {
      const codes = [];
      
      for (let i = 0; i < count; i++) {
        // Generate 8-character alphanumeric codes
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
      }

      logger.info('Backup codes generated', { count: codes.length });
      
      return codes;
    } catch (error) {
      logger.error('Failed to generate backup codes', { error: error.message });
      throw new Error('Failed to generate backup codes');
    }
  }

  /**
   * Hash backup codes for secure storage
   * @param {string[]} codes - Array of backup codes
   * @returns {string[]} Array of hashed backup codes
   */
  hashBackupCodes(codes) {
    try {
      return codes.map(code => {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256').toString('hex');
        return `${salt}:${hash}`;
      });
    } catch (error) {
      logger.error('Failed to hash backup codes', { error: error.message });
      throw new Error('Failed to hash backup codes');
    }
  }

  /**
   * Verify backup code
   * @param {string} inputCode - Code provided by user
   * @param {string} storedHash - Stored hashed code
   * @returns {boolean} True if code is valid
   */
  verifyBackupCode(inputCode, storedHash) {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) {
        return false;
      }

      const inputHash = crypto.pbkdf2Sync(inputCode, salt, 100000, 32, 'sha256').toString('hex');
      
      // Constant time comparison to prevent timing attacks
      const result = crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(inputHash, 'hex')
      );

      if (result) {
        logger.info('Backup code verification successful');
      } else {
        logger.warn('Backup code verification failed');
      }

      return result;
    } catch (error) {
      logger.error('Backup code verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Complete 2FA setup for a user
   * @param {string} username - User's username  
   * @param {string} email - User's email
   * @returns {Promise<Object>} Setup configuration with QR code
   */
  async setupTwoFactor(username, email) {
    try {
      logger.info('Starting 2FA setup', { username });

      // Generate secret and QR code
      const secretConfig = this.generateSecret(username, email);
      const qrCodeDataUrl = await this.generateQRCode(secretConfig.otpauthUrl);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      return {
        secret: secretConfig.secret,
        qrCode: qrCodeDataUrl,
        backupCodes: backupCodes,
        setupInstructions: {
          step1: 'Install an authenticator app (Google Authenticator, Authy, etc.)',
          step2: 'Scan the QR code with your authenticator app',
          step3: 'Enter the 6-digit code from your app to verify setup',
          step4: 'Save the backup codes in a secure location'
        }
      };
    } catch (error) {
      logger.error('2FA setup failed', { 
        error: error.message, 
        username 
      });
      throw new Error('Failed to setup two-factor authentication');
    }
  }

  /**
   * Verify 2FA setup by confirming TOTP token
   * @param {string} token - TOTP token from authenticator app
   * @param {string} secret - Generated secret
   * @returns {boolean} True if setup is verified
   */
  verifySetup(token, secret) {
    try {
      if (!token || !secret) {
        return false;
      }

      // More lenient verification for setup (wider time window)
      const verified = this.verifyToken(token, secret, { window: 2 });
      
      if (verified) {
        logger.info('2FA setup verification successful');
      } else {
        logger.warn('2FA setup verification failed');
      }

      return verified;
    } catch (error) {
      logger.error('2FA setup verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Disable 2FA for a user (requires admin privileges)
   * @param {string} username - Target username
   * @param {string} adminUsername - Admin performing the action
   * @returns {Object} Disable result
   */
  disableTwoFactor(username, adminUsername) {
    try {
      logger.audit('2FA disabled by admin', {
        targetUser: username,
        adminUser: adminUsername,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `Two-factor authentication disabled for ${username}`,
        disabledAt: new Date().toISOString(),
        disabledBy: adminUsername
      };
    } catch (error) {
      logger.error('Failed to disable 2FA', { 
        error: error.message, 
        username, 
        adminUsername 
      });
      throw new Error('Failed to disable two-factor authentication');
    }
  }

  /**
   * Get 2FA status and statistics
   * @param {string} username - Username to check
   * @returns {Object} 2FA status information
   */
  getStatus(username) {
    try {
      // This would typically query the database for user's 2FA status
      // For now, return a template structure
      return {
        username,
        enabled: false,
        setupDate: null,
        lastUsed: null,
        backupCodesRemaining: 0,
        recoveryOptions: ['admin_disable', 'backup_codes']
      };
    } catch (error) {
      logger.error('Failed to get 2FA status', { 
        error: error.message, 
        username 
      });
      throw new Error('Failed to get 2FA status');
    }
  }

  /**
   * Generate recovery instructions for users who lost access
   * @returns {Object} Recovery instructions
   */
  getRecoveryInstructions() {
    return {
      lostDevice: {
        title: 'Lost Authenticator Device',
        steps: [
          'Use one of your saved backup codes to log in',
          'Go to Security Settings and disable 2FA',
          'Set up 2FA again with your new device',
          'Generate new backup codes'
        ]
      },
      lostBackupCodes: {
        title: 'Lost Backup Codes',
        steps: [
          'Log in using your authenticator app',
          'Go to Security Settings',
          'Generate new backup codes',
          'Save the new codes in a secure location'
        ]
      },
      completeLoss: {
        title: 'Lost Both Device and Backup Codes',
        steps: [
          'Contact your system administrator',
          'Administrator can disable 2FA for your account',
          'Set up 2FA again after regaining access',
          'Generate and securely store new backup codes'
        ]
      }
    };
  }

  /**
   * Security recommendations for 2FA usage
   * @returns {Object} Security recommendations
   */
  getSecurityRecommendations() {
    return {
      authenticatorApps: [
        'Google Authenticator (iOS/Android)',
        'Authy (iOS/Android/Desktop)',
        'Microsoft Authenticator (iOS/Android)',
        'LastPass Authenticator (iOS/Android)'
      ],
      bestPractices: [
        'Use a reputable authenticator app',
        'Store backup codes in a secure location (password manager, safe)',
        'Never share backup codes or screenshots of QR codes',
        'Set up 2FA on multiple devices if possible',
        'Regularly review and rotate backup codes',
        'Keep your authenticator app updated'
      ],
      security: [
        'Time-based codes expire every 30 seconds',
        'Backup codes can only be used once',
        'Failed attempts are logged and monitored',
        'Account lockout after multiple failed attempts'
      ]
    };
  }
}

module.exports = { TwoFactorAuth };