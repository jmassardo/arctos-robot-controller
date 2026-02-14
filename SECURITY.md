# Security and Authentication Documentation

## Overview

The Arctos Robot Controller has been enhanced with a comprehensive security
framework that includes JWT-based authentication, role-based access control
(RBAC), structured logging, input validation, rate limiting, and security
monitoring.

## Authentication System

### Features

- **JWT-based authentication** with access and refresh tokens
- **Role-based access control** (Admin, Operator, Viewer)
- **Account lockout protection** after failed login attempts
- **Session management** with token refresh capabilities
- **Password security** with bcrypt hashing and strength validation
- **User management** with full CRUD operations

### User Roles

#### Admin

- Full system access including user management
- Can view audit trails and security logs
- Can modify all robot configurations
- Can perform all robot operations

#### Operator

- Can control robot operations and movements
- Can modify robot configurations (excluding user management)
- Cannot access admin functions or user management

#### Viewer

- Read-only access to robot status and configurations
- Cannot control robot or modify configurations
- Cannot access administrative functions

### Authentication Flow

1. **User Registration**

   ```
   POST /auth/register
   {
     "username": "newuser",
     "password": "SecurePass123!",
     "email": "user@example.com",
     "role": "operator"
   }
   ```

2. **User Login**

   ```
   POST /auth/login
   {
     "username": "user",
     "password": "password"
   }

   Response:
   {
     "success": true,
     "accessToken": "jwt.token.here",
     "refreshToken": "refresh.token.here",
     "user": { "username": "user", "role": "operator" }
   }
   ```

3. **Token Refresh**

   ```
   POST /auth/refresh
   {
     "refreshToken": "refresh.token.here"
   }
   ```

4. **Logout**
   ```
   POST /auth/logout
   {
     "refreshToken": "refresh.token.here"
   }
   ```

### Default Admin Account

On first startup, the system creates a default admin user:

- **Username**: `admin`
- **Password**: `admin123!`
- **Role**: `admin`

**Important**: Change this password immediately in production!

## Security Features

### Input Validation

All API endpoints include comprehensive input validation:

- **Robot Configuration**: Validates robot type, communication protocols, axis
  limits
- **Position Data**: Validates position names, axis values, manipulator settings
- **G-Code**: Basic G-code syntax validation and safety checks
- **User Data**: Email format, password strength, username requirements

### Rate Limiting

Different endpoints have specific rate limits:

- **Authentication endpoints**: 5 requests per 15 minutes per IP
- **API endpoints**: 100 requests per 15 minutes per IP
- **Robot control endpoints**: 30 requests per minute per IP

### Security Headers

All responses include security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`
- `Content-Security-Policy: default-src 'self'`

### Threat Detection

The system automatically detects and blocks:

- **SQL injection attempts**
- **Cross-site scripting (XSS) attempts**
- **Command injection attempts**
- **Path traversal attempts**

### Account Lockout

- **5 failed login attempts** triggers account lockout
- **15-minute lockout period** before attempts reset
- **Progressive lockout** for repeated violations

## Logging System

### Structured Logging

All application events are logged in structured JSON format using Winston:

```javascript
{
  "timestamp": "2025-01-11T10:30:00.000Z",
  "level": "info",
  "message": "User login successful",
  "category": "audit",
  "username": "operator1",
  "ip": "192.168.1.100"
}
```

### Log Categories

- **Audit logs**: User authentication, configuration changes, critical
  operations
- **Security logs**: Failed logins, security violations, threat attempts
- **Performance logs**: API response times, system performance metrics
- **Robot logs**: Robot operations, movements, hardware communications
- **Hardware logs**: Serial/CAN/RS485 communications, device status

### Log Files

All logs are stored in the `/logs` directory:

- `combined.log`: All log entries
- `error.log`: Error-level logs only
- `audit.log`: Audit trail events
- `security.log`: Security-related events
- `performance.log`: Performance metrics
- `robot.log`: Robot operations

### Log Rotation

- **Maximum file size**: 50MB
- **Maximum files kept**: 5
- **Rotation pattern**: Daily rotation with date stamps

## API Security

### Protected Endpoints

All API endpoints require authentication:

```
Authorization: Bearer <access_token>
```

### Endpoint Access Control

| Endpoint              | Admin | Operator | Viewer |
| --------------------- | ----- | -------- | ------ |
| `GET /api/config`     | ✅    | ✅       | ✅     |
| `POST /api/config`    | ✅    | ✅       | ❌     |
| `POST /api/positions` | ✅    | ✅       | ❌     |
| `POST /api/robot/*`   | ✅    | ✅       | ❌     |
| `GET /api/users`      | ✅    | ❌       | ❌     |
| `POST /api/users`     | ✅    | ❌       | ❌     |
| `GET /api/audit/logs` | ✅    | ❌       | ❌     |

### Error Responses

Security violations return structured error responses:

```json
{
  "success": false,
  "error": "Insufficient permissions",
  "code": "ACCESS_DENIED",
  "timestamp": "2025-01-11T10:30:00.000Z"
}
```

## Frontend Security

### Route Protection

React routes are protected using the `ProtectedRoute` component:

```jsx
<ProtectedRoute requiredRoles={['admin', 'operator']}>
  <ManualControl />
</ProtectedRoute>
```

### Authentication Context

The `AuthContext` provides authentication state management:

```jsx
const { user, isAuthenticated, login, logout } = useAuth();
```

### Automatic Token Refresh

The frontend automatically refreshes tokens before expiration and handles
authentication errors gracefully.

## Deployment Security

### Environment Variables

Set these environment variables in production:

```bash
# JWT Secret (use a strong, random string)
JWT_SECRET=your-super-secure-jwt-secret-here

# Database encryption key
DB_ENCRYPTION_KEY=your-database-encryption-key

# Admin credentials (change defaults)
DEFAULT_ADMIN_USERNAME=your-admin-username
DEFAULT_ADMIN_PASSWORD=your-secure-admin-password

# Server configuration
NODE_ENV=production
PORT=3001
```

### HTTPS Configuration

Always use HTTPS in production. Configure your reverse proxy (nginx/Apache) with
SSL certificates.

### Firewall Rules

Recommended firewall configuration:

- Allow port 3001 (or your configured port) for application access
- Block direct access to log files and configuration directories
- Implement network segmentation for robot hardware connections

### Database Security

- User data stored in encrypted JSON files
- Configuration files protected with appropriate file permissions
- Regular backups of user data and configurations

## Monitoring and Alerts

### Security Monitoring

The system provides real-time monitoring for:

- Failed authentication attempts
- Rate limit violations
- Security threat attempts
- Unusual access patterns

### Audit Trail

Administrators can access comprehensive audit trails showing:

- User login/logout events
- Configuration changes
- Robot operations
- Security violations
- System errors

### Performance Monitoring

Track system performance with:

- API response times
- Request volume metrics
- Error rates
- System resource usage

## Troubleshooting

### Common Issues

1. **"Token expired" errors**
   - Solution: The frontend should automatically refresh tokens
   - Check browser console for authentication errors

2. **"Access denied" errors**
   - Solution: Verify user has appropriate role permissions
   - Check audit logs for access attempts

3. **Rate limiting errors**
   - Solution: Reduce request frequency
   - Check if multiple clients sharing same IP

4. **Account lockout**
   - Solution: Wait 15 minutes or contact administrator
   - Admin can unlock accounts in user management interface

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm start
```

### Log Analysis

Check specific log files for issues:

- Authentication problems: `logs/audit.log`
- Security violations: `logs/security.log`
- API errors: `logs/error.log`
- Performance issues: `logs/performance.log`

## Security Checklist

### Initial Setup

- [ ] Change default admin password
- [ ] Set strong JWT secret
- [ ] Configure HTTPS
- [ ] Set appropriate file permissions
- [ ] Configure firewall rules

### Regular Maintenance

- [ ] Review audit logs regularly
- [ ] Monitor security alerts
- [ ] Update user access permissions
- [ ] Rotate JWT secrets periodically
- [ ] Backup user data and configurations

### Incident Response

- [ ] Monitor failed login attempts
- [ ] Investigate security violations
- [ ] Review unusual access patterns
- [ ] Document security incidents
- [ ] Update security measures as needed

## Testing Security

### Authentication Testing

Run authentication tests:

```bash
node --test test/auth.test.js
```

### Security Middleware Testing

Run security tests:

```bash
node --test test/security.test.js
```

### API Integration Testing

Run full API security tests:

```bash
node --test test/api-secured.test.js
```

### Manual Security Testing

1. Test rate limiting by making rapid requests
2. Test invalid JWT tokens
3. Test role-based access restrictions
4. Test input validation with malicious payloads
5. Test account lockout with failed login attempts

## Support

For security-related issues:

1. Check the audit and security logs first
2. Review this documentation
3. Test with provided security test suite
4. Contact system administrator

Remember: Security is an ongoing process. Regularly review and update security
measures based on new threats and requirements.
