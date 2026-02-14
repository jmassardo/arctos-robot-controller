# Arctos Robot Controller - Installation & Setup Guide

## Overview

This guide provides step-by-step instructions for installing and configuring the Arctos Robot Controller system for production use. It covers installation on Windows, macOS, and Linux, as well as Docker deployment options.

**Target Audience**: System Administrators, IT Personnel, Deployment Engineers  
**Prerequisites**: Basic command line familiarity, network administration knowledge  
**Installation Time**: 30-45 minutes for standard installation

## 📋 System Requirements

### Minimum Requirements

**Hardware:**
- CPU: Intel Core i3 or AMD equivalent (2+ cores, 2.0+ GHz)
- RAM: 4GB minimum, 8GB recommended
- Storage: 5GB available disk space
- Network: Ethernet adapter (Gigabit recommended)
- USB: 2+ USB ports for robot communication

**Operating System:**
- **Windows**: Windows 10 (1903+) or Windows Server 2019+
- **macOS**: macOS 10.15 Catalina or newer
- **Linux**: Ubuntu 20.04+, CentOS 8+, RHEL 8+, Debian 11+

**Software Dependencies:**
- Node.js 18.0+ (LTS version recommended)
- NPM 8.0+ (included with Node.js)
- Git 2.25+ for source management
- Modern web browser (Chrome 90+, Firefox 88+, Safari 14+)

### Recommended Production Requirements

**Hardware:**
- CPU: Intel Core i5/i7 or AMD Ryzen 5/7 (4+ cores, 3.0+ GHz)
- RAM: 16GB for multiple concurrent users
- Storage: SSD with 50GB+ available space
- Network: Gigabit Ethernet with static IP
- UPS: Uninterruptible Power Supply for critical operations

**Network Configuration:**
- Static IP address for server
- Firewall ports 3000 and 5000 open
- Low-latency network (<10ms to robot controllers)
- Network isolation for production robots

## 🔧 Installation Methods

### Method 1: Source Installation (Recommended)

**Step 1: Install Node.js**

**Windows:**
1. Download from https://nodejs.org (LTS version)
2. Run installer with administrator privileges
3. Verify installation:
```cmd
node --version
npm --version
```

**macOS:**
```bash
# Using Homebrew (recommended)
brew install node

# Or download from https://nodejs.org
# Verify installation
node --version && npm --version
```

**Linux (Ubuntu/Debian):**
```bash
# Update package index
sudo apt update

# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version && npm --version
```

**Linux (RHEL/CentOS):**
```bash
# Enable NodeSource repository
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# Install Node.js
sudo dnf install nodejs npm

# Verify installation
node --version && npm --version
```

**Step 2: Download and Install Application**

```bash
# Clone repository
git clone https://github.com/your-org/arctos-robot-controller.git
cd arctos-robot-controller

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..

# Build frontend for production
npm run build
```

**Step 3: Initial Configuration**

```bash
# Create initial configuration
npm run setup

# Start application
npm start
```

**Step 4: Verify Installation**

1. Open browser to http://localhost:3000
2. Create admin account
3. Test basic functionality
4. Check for any error messages

### Method 2: Docker Installation

**Prerequisites:**
- Docker 20.10+ installed
- Docker Compose 1.29+ installed
- 4GB+ available RAM for containers

**Step 1: Get Docker Configuration**

```bash
# Clone repository
git clone https://github.com/your-org/arctos-robot-controller.git
cd arctos-robot-controller

# Copy environment template
cp .env.docker .env
```

**Step 2: Configure Environment**

Edit `.env` file with your settings:
```bash
# Database settings
DB_HOST=postgres
DB_PORT=5432
DB_NAME=arctos_robot
DB_USER=arctos_user
DB_PASSWORD=change_this_password

# Application settings
NODE_ENV=production
JWT_SECRET=your_jwt_secret_here
PORT=5000

# Robot communication
ROBOT_TYPE=MKS57D
COMMUNICATION_PROTOCOL=can
```

**Step 3: Start Services**

```bash
# Production deployment
docker-compose up -d

# Development deployment (with hot reload)
docker-compose -f docker-compose.dev.yml up -d

# Check status
docker-compose ps
```

**Step 4: Initialize Database**

```bash
# Run database migrations
docker-compose exec app npm run db:migrate

# Create admin user
docker-compose exec app npm run user:create-admin
```

### Method 3: Pre-built Packages

**Windows Installer:**
1. Download `arctos-robot-controller-setup.exe`
2. Run installer as administrator
3. Follow setup wizard
4. Launch from Start Menu or Desktop shortcut

**macOS Package:**
```bash
# Install via Homebrew
brew tap arctos-robotics/tap
brew install arctos-robot-controller

# Or download .dmg file
# Drag Arctos Robot Controller to Applications folder
```

**Linux Package:**
```bash
# Debian/Ubuntu
wget https://releases.arctos-robotics.com/apt/arctos-robot-controller.deb
sudo dpkg -i arctos-robot-controller.deb
sudo apt-get install -f

# RHEL/CentOS
sudo yum localinstall https://releases.arctos-robotics.com/rpm/arctos-robot-controller.rpm

# Start service
sudo systemctl enable arctos-robot-controller
sudo systemctl start arctos-robot-controller
```

## ⚙️ Configuration

### Basic Configuration

**Configuration File Location:**
- Source install: `config/robot-config.json`
- Windows package: `%APPDATA%/ArctuRobotController/config/`
- macOS package: `~/Library/Application Support/ArctosRobotController/`
- Linux package: `/etc/arctos-robot-controller/` or `~/.config/arctos-robot-controller/`

**Basic Configuration Template:**
```json
{
  "robotType": "MKS57D",
  "communicationProtocol": "can",
  "networkSettings": {
    "port": 5000,
    "host": "0.0.0.0",
    "cors": {
      "origin": ["http://localhost:3000", "http://your-domain.com"],
      "credentials": true
    }
  },
  "serialConfig": {
    "port": "/dev/ttyUSB0",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  },
  "canConfig": {
    "interface": "can0",
    "bitrate": 250000
  },
  "axes": {
    "count": 6,
    "limits": {
      "axis1": { "min": -180, "max": 180 },
      "axis2": { "min": -90, "max": 90 },
      "axis3": { "min": -120, "max": 120 },
      "axis4": { "min": -180, "max": 180 },
      "axis5": { "min": -120, "max": 120 },
      "axis6": { "min": -360, "max": 360 }
    }
  },
  "safetyLimits": {
    "maxSpeed": 1000,
    "maxAcceleration": 500,
    "emergencyStopEnabled": true,
    "softLimitsEnabled": true
  },
  "security": {
    "jwtSecret": "your-secure-jwt-secret-here",
    "sessionTimeout": 3600,
    "maxLoginAttempts": 5,
    "lockoutTime": 900
  }
}
```

### Network Configuration

**Firewall Settings:**

**Windows Firewall:**
```cmd
# Allow inbound connections on required ports
netsh advfirewall firewall add rule name="Arctos Robot Controller" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="Arctos Robot Controller API" dir=in action=allow protocol=TCP localport=5000
```

**Linux iptables:**
```bash
# Allow inbound HTTP traffic
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5000 -j ACCEPT

# Save rules (Ubuntu/Debian)
sudo iptables-save > /etc/iptables/rules.v4
```

**Static IP Configuration:**

**Linux (Ubuntu/Debian):**
```bash
# Edit network configuration
sudo nano /etc/netplan/01-network-manager-all.yaml

network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]

# Apply configuration
sudo netplan apply
```

**Windows:**
1. Control Panel > Network and Sharing Center
2. Change adapter settings > Right-click Ethernet
3. Properties > Internet Protocol Version 4 (TCP/IPv4)
4. Use the following IP address:
   - IP: 192.168.1.100
   - Subnet: 255.255.255.0
   - Gateway: 192.168.1.1

### Database Configuration

**SQLite (Default):**
- No additional setup required
- Database files stored in `data/` directory
- Automatic backup and migration support

**PostgreSQL (Production):**
```bash
# Install PostgreSQL
# Ubuntu/Debian:
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres createdb arctos_robot
sudo -u postgres createuser arctos_user
sudo -u postgres psql -c "ALTER USER arctos_user PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE arctos_robot TO arctos_user;"
```

**Database Configuration:**
```json
{
  "database": {
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "arctos_robot",
    "username": "arctos_user", 
    "password": "secure_password",
    "ssl": false,
    "pool": {
      "min": 2,
      "max": 10,
      "idle": 10000
    }
  }
}
```

### Hardware Configuration

**Serial Communication Setup:**

**Linux Permission Configuration:**
```bash
# Add user to dialout group for serial port access
sudo usermod -a -G dialout $USER

# Set permissions for USB devices
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="1234", ATTRS{idProduct}=="5678", MODE="0666"' | sudo tee /etc/udev/rules.d/99-robot-controller.rules

# Reload udev rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

**Windows COM Port Configuration:**
1. Device Manager > Ports (COM & LPT)
2. Right-click robot controller port
3. Properties > Port Settings
4. Set Bits per second: 115200
5. Data bits: 8, Parity: None, Stop bits: 1

**CAN Bus Setup (Linux):**
```bash
# Install CAN utilities
sudo apt install can-utils

# Bring up CAN interface
sudo ip link set can0 up type can bitrate 250000

# Test CAN communication
candump can0

# Make permanent (add to /etc/network/interfaces)
auto can0
iface can0 inet manual
  pre-up /sbin/ip link set $IFACE type can bitrate 250000
  up /sbin/ifconfig $IFACE up
  down /sbin/ifconfig $IFACE down
```

## 🔐 Security Setup

### SSL/HTTPS Configuration

**Generate Self-Signed Certificate:**
```bash
# Create certificate directory
mkdir -p certs

# Generate private key and certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/CN=your-robot-controller.local"

# Set proper permissions
chmod 600 certs/server.key
chmod 644 certs/server.crt
```

**Configure HTTPS in Application:**
```json
{
  "server": {
    "port": 5000,
    "ssl": {
      "enabled": true,
      "key": "./certs/server.key",
      "cert": "./certs/server.crt"
    }
  }
}
```

### User Account Setup

**Create Initial Admin Account:**
```bash
# Interactive setup
npm run setup:admin

# Or command line
node scripts/create-admin.js --username admin --password SecurePassword123! --email admin@company.com
```

**Configure Authentication:**
```json
{
  "authentication": {
    "jwtSecret": "your-secure-random-secret-key",
    "tokenExpiration": "1h",
    "refreshTokenExpiration": "7d",
    "bcryptRounds": 12,
    "twoFactorAuth": {
      "enabled": true,
      "issuer": "Arctos Robot Controller",
      "window": 2
    }
  }
}
```

### Network Security

**Reverse Proxy with Nginx:**
```nginx
server {
    listen 80;
    server_name your-robot-controller.local;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-robot-controller.local;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📱 Service Configuration

### Windows Service Setup

**Install as Windows Service:**
```cmd
# Install node-windows globally
npm install -g node-windows

# Create service installer script
node scripts/install-windows-service.js

# Start service
net start "Arctos Robot Controller"
```

**Service Configuration File (`service-config.js`):**
```javascript
var Service = require('node-windows').Service;

var svc = new Service({
  name: 'Arctos Robot Controller',
  description: 'Arctos Robot Controller Service',
  script: 'C:\\path\\to\\arctos-robot-controller\\server.js',
  env: {
    name: "NODE_ENV",
    value: "production"
  }
});

svc.install();
```

### Linux systemd Service

**Create Service File:**
```bash
sudo nano /etc/systemd/system/arctos-robot-controller.service
```

**Service Configuration:**
```ini
[Unit]
Description=Arctos Robot Controller
After=network.target

[Service]
Type=simple
User=arctos
Group=arctos
WorkingDirectory=/opt/arctos-robot-controller
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=5000

# Output to syslog
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=arctos-robot

[Install]
WantedBy=multi-user.target
```

**Enable and Start Service:**
```bash
# Create service user
sudo useradd -r -s /bin/false arctos
sudo chown -R arctos:arctos /opt/arctos-robot-controller

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable arctos-robot-controller
sudo systemctl start arctos-robot-controller

# Check status
sudo systemctl status arctos-robot-controller

# View logs
sudo journalctl -u arctos-robot-controller -f
```

### macOS LaunchAgent Setup

**Create LaunchAgent Plist:**
```bash
sudo nano /Library/LaunchAgents/com.arctos.robot-controller.plist
```

**LaunchAgent Configuration:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.arctos.robot-controller</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/opt/arctos-robot-controller/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/opt/arctos-robot-controller</string>
    <key>StandardOutPath</key>
    <string>/var/log/arctos-robot-controller.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/arctos-robot-controller-error.log</string>
</dict>
</plist>
```

**Load and Start Service:**
```bash
# Load service
sudo launchctl load /Library/LaunchAgents/com.arctos.robot-controller.plist

# Start service
sudo launchctl start com.arctos.robot-controller

# Check status
sudo launchctl list | grep arctos
```

## 🧪 Testing Installation

### Automated Installation Verification

**Run Installation Tests:**
```bash
# Backend tests
npm test

# Frontend tests  
cd client && npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

**Manual Verification Checklist:**
- [ ] Application starts without errors
- [ ] Web interface loads at configured URL
- [ ] Admin account login works
- [ ] Robot communication status shows correctly
- [ ] Can create and save positions
- [ ] G-code upload and validation works
- [ ] System configuration can be modified and saved
- [ ] Database operations complete successfully
- [ ] Log files are being created and updated

### Performance Baseline Testing

**Load Testing:**
```bash
# Install load testing tool
npm install -g artillery

# Run performance tests
artillery run test/performance/load-test.yml

# Monitor system resources during test
htop  # Linux/Mac
resmon  # Windows
```

**Network Latency Testing:**
```bash
# Test robot controller communication latency
ping -c 100 robot-controller-ip

# Test WebSocket connection performance
node test/websocket-latency-test.js
```

## 📊 Monitoring and Logging

### Log Configuration

**Application Logging Setup:**
```json
{
  "logging": {
    "level": "info",
    "file": {
      "enabled": true,
      "path": "logs/",
      "maxSize": "10MB",
      "maxFiles": 10
    },
    "console": {
      "enabled": true,
      "colorize": true
    },
    "syslog": {
      "enabled": false,
      "host": "localhost",
      "port": 514
    }
  }
}
```

**Log Rotation Setup (Linux):**
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/arctos-robot-controller

/opt/arctos-robot-controller/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 arctos arctos
    postrotate
        systemctl reload arctos-robot-controller
    endscript
}
```

### System Monitoring

**Health Check Endpoint:**
- URL: `http://localhost:5000/api/health`
- Returns JSON with system status, uptime, and service health

**Monitoring Script:**
```bash
#!/bin/bash
# health-check.sh - Monitor system health

API_URL="http://localhost:5000/api/health"
LOG_FILE="/var/log/arctos-health-check.log"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_URL)
    
    if [ $STATUS -eq 200 ]; then
        echo "$TIMESTAMP - Health check: OK" >> $LOG_FILE
    else
        echo "$TIMESTAMP - Health check: FAILED (HTTP $STATUS)" >> $LOG_FILE
        # Send alert notification here
    fi
    
    sleep 60
done
```

**System Metrics Collection:**
```bash
# Install Node.js monitoring tools
npm install --save prom-client express-prom-bundle

# System will expose metrics at /metrics endpoint
# Compatible with Prometheus, Grafana, etc.
```

## 🔄 Backup and Recovery

### Automated Backup Setup

**Backup Script:**
```bash
#!/bin/bash
# backup-arctos.sh - Automated backup script

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/arctos"
SOURCE_DIR="/opt/arctos-robot-controller"

# Create backup directory
mkdir -p $BACKUP_DIR/$TIMESTAMP

# Backup configuration files
cp -r $SOURCE_DIR/config/ $BACKUP_DIR/$TIMESTAMP/

# Backup database
cp -r $SOURCE_DIR/data/ $BACKUP_DIR/$TIMESTAMP/

# Backup logs
cp -r $SOURCE_DIR/logs/ $BACKUP_DIR/$TIMESTAMP/

# Create compressed archive
cd $BACKUP_DIR
tar -czf arctos-backup-$TIMESTAMP.tar.gz $TIMESTAMP
rm -rf $TIMESTAMP

# Keep only last 7 days of backups
find $BACKUP_DIR -name "arctos-backup-*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/arctos-backup-$TIMESTAMP.tar.gz"
```

**Schedule with Cron (Linux):**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/scripts/backup-arctos.sh >> /var/log/backup.log 2>&1
```

**Schedule with Task Scheduler (Windows):**
1. Open Task Scheduler
2. Create Basic Task > Daily at 2:00 AM
3. Action: Start a program
4. Program: `powershell.exe`
5. Arguments: `-File C:\scripts\backup-arctos.ps1`

### Recovery Procedures

**Database Recovery:**
```bash
# Stop application
sudo systemctl stop arctos-robot-controller

# Backup current database (if corrupted)
cp data/positions.db data/positions.db.corrupted

# Restore from backup
tar -xzf /opt/backups/arctos/arctos-backup-YYYYMMDD_HHMMSS.tar.gz
cp arctos-backup-*/data/ /opt/arctos-robot-controller/data/

# Start application
sudo systemctl start arctos-robot-controller
```

**Configuration Recovery:**
```bash
# Restore configuration files
cp backup/config/robot-config.json /opt/arctos-robot-controller/config/

# Restart service to load new configuration
sudo systemctl restart arctos-robot-controller
```

## 🆙 Update and Maintenance

### Software Updates

**Update Process:**
```bash
# Backup current installation
./scripts/backup-arctos.sh

# Stop service
sudo systemctl stop arctos-robot-controller

# Update source code
cd /opt/arctos-robot-controller
git pull origin main

# Update dependencies
npm update
cd client && npm update && cd ..

# Rebuild frontend
npm run build

# Run database migrations if needed
npm run db:migrate

# Start service
sudo systemctl start arctos-robot-controller

# Verify update
curl http://localhost:5000/api/health
```

**Rollback Procedure:**
```bash
# Stop service
sudo systemctl stop arctos-robot-controller

# Restore from backup
cd /opt/backups/arctos
tar -xzf arctos-backup-YYYYMMDD_HHMMSS.tar.gz
cp -r arctos-backup-*/* /opt/arctos-robot-controller/

# Start service
sudo systemctl start arctos-robot-controller
```

### Maintenance Schedule

**Daily Tasks:**
- Check service status and logs
- Verify system health endpoint
- Monitor disk space usage
- Review error logs for issues

**Weekly Tasks:**
- Full system backup
- Database optimization (VACUUM, REINDEX)
- Log rotation and cleanup
- Security update check

**Monthly Tasks:**
- Performance analysis and optimization
- Capacity planning review
- Security audit and penetration testing
- Documentation updates

**Quarterly Tasks:**
- Disaster recovery testing
- Full system restore test
- Hardware maintenance and replacement
- Software licensing review

## 📞 Support and Troubleshooting

### Installation Issues

**Common Problems:**

**Node.js Version Conflicts:**
```bash
# Use Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

**Permission Errors:**
```bash
# Linux: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Port Already in Use:**
```bash
# Find process using port
lsof -ti:5000
netstat -ano | findstr :5000

# Kill process or change port in configuration
```

### Support Resources

**Documentation:**
- Installation Guide: This document
- User Guide: `docs/17-technical-writer/02-user-guide.md`
- API Reference: `docs/17-technical-writer/01-api-reference.md`
- Troubleshooting: `docs/17-technical-writer/04-troubleshooting-guide.md`

**Community Support:**
- Forum: forum.arctos-robotics.com
- Discord: discord.gg/arctos-robotics
- GitHub Issues: github.com/arctos-robotics/robot-controller/issues

**Professional Support:**
- Technical Support: support@arctos-robotics.com
- Installation Services: install@arctos-robotics.com
- Training: training@arctos-robotics.com
- Emergency: 1-800-ARCTOS-1 (24/7)

**Information to Provide When Requesting Support:**
- Operating system and version
- Node.js and npm versions
- Installation method used
- Complete error messages
- Installation logs
- Network configuration details
- Hardware specifications

---

*Installation & Setup Guide v1.0 - Updated January 21, 2025*  
*For latest updates: docs.arctos-robotics.com*