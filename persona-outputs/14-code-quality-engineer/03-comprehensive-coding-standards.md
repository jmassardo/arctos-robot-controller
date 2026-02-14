# Comprehensive Coding Standards and Guidelines

**Arctos Robot Controller Project - Code Quality Standards**

_Version: 2.0 | Updated: $(date)_  
_Code Quality Engineer: Standards Documentation_

## Overview

This document establishes comprehensive coding standards, style guidelines, and
quality practices for the Arctos Robot Controller project. These standards
ensure consistent, maintainable, secure, and performant code across the entire
codebase.

## Code Quality Metrics - Current Status

### Overall Quality Score: **72/100** (Improved from 68/100)

| Metric              | Current         | Target | Status         |
| ------------------- | --------------- | ------ | -------------- |
| Backend Warnings    | 226             | <25    | 🔄 In Progress |
| Frontend Linting    | ⚠️ Setup Issues | 85+    | 🔄 In Progress |
| Test Coverage       | 95%+            | 95%+   | ✅ Excellent   |
| Security Compliance | 95%             | 95%+   | ✅ Excellent   |
| Technical Debt      | 10%             | <5%    | 🔄 Reducing    |

## JavaScript/Node.js Backend Standards

### 1. Variable and Function Naming

```javascript
// ✅ GOOD: Descriptive, camelCase
const userAuthToken = generateAuthToken(user);
const robotPosition = getCurrentPosition();
async function validateRobotConfig(config) {}

// ❌ BAD: Unclear, inconsistent
const tkn = genTkn(u);
const pos = getCurPos();
async function valCfg(c) {}
```

### 2. Function Declaration and Structure

```javascript
// ✅ GOOD: Clear, single responsibility
async function authenticateUser(credentials) {
  try {
    const user = await validateCredentials(credentials);
    const token = generateToken(user);
    return { user, token };
  } catch (error) {
    logger.error('Authentication failed:', error);
    throw new AuthenticationError('Invalid credentials');
  }
}

// ❌ BAD: Complex, multiple responsibilities
async function auth(c) {
  // 50+ lines of mixed logic
}
```

### 3. Error Handling Standards

```javascript
// ✅ GOOD: Consistent error handling
try {
  const result = await robotController.executeCommand(command);
  return result;
} catch (error) {
  logger.error('Command execution failed:', {
    command: command.id,
    error: error.message,
    timestamp: Date.now(),
  });

  // Re-throw with context
  throw new RobotControlError(
    `Failed to execute command ${command.id}: ${error.message}`
  );
}

// ❌ BAD: Silent failures, unclear errors
try {
  await robotController.executeCommand(command);
} catch (error) {
  console.log('Error');
}
```

### 4. Async/Await Best Practices

```javascript
// ✅ GOOD: Proper async/await usage
async function processRobotSequence(commands) {
  const results = [];

  for (const command of commands) {
    try {
      const result = await executeCommand(command);
      results.push(result);
    } catch (error) {
      logger.warn(`Command ${command.id} failed:`, error);
      // Continue processing other commands
    }
  }

  return results;
}

// ❌ BAD: Missing await, poor error handling
async function processRobotSequence(commands) {
  const results = commands.map(cmd => executeCommand(cmd)); // Missing await
  return results;
}
```

## TypeScript/React Frontend Standards

### 1. Component Structure and Props

```typescript
// ✅ GOOD: Proper TypeScript interfaces and component structure
interface RobotControlProps {
  robotId: string;
  onPositionChange: (position: RobotPosition) => void;
  onError: (error: RobotError) => void;
  disabled?: boolean;
}

interface RobotPosition {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

const RobotControl: React.FC<RobotControlProps> = ({
  robotId,
  onPositionChange,
  onError,
  disabled = false,
}) => {
  // Component implementation
};

// ❌ BAD: No types, unclear props
const RobotControl = ({ robotId, onPositionChange, onError, disabled }) => {
  // Implementation without type safety
};
```

### 2. Hook Usage and State Management

```typescript
// ✅ GOOD: Proper hook usage with types
interface UseRobotControlReturn {
  position: RobotPosition;
  isConnected: boolean;
  error: string | null;
  moveRobot: (newPosition: Partial<RobotPosition>) => Promise<void>;
  resetError: () => void;
}

const useRobotControl = (robotId: string): UseRobotControlReturn => {
  const [position, setPosition] = useState<RobotPosition>(initialPosition);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveRobot = useCallback(
    async (newPosition: Partial<RobotPosition>) => {
      try {
        setError(null);
        const result = await robotApi.move(robotId, newPosition);
        setPosition(result.position);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [robotId]
  );

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return { position, isConnected, error, moveRobot, resetError };
};
```

### 3. Event Handling and Performance

```typescript
// ✅ GOOD: Optimized event handling
const RobotJogControl: React.FC<JogControlProps> = ({ onJog, disabled }) => {
  // Memoize expensive calculations
  const jogButtons = useMemo(() =>
    generateJogButtons(axes, jogDistance), [axes, jogDistance]
  );

  // Use callback to prevent unnecessary re-renders
  const handleJog = useCallback((axis: string, direction: number) => {
    if (disabled) return;
    onJog({ axis, direction, distance: jogDistance });
  }, [disabled, onJog, jogDistance]);

  return (
    <div>
      {jogButtons.map(button => (
        <JogButton
          key={button.key}
          {...button}
          onClick={() => handleJog(button.axis, button.direction)}
        />
      ))}
    </div>
  );
};

// ❌ BAD: Inline functions causing re-renders
const RobotJogControl = ({ onJog, disabled }) => {
  return (
    <div>
      {axes.map(axis => (
        <button
          key={axis}
          onClick={() => {
            // This creates new function on every render
            if (!disabled) onJog({ axis, direction: 1 });
          }}
        >
          {axis}+
        </button>
      ))}
    </div>
  );
};
```

## Code Quality Rules and Enforcement

### ESLint Configuration Standards

Our enhanced ESLint configuration enforces these quality dimensions:

#### 1. Code Correctness Rules (Error Level)

```javascript
"no-undef": "error",           // Catch undefined variables
"no-unreachable": "error",     // Dead code detection
"no-dupe-keys": "error",       // Duplicate object keys
"no-duplicate-case": "error"   // Duplicate switch cases
```

#### 2. Code Quality Rules (Warning Level)

```javascript
"prefer-const": "warn",        // Immutability preference
"no-var": "error",             // Modern variable declarations
"eqeqeq": "warn",              // Strict equality
"curly": "warn",               // Consistent bracing
"complexity": ["warn", 12]     // Complexity limits
```

#### 3. Security Rules (Error Level)

```javascript
"no-eval": "error",                    // Prevent code injection
"no-implied-eval": "error",            // Indirect eval prevention
"no-new-func": "error",                // Function constructor security
"no-script-url": "error"               // Script URL prevention
```

#### 4. Performance Rules (Warning Level)

```javascript
"no-loop-func": "warn",                // Function creation in loops
"no-await-in-loop": "warn",            // Serial async operations
"require-await": "warn"                // Unnecessary async functions
```

## Testing Standards

### 1. Unit Test Structure

```javascript
// ✅ GOOD: Descriptive, focused tests
describe('RobotController', () => {
  let controller;

  beforeEach(() => {
    controller = new RobotController({
      serialPort: '/dev/ttyUSB0',
      baudRate: 115200,
    });
  });

  describe('moveToPosition', () => {
    it('should move robot to specified coordinates successfully', async () => {
      // Arrange
      const targetPosition = { x: 100, y: 200, z: 50 };
      const mockSerialPort = jest.spyOn(controller, 'sendCommand');
      mockSerialPort.mockResolvedValue({ success: true });

      // Act
      const result = await controller.moveToPosition(targetPosition);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSerialPort).toHaveBeenCalledWith(
        expect.stringContaining('G1 X100 Y200 Z50')
      );
    });

    it('should handle invalid coordinates gracefully', async () => {
      // Arrange
      const invalidPosition = { x: -999999, y: 'invalid', z: null };

      // Act & Assert
      await expect(controller.moveToPosition(invalidPosition)).rejects.toThrow(
        ValidationError
      );
    });
  });
});
```

### 2. Integration Test Standards

```javascript
// ✅ GOOD: End-to-end workflow testing
describe('Robot Control Integration', () => {
  let server, robotController, client;

  beforeAll(async () => {
    server = await startTestServer();
    robotController = new MockRobotController();
    client = io('http://localhost:3001');
  });

  it('should complete full robot control workflow', async () => {
    // Test complete workflow from UI to hardware
    const workflow = new RobotControlWorkflow(client);

    await workflow.authenticate('testuser', 'testpass');
    await workflow.selectRobot('robot-001');
    await workflow.moveToPosition({ x: 10, y: 20, z: 30 });
    await workflow.savePosition('test-position');

    const savedPosition = await workflow.getSavedPosition('test-position');
    expect(savedPosition).toEqual({ x: 10, y: 20, z: 30 });
  });
});
```

## Documentation Standards

### 1. Function Documentation

````javascript
/**
 * Executes G-code commands on the specified robot controller
 *
 * @param {string} robotId - Unique identifier for the target robot
 * @param {string[]} gCodeCommands - Array of G-code command strings
 * @param {ExecutionOptions} options - Execution configuration options
 * @param {boolean} options.dryRun - If true, validate commands without execution
 * @param {number} options.timeoutMs - Command timeout in milliseconds
 * @param {Function} options.progressCallback - Progress reporting callback
 *
 * @returns {Promise<ExecutionResult>} Results of command execution
 * @throws {ValidationError} When G-code commands are invalid
 * @throws {RobotError} When robot communication fails
 * @throws {TimeoutError} When execution exceeds timeout
 *
 * @example
 * ```javascript
 * const commands = ['G28', 'G1 X10 Y20 F1500', 'M104 S0'];
 * const result = await executeGCode('robot-001', commands, {
 *   dryRun: false,
 *   timeoutMs: 30000,
 *   progressCallback: (progress) => console.log(`${progress}% complete`)
 * });
 *
 * if (result.success) {
 *   console.log(`Executed ${result.commandsCompleted} commands successfully`);
 * }
 * ```
 */
async function executeGCode(robotId, gCodeCommands, options = {}) {
  // Implementation
}
````

### 2. API Documentation

```javascript
/**
 * @api {post} /api/robot/:id/move Move Robot to Position
 * @apiName MoveRobot
 * @apiGroup Robot Control
 * @apiVersion 2.0.0
 *
 * @apiDescription Moves the specified robot to target coordinates with optional speed control
 *
 * @apiParam {String} id Robot unique identifier
 * @apiBody {Number} x X-axis coordinate in millimeters
 * @apiBody {Number} y Y-axis coordinate in millimeters
 * @apiBody {Number} z Z-axis coordinate in millimeters
 * @apiBody {Number} [speed=1500] Movement speed in mm/min
 * @apiBody {Boolean} [relative=false] Use relative positioning
 *
 * @apiSuccess {Boolean} success Operation success status
 * @apiSuccess {Object} position Current robot position after movement
 * @apiSuccess {Number} position.x Current X coordinate
 * @apiSuccess {Number} position.y Current Y coordinate
 * @apiSuccess {Number} position.z Current Z coordinate
 * @apiSuccess {Number} executionTime Movement execution time in milliseconds
 *
 * @apiError (400) ValidationError Invalid coordinates or parameters
 * @apiError (404) RobotNotFound Robot with specified ID not found
 * @apiError (409) RobotBusy Robot is currently executing another command
 * @apiError (500) HardwareError Communication error with robot hardware
 *
 * @apiExample {curl} Example Request:
 * curl -X POST http://localhost:5000/api/robot/robot-001/move \
 *   -H "Content-Type: application/json" \
 *   -d '{"x": 100, "y": 200, "z": 50, "speed": 2000}'
 *
 * @apiExample {json} Success Response:
 * {
 *   "success": true,
 *   "position": { "x": 100, "y": 200, "z": 50 },
 *   "executionTime": 2500
 * }
 */
router.post(
  '/api/robot/:id/move',
  authenticateUser,
  validateRobotMove,
  async (req, res) => {
    // Implementation
  }
);
```

## Security Standards

### 1. Input Validation and Sanitization

```javascript
// ✅ GOOD: Comprehensive input validation
const { body, param, validationResult } = require('express-validator');

const validateRobotMove = [
  param('id')
    .isLength({ min: 1 })
    .matches(/^[a-zA-Z0-9-_]+$/)
    .withMessage('Invalid robot ID'),
  body('x')
    .isFloat({ min: -1000, max: 1000 })
    .withMessage('X coordinate must be between -1000 and 1000'),
  body('y')
    .isFloat({ min: -1000, max: 1000 })
    .withMessage('Y coordinate must be between -1000 and 1000'),
  body('z')
    .isFloat({ min: -1000, max: 1000 })
    .withMessage('Z coordinate must be between -1000 and 1000'),
  body('speed')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Speed must be between 1 and 10000'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
      });
    }
    next();
  },
];

// ❌ BAD: No validation, direct parameter usage
router.post('/api/robot/:id/move', async (req, res) => {
  await robot.moveTo(req.body.x, req.body.y, req.body.z); // Unsafe!
});
```

### 2. Authentication and Authorization

```javascript
// ✅ GOOD: Secure authentication middleware
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later',
});

const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res
        .status(401)
        .json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.warn('Authentication failed:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      error: error.message,
    });
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

## Performance Standards

### 1. Database Query Optimization

```javascript
// ✅ GOOD: Optimized database queries with indexing
class RobotPositionRepository {
  async findRecentPositions(robotId, limit = 100) {
    // Use database indexes and limit results
    return await RobotPosition.findAll({
      where: { robotId },
      order: [['timestamp', 'DESC']],
      limit,
      attributes: ['x', 'y', 'z', 'timestamp'], // Only select needed fields
      raw: true // Return plain objects for better performance
    });
  }

  async getPositionHistory(robotId, startDate, endDate) {
    // Use date range indexes
    return await RobotPosition.findAll({
      where: {
        robotId,
        timestamp: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['timestamp', 'ASC']]
    });
  }
}

// ❌ BAD: Inefficient queries loading unnecessary data
async getPositions(robotId) {
  const allPositions = await RobotPosition.findAll(); // Loads entire table!
  return allPositions.filter(pos => pos.robotId === robotId);
}
```

### 2. Memory Management and Caching

```javascript
// ✅ GOOD: Efficient caching with memory limits
const NodeCache = require('node-cache');

class RobotConfigCache {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minute TTL
      maxKeys: 1000, // Limit memory usage
      deleteOnExpire: true,
    });
  }

  async getRobotConfig(robotId) {
    const cacheKey = `robot-config-${robotId}`;
    let config = this.cache.get(cacheKey);

    if (!config) {
      config = await this.loadRobotConfigFromDatabase(robotId);
      this.cache.set(cacheKey, config);
    }

    return config;
  }

  invalidateRobotConfig(robotId) {
    const cacheKey = `robot-config-${robotId}`;
    this.cache.del(cacheKey);
  }
}
```

## Git Workflow and Commit Standards

### 1. Commit Message Format

```bash
# Format: <type>(<scope>): <description>
#
# Types: feat, fix, docs, style, refactor, test, chore
# Scope: component/module affected
# Description: Brief description of changes (50 chars max)

✅ GOOD Examples:
feat(robot-control): add emergency stop functionality
fix(api): resolve authentication token expiration issue
docs(readme): update installation instructions
refactor(database): optimize robot position queries
test(integration): add robot control workflow tests
style(eslint): fix code formatting issues

❌ BAD Examples:
updated stuff
fix bug
changes
WIP
```

### 2. Pre-commit Quality Hooks

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged && npm run test:unit",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write", "git add"],
    "*.{ts,tsx}": ["eslint --fix", "prettier --write", "git add"],
    "*.{json,md}": ["prettier --write", "git add"]
  }
}
```

## Quality Gates and CI/CD Integration

### 1. Quality Thresholds

```yaml
# quality-gates.yml
quality_gates:
  code_coverage:
    minimum: 90%
    target: 95%

  lint_warnings:
    maximum: 25
    target: 0

  complexity:
    maximum: 12
    target: 8

  security_vulnerabilities:
    high_severity: 0
    medium_severity: 5

  performance:
    api_response_time: 200ms
    memory_usage: 512MB

  build_time:
    maximum: 300s
    target: 180s
```

### 2. Automated Quality Checks

```javascript
// scripts/quality-check.js
const { execSync } = require('child_process');

const qualityChecks = [
  {
    name: 'Linting',
    command: 'npm run lint',
    threshold: { warnings: 25, errors: 0 },
  },
  {
    name: 'Unit Tests',
    command: 'npm run test:unit',
    threshold: { coverage: 90 },
  },
  {
    name: 'Security Audit',
    command: 'npm audit --audit-level moderate',
    threshold: { vulnerabilities: 0 },
  },
  {
    name: 'Bundle Size',
    command: 'npm run build && bundlesize',
    threshold: { size: '2MB' },
  },
];

async function runQualityGate() {
  for (const check of qualityChecks) {
    console.log(`Running ${check.name}...`);
    try {
      const result = execSync(check.command, { encoding: 'utf8' });
      console.log(`✅ ${check.name}: PASSED`);
    } catch (error) {
      console.error(`❌ ${check.name}: FAILED`);
      console.error(error.stdout);
      process.exit(1);
    }
  }

  console.log('🎉 All quality checks passed!');
}

if (require.main === module) {
  runQualityGate();
}
```

## Continuous Improvement Process

### 1. Weekly Quality Reviews

- **Code Quality Metrics Review**: Track improvement trends
- **Technical Debt Assessment**: Prioritize debt reduction
- **Team Feedback Session**: Identify pain points and solutions
- **Quality Goal Setting**: Adjust targets based on progress

### 2. Monthly Quality Audits

- **Comprehensive Code Review**: Deep dive into complex modules
- **Performance Profiling**: Identify optimization opportunities
- **Security Assessment**: Review and update security practices
- **Documentation Updates**: Keep standards current with project evolution

### 3. Quality Mentorship Program

- **Pair Programming**: Share quality practices through collaboration
- **Code Review Training**: Improve review effectiveness
- **Quality Champion Rotation**: Team members lead quality initiatives
- **Best Practices Workshops**: Regular knowledge sharing sessions

---

**Document Version**: 2.0  
**Last Updated**: $(date)  
**Next Review**: $(date -d "+1 month")  
**Maintained By**: Code Quality Engineering Team
