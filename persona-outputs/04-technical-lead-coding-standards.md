# Coding Standards and Development Guidelines

**Arctos Robot Controller - Technical Excellence Framework**

## Table of Contents

1. [General Principles](#general-principles)
2. [Code Structure and Organization](#code-structure-and-organization)
3. [JavaScript/Node.js Standards](#javascriptnodejs-standards)
4. [TypeScript/React Standards](#typescriptreact-standards)
5. [Testing Standards](#testing-standards)
6. [Documentation Requirements](#documentation-requirements)
7. [Git Workflow and Branching Strategy](#git-workflow-and-branching-strategy)
8. [Code Review Process](#code-review-process)
9. [Security Guidelines](#security-guidelines)
10. [Performance Standards](#performance-standards)

---

## General Principles

### SOLID Principles

All code must adhere to SOLID design principles:

- **Single Responsibility Principle (SRP):** Each class/function has one reason
  to change
- **Open-Closed Principle (OCP):** Open for extension, closed for modification
- **Liskov Substitution Principle (LSP):** Subtypes must be substitutable for
  base types
- **Interface Segregation Principle (ISP):** Clients shouldn't depend on unused
  interfaces
- **Dependency Inversion Principle (DIP):** Depend on abstractions, not
  concretions

### Clean Code Principles

- **Meaningful Names:** Use intention-revealing names
- **Small Functions:** Functions should do one thing well
- **DRY (Don't Repeat Yourself):** Avoid code duplication
- **YAGNI (You Aren't Gonna Need It):** Don't over-engineer
- **Boy Scout Rule:** Leave code cleaner than you found it

---

## Code Structure and Organization

### Directory Structure

```
arctos-robot-controller/
├── server.js                 # Application entry point (to be refactored)
├── config/                   # Configuration files
├── routes/                   # API route handlers (NEW)
│   ├── index.js             # Route aggregator
│   ├── auth.js              # Authentication routes
│   ├── robot.js             # Robot control routes
│   └── monitoring.js        # System monitoring routes
├── services/                 # Business logic layer (NEW)
│   ├── RobotService.js      # Robot operations
│   ├── GCodeService.js      # G-code processing
│   └── PositionService.js   # Position management
├── middleware/               # Express middleware (NEW)
│   ├── authentication.js   # Auth middleware
│   ├── validation.js        # Input validation
│   └── errorHandling.js     # Error handling
├── lib/                      # Core utilities and modules
├── models/                   # Data models (NEW)
├── controllers/              # Request handlers (NEW)
├── test/                     # Test files
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
└── client/                   # React frontend
```

### File Naming Conventions

- **JavaScript files:** `camelCase.js` (e.g., `robotService.js`)
- **Class files:** `PascalCase.js` (e.g., `RobotController.js`)
- **Test files:** `*.test.js` or `*.spec.js`
- **Configuration files:** `kebab-case.json` (e.g., `robot-config.json`)
- **Constants files:** `UPPER_SNAKE_CASE.js` (e.g., `API_CONSTANTS.js`)

### Module Organization

```javascript
// File structure template
// 1. External dependencies
const express = require('express');
const axios = require('axios');

// 2. Internal dependencies
const { logger } = require('../lib/logger');
const { validateInput } = require('../middleware/validation');

// 3. Constants
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRY_ATTEMPTS = 3;

// 4. Class/function definitions
class RobotService {
  // Implementation
}

// 5. Module exports
module.exports = { RobotService };
```

---

## JavaScript/Node.js Standards

### ESLint Configuration

```json
{
  "extends": ["eslint:recommended"],
  "env": {
    "node": true,
    "es2021": true
  },
  "rules": {
    "complexity": ["error", 10],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 4],
    "max-depth": ["error", 3],
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

### Code Style Guidelines

#### Variable Declarations

```javascript
// Good
const robotConfig = await loadRobotConfiguration();
let currentPosition = null;

// Bad
var config = await loadRobotConfiguration(); // Don't use var
let currentPosition; // Initialize variables
```

#### Function Definitions

```javascript
// Good - Pure function with single responsibility
const calculateDistance = (point1, point2) => {
  const deltaX = point2.x - point1.x;
  const deltaY = point2.y - point1.y;
  return Math.sqrt(deltaX ** 2 + deltaY ** 2);
};

// Good - Async function with proper error handling
const executeGCode = async (gcode, options = {}) => {
  try {
    validateGCode(gcode);
    const result = await robotController.execute(gcode, options);
    logger.info('G-code executed successfully', { result });
    return result;
  } catch (error) {
    logger.error('G-code execution failed', { error: error.message });
    throw new Error(`Failed to execute G-code: ${error.message}`);
  }
};

// Bad - Function doing too many things
const processRobotCommand = async command => {
  // Validation
  if (!command) throw new Error('Command required');

  // Parsing
  const parsed = parseCommand(command);

  // Execution
  const result = await executeCommand(parsed);

  // Logging
  console.log('Command executed');

  // Notification
  notifyClients(result);

  return result; // This function does too much
};
```

#### Error Handling

```javascript
// Good - Specific error types
class ValidationError extends Error {
  constructor(field, value) {
    super(`Invalid ${field}: ${value}`);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

// Good - Proper error propagation
const validateRobotPosition = position => {
  if (!position) {
    throw new ValidationError('position', 'undefined');
  }

  if (typeof position.x !== 'number') {
    throw new ValidationError('position.x', position.x);
  }

  // Continue validation...
};

// Good - Error handling in async functions
const moveRobotToPosition = async position => {
  try {
    validateRobotPosition(position);
    await robotController.moveTo(position);
    logger.info('Robot moved to position', { position });
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.warn('Invalid position provided', { error: error.message });
      throw error; // Re-throw validation errors
    }

    logger.error('Robot movement failed', { error: error.message });
    throw new Error(`Movement failed: ${error.message}`);
  }
};
```

#### Async/Await Guidelines

```javascript
// Good - Proper async/await usage
const initializeRobot = async () => {
  try {
    await robotController.connect();
    await robotController.calibrate();
    await robotController.home();

    logger.info('Robot initialized successfully');
    return true;
  } catch (error) {
    logger.error('Robot initialization failed', { error: error.message });
    return false;
  }
};

// Good - Parallel execution when possible
const getRobotStatus = async () => {
  const [position, temperature, batteryLevel] = await Promise.all([
    robotController.getCurrentPosition(),
    sensorManager.getTemperature(),
    powerManager.getBatteryLevel(),
  ]);

  return { position, temperature, batteryLevel };
};

// Bad - Sequential execution when parallel is possible
const getRobotStatusSlow = async () => {
  const position = await robotController.getCurrentPosition();
  const temperature = await sensorManager.getTemperature(); // Could be parallel
  const batteryLevel = await powerManager.getBatteryLevel(); // Could be parallel

  return { position, temperature, batteryLevel };
};
```

---

## TypeScript/React Standards

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Interface and Type Definitions

```typescript
// Good - Specific, well-documented interfaces
interface RobotPosition {
  /** X-axis position in millimeters */
  x: number;
  /** Y-axis position in millimeters */
  y: number;
  /** Z-axis position in millimeters */
  z: number;
  /** Rotation around X-axis in degrees */
  rotationX?: number;
  /** Rotation around Y-axis in degrees */
  rotationY?: number;
  /** Rotation around Z-axis in degrees */
  rotationZ?: number;
}

interface RobotConfig {
  readonly id: string;
  readonly type: 'cartesian' | 'delta' | 'scara';
  readonly axes: number;
  readonly workspaceSize: {
    width: number;
    height: number;
    depth: number;
  };
  readonly maxSpeed: number;
  readonly precision: number;
}

// Good - Union types for specific values
type RobotState = 'idle' | 'moving' | 'homing' | 'error' | 'calibrating';
type CommunicationProtocol = 'serial' | 'can' | 'ethernet' | 'modbus';

// Good - Generic types for reusability
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
```

### React Component Standards

```typescript
// Good - Functional component with proper typing
interface ManualControlProps {
  robotConfig: RobotConfig;
  currentPosition: RobotPosition;
  onPositionChange: (position: Partial<RobotPosition>) => void;
  disabled?: boolean;
}

const ManualControl: React.FC<ManualControlProps> = ({
  robotConfig,
  currentPosition,
  onPositionChange,
  disabled = false
}) => {
  // State with proper typing
  const [selectedAxis, setSelectedAxis] = useState<keyof RobotPosition>('x');
  const [inputValue, setInputValue] = useState<string>('');

  // Event handlers with proper typing
  const handleAxisChange = useCallback((axis: keyof RobotPosition) => {
    setSelectedAxis(axis);
    setInputValue(String(currentPosition[axis] || 0));
  }, [currentPosition]);

  const handleValueSubmit = useCallback(() => {
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue)) {
      // Handle error
      return;
    }

    onPositionChange({ [selectedAxis]: numValue });
  }, [selectedAxis, inputValue, onPositionChange]);

  return (
    <div className="manual-control">
      {/* Component JSX */}
    </div>
  );
};
```

### Custom Hooks

```typescript
// Good - Custom hook with proper typing and error handling
interface UseRobotPositionResult {
  position: RobotPosition | null;
  loading: boolean;
  error: string | null;
  updatePosition: (newPosition: Partial<RobotPosition>) => Promise<void>;
}

const useRobotPosition = (): UseRobotPositionResult => {
  const [position, setPosition] = useState<RobotPosition | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const updatePosition = useCallback(
    async (newPosition: Partial<RobotPosition>) => {
      try {
        setLoading(true);
        setError(null);

        const response = await robotApi.updatePosition(newPosition);
        if (response.success) {
          setPosition(response.data);
        } else {
          setError(response.error || 'Unknown error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // Initial position fetch
    updatePosition({});
  }, [updatePosition]);

  return { position, loading, error, updatePosition };
};
```

---

## Testing Standards

### Test Structure and Organization

```javascript
// test/unit/services/robotService.test.js
const { RobotService } = require('../../../services/RobotService');
const { ValidationError } = require('../../../lib/errors');

describe('RobotService', () => {
  let robotService;
  let mockController;

  beforeEach(() => {
    // Setup mocks and test data
    mockController = {
      connect: jest.fn(),
      moveTo: jest.fn(),
      getCurrentPosition: jest.fn(),
    };
    robotService = new RobotService(mockController);
  });

  describe('moveToPosition', () => {
    it('should move robot to valid position', async () => {
      // Arrange
      const validPosition = { x: 100, y: 200, z: 50 };
      mockController.moveTo.mockResolvedValue(true);

      // Act
      const result = await robotService.moveToPosition(validPosition);

      // Assert
      expect(result).toBe(true);
      expect(mockController.moveTo).toHaveBeenCalledWith(validPosition);
    });

    it('should throw ValidationError for invalid position', async () => {
      // Arrange
      const invalidPosition = { x: 'invalid', y: 200, z: 50 };

      // Act & Assert
      await expect(
        robotService.moveToPosition(invalidPosition)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle controller errors gracefully', async () => {
      // Arrange
      const validPosition = { x: 100, y: 200, z: 50 };
      mockController.moveTo.mockRejectedValue(new Error('Connection lost'));

      // Act & Assert
      await expect(robotService.moveToPosition(validPosition)).rejects.toThrow(
        'Movement failed: Connection lost'
      );
    });
  });
});
```

### Integration Test Example

```javascript
// test/integration/robot-api.integration.test.js
const request = require('supertest');
const app = require('../../server');
const { DatabaseManager } = require('../../lib/database');

describe('Robot API Integration Tests', () => {
  let server;
  let authToken;

  beforeAll(async () => {
    server = app.listen(0); // Random port

    // Setup test database
    await DatabaseManager.initialize();

    // Get authentication token
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'testpass' });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await server.close();
    await DatabaseManager.close();
  });

  describe('POST /api/robot/move', () => {
    it('should move robot to specified position', async () => {
      const response = await request(server)
        .post('/api/robot/move')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ x: 100, y: 200, z: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.position).toMatchObject({
        x: 100,
        y: 200,
        z: 50,
      });
    });
  });
});
```

### Test Coverage Requirements

- **Unit Tests:** Minimum 80% line coverage
- **Integration Tests:** All API endpoints covered
- **End-to-End Tests:** Critical user workflows covered
- **Performance Tests:** Load testing for concurrent users

---

## Documentation Requirements

### Code Documentation

```javascript
/**
 * Moves the robot to a specified position with optional speed control.
 *
 * @param {RobotPosition} position - Target position coordinates
 * @param {Object} [options] - Movement options
 * @param {number} [options.speed=1000] - Movement speed in mm/min
 * @param {boolean} [options.waitForCompletion=true] - Wait for movement completion
 * @returns {Promise<boolean>} Promise resolving to true if successful
 * @throws {ValidationError} When position parameters are invalid
 * @throws {RobotError} When robot is not ready or movement fails
 *
 * @example
 * // Move to home position
 * await robotService.moveToPosition({ x: 0, y: 0, z: 100 });
 *
 * // Fast movement without waiting
 * await robotService.moveToPosition(
 *   { x: 200, y: 150, z: 50 },
 *   { speed: 2000, waitForCompletion: false }
 * );
 */
const moveToPosition = async (position, options = {}) => {
  // Implementation
};
```

### README Template

````markdown
# Module Name

Brief description of the module's purpose and functionality.

## Installation

```bash
npm install module-name
```
````

## Usage

Basic usage examples with code snippets.

## API Reference

Detailed API documentation with parameters and return values.

## Configuration

Configuration options and examples.

## Testing

How to run tests and coverage requirements.

## Contributing

Guidelines for contributing to the module.

````

---

## Git Workflow and Branching Strategy

### Branch Naming Convention
```bash
# Feature branches
feature/ISSUE-123-add-new-robot-profile
feature/ISSUE-456-improve-gcode-validation

# Bug fix branches
bugfix/ISSUE-789-fix-position-calculation
bugfix/ISSUE-012-resolve-memory-leak

# Hotfix branches (for critical production issues)
hotfix/ISSUE-345-security-vulnerability

# Release branches
release/v2.1.0
release/v2.1.1
````

### Commit Message Standards

```bash
# Format: type(scope): subject

# Examples:
feat(robot): add support for SCARA robot configuration
fix(gcode): resolve parsing error with M-codes
docs(api): update authentication endpoint documentation
test(robot): add integration tests for position validation
refactor(server): extract routes from main server file
perf(gcode): optimize parser performance for large files
style(frontend): fix ESLint warnings in ManualControl component
```

### Pull Request Template

```markdown
## Description

Brief description of changes made.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings introduced
```

---

## Code Review Process

### Review Checklist

#### Functionality

- [ ] Does the code work as intended?
- [ ] Are edge cases handled appropriately?
- [ ] Is error handling comprehensive?
- [ ] Are performance implications considered?

#### Design

- [ ] Is the code well-structured?
- [ ] Does it follow SOLID principles?
- [ ] Is it maintainable and extensible?
- [ ] Are abstractions appropriate?

#### Code Quality

- [ ] Are naming conventions followed?
- [ ] Is complexity within acceptable limits?
- [ ] Is the code DRY (Don't Repeat Yourself)?
- [ ] Are magic numbers/strings avoided?

#### Testing

- [ ] Are tests comprehensive?
- [ ] Do tests cover edge cases?
- [ ] Are tests maintainable?
- [ ] Is test coverage adequate?

#### Documentation

- [ ] Are public APIs documented?
- [ ] Are complex algorithms explained?
- [ ] Is README updated if needed?
- [ ] Are breaking changes documented?

### Review Process

1. **Author Self-Review:** Complete checklist before requesting review
2. **Peer Review:** Assign appropriate reviewer(s)
3. **Review Response:** Address all feedback within 24 hours
4. **Re-review:** Request re-review after addressing feedback
5. **Approval:** Merge only after approval from required reviewers

---

## Security Guidelines

### Input Validation

```javascript
// Good - Comprehensive input validation
const validateRobotPosition = position => {
  const schema = {
    x: { type: 'number', min: -1000, max: 1000, required: true },
    y: { type: 'number', min: -1000, max: 1000, required: true },
    z: { type: 'number', min: 0, max: 500, required: true },
    speed: { type: 'number', min: 1, max: 5000, required: false },
  };

  return validate(position, schema);
};

// Use express-validator for API endpoints
const moveRobotValidation = [
  body('x')
    .isFloat({ min: -1000, max: 1000 })
    .withMessage('X position must be between -1000 and 1000'),
  body('y')
    .isFloat({ min: -1000, max: 1000 })
    .withMessage('Y position must be between -1000 and 1000'),
  body('z')
    .isFloat({ min: 0, max: 500 })
    .withMessage('Z position must be between 0 and 500'),
  body('speed')
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage('Speed must be between 1 and 5000'),
];
```

### Authentication and Authorization

```javascript
// Good - Comprehensive auth middleware
const authenticateAndAuthorize = (requiredRole = null) => {
  return async (req, res, next) => {
    try {
      // Extract and verify token
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await verifyToken(token);
      if (!user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Check role authorization
      if (requiredRole && !hasRole(user, requiredRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error('Authentication error', { error: error.message });
      res.status(401).json({ error: 'Authentication failed' });
    }
  };
};
```

### Data Sanitization

```javascript
// Good - Sanitize outputs
const sanitizeUserData = userData => {
  return {
    id: userData.id,
    username: userData.username,
    email: userData.email,
    role: userData.role,
    // Exclude sensitive fields like password, tokens, etc.
  };
};

// Good - Sanitize database queries
const findUserByUsername = async username => {
  // Use parameterized queries to prevent SQL injection
  const query = 'SELECT * FROM users WHERE username = ? AND active = 1';
  return await database.query(query, [username]);
};
```

---

## Performance Standards

### Response Time Requirements

- **API Endpoints:** < 200ms (95th percentile)
- **Real-time Updates:** < 50ms latency
- **File Uploads:** Progress feedback every 100ms
- **Database Queries:** < 100ms for simple queries

### Resource Usage Limits

- **Memory Usage:** < 500MB under normal load
- **CPU Usage:** < 80% under normal operation
- **Database Connections:** < 10 concurrent connections
- **File Descriptors:** Monitor and limit open files

### Optimization Guidelines

```javascript
// Good - Efficient database queries
const getRobotPositions = async (limit = 100, offset = 0) => {
  // Use pagination to limit memory usage
  const query = `
    SELECT position_data, timestamp 
    FROM robot_positions 
    ORDER BY timestamp DESC 
    LIMIT ? OFFSET ?
  `;
  return await database.query(query, [limit, offset]);
};

// Good - Caching expensive operations
const memoizedCalculation = memoize(
  complexData => performExpensiveCalculation(complexData),
  { maxAge: 60000 } // Cache for 1 minute
);

// Good - Stream processing for large data
const processLargeFile = (filePath, callback) => {
  const stream = fs.createReadStream(filePath);
  const lineProcessor = new LineProcessor();

  stream
    .pipe(lineProcessor)
    .on('data', callback)
    .on('error', error => logger.error('File processing error', { error }))
    .on('end', () => logger.info('File processing completed'));
};
```

---

## Conclusion

These coding standards and guidelines provide the foundation for maintaining
high code quality, consistency, and maintainability in the Arctos Robot
Controller project. All team members are expected to follow these standards and
contribute to their continuous improvement.

Regular reviews and updates of these guidelines ensure they remain relevant and
effective as the project evolves. Team members should feel empowered to suggest
improvements and discuss best practices during code reviews and team meetings.

Remember: **Quality is not an act, it is a habit. Excellence is achieved through
consistent application of these principles.**
