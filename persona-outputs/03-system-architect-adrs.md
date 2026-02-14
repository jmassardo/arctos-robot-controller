# Architecture Decision Records (ADRs)

**Arctos Robot Controller - Architectural Decision Documentation**

_Template and Implementation Guide for System Architecture Decisions_

---

## ADR Template

```markdown
# ADR-###: [Decision Title]

**Status**: [Proposed | Accepted | Deprecated | Superseded] **Date**: YYYY-MM-DD
**Deciders**: [List of decision makers] **Technical Story**: [Brief description
or ticket reference]

## Context

[Describe the situation and the forces at play, including architectural
constraints, business requirements, and technical considerations]

## Decision

[State the architectural decision clearly and concisely]

## Rationale

[Explain why this decision was made, including alternatives considered]

## Consequences

### Positive

- [List benefits and positive outcomes]

### Negative

- [List drawbacks and risks]

### Neutral

- [List neutral consequences that don't clearly fit above]

## Implementation

[Describe how the decision will be implemented, including specific steps,
timeline, and responsibilities]

## Compliance

[How will adherence to this decision be monitored and enforced?]
```

---

## Implemented ADRs for Arctos Robot Controller

### ADR-001: Migrate from Monolithic to Microservices Architecture

**Status**: Proposed  
**Date**: 2025-01-27  
**Deciders**: System Architect, Development Team  
**Technical Story**: Address maintainability issues with 3,625-line server.js
file

#### Context

The current Arctos Robot Controller implements all functionality in a single
Express.js server file containing 3,625 lines of code. This monolithic structure
includes:

- Authentication and user management (200+ lines)
- Robot control and hardware integration (500+ lines)
- G-code processing and execution (300+ lines)
- Configuration management (200+ lines)
- Real-time WebSocket communication (150+ lines)
- Database operations (scattered throughout)

**Forces at Play**:

- Development team struggles with merge conflicts
- Testing individual components is complex
- New feature development is slowing down
- Risk of breaking changes across unrelated functionality
- Need for independent scaling of different system components

#### Decision

Transform the monolithic architecture to a microservices-based architecture with
the following service boundaries:

1. **Authentication Service** - User management, JWT tokens, 2FA
2. **Robot Control Service** - Hardware communication, position management
3. **G-code Processing Service** - G-code parsing, validation, execution
4. **Configuration Service** - Robot profiles, system settings
5. **Monitoring Service** - System health, performance metrics
6. **API Gateway** - Request routing, rate limiting, authentication

#### Rationale

**Alternatives Considered**:

1. **Keep Monolith + Modular Refactoring**: Insufficient for current complexity
2. **Function-based Serverless**: Poor fit for real-time hardware control
3. **Service-Oriented Architecture**: Similar benefits but heavier
   infrastructure
4. **Microservices Architecture**: ✅ **Selected** - Best fit for team structure
   and system requirements

**Why Microservices**:

- Independent development and deployment cycles
- Technology diversity (different services can use optimal tech stacks)
- Fault isolation (failure in one service doesn't bring down entire system)
- Independent scaling based on load patterns
- Clear service boundaries align with team responsibilities

#### Consequences

##### Positive

- ✅ **Improved Maintainability**: Each service <500 lines of code
- ✅ **Parallel Development**: Teams can work independently on different
  services
- ✅ **Independent Scaling**: Scale robot control separately from authentication
- ✅ **Technology Flexibility**: Use optimal tech stack per service
- ✅ **Fault Isolation**: Hardware failures don't affect user authentication
- ✅ **Testing Simplification**: Unit testing becomes more focused

##### Negative

- ❌ **Operational Complexity**: More services to deploy and monitor
- ❌ **Network Latency**: Inter-service communication overhead
- ❌ **Data Consistency**: Distributed transactions complexity
- ❌ **Debugging Challenges**: Distributed system debugging is harder
- ❌ **Initial Development Cost**: Significant refactoring effort required

##### Neutral

- 📊 **Service Discovery**: Need to implement service discovery mechanism
- 📊 **Configuration Management**: Distributed configuration challenges
- 📊 **Monitoring**: Need distributed tracing and monitoring
- 📊 **Security**: Service-to-service authentication requirements

#### Implementation

**Phase 1: Foundation (Weeks 1-4)**

```typescript
// Week 1: Extract authentication service
mkdir services/authentication
mv auth-related-code → services/authentication/

// Week 2: Create service interfaces
interface AuthService {
  authenticate(credentials: Credentials): Promise<AuthResult>;
  validateToken(token: string): Promise<ValidationResult>;
}

// Week 3: Implement service communication
class ServiceCommunicator {
  async callService(service: string, endpoint: string, data: any): Promise<any>;
}

// Week 4: Add health checks and monitoring
app.get('/health', () => ({ status: 'healthy', service: 'auth' }));
```

**Phase 2: Service Extraction (Weeks 5-12)**

```bash
# Extract services one by one:
Week 5-6: Authentication Service
Week 7-8: Robot Control Service
Week 9-10: G-code Processing Service
Week 11-12: Configuration Service
```

**Phase 3: Production Deployment (Weeks 13-16)**

```yaml
# Docker Compose for microservices
version: '3.8'
services:
  api-gateway:
    build: ./gateway
    ports: ['3000:3000']
  auth-service:
    build: ./services/authentication
    ports: ['3001:3001']
  robot-service:
    build: ./services/robot-control
    ports: ['3002:3002']
```

**Migration Strategy**:

1. **Strangler Fig Pattern**: Gradually route requests to new services
2. **Database per Service**: Each service owns its data
3. **Event-Driven Communication**: Use message bus for loose coupling
4. **Circuit Breakers**: Implement resilience patterns

#### Compliance

**Monitoring Adherence**:

- 📊 **Service Size Limit**: No service >500 lines of code
- 📊 **API Documentation**: Every service must have OpenAPI spec
- 📊 **Health Endpoints**: All services must expose `/health`
- 📊 **Independent Deployment**: Services must be deployable independently
- 📊 **Database Independence**: No shared databases between services

**Review Process**:

- Monthly architecture review meetings
- Code review requirements for service boundaries
- Performance monitoring for service communication
- Regular assessment of service granularity

---

### ADR-002: Implement Hardware Abstraction Layer

**Status**: Proposed  
**Date**: 2025-01-27  
**Deciders**: System Architect, Hardware Team  
**Technical Story**: Eliminate tight coupling between business logic and
hardware drivers

#### Context

Currently, the robot control logic directly calls hardware-specific APIs:

```javascript
// Problematic tight coupling
if (mks42d && robotConfig.mks42d.enabled) {
  await mks42d.moveAbsolute(controllerId, axisNumber, value, 1000);
  // Business logic mixed with hardware specifics
}
```

**Issues with Current Approach**:

- Difficult to test without physical hardware
- Cannot easily support multiple robot types
- Business logic is polluted with hardware-specific code
- Adding new hardware requires modifying core logic

#### Decision

Implement a Hardware Abstraction Layer (HAL) with the following design:

```typescript
interface RobotController {
  initialize(): Promise<InitResult>;
  connect(): Promise<ConnectionResult>;
  moveAbsolute(axis: Axis, position: number): Promise<MoveResult>;
  moveRelative(axis: Axis, distance: number): Promise<MoveResult>;
  getCurrentPosition(): Promise<Position>;
  executeGCode(command: string): Promise<ExecutionResult>;
  emergencyStop(): Promise<void>;
  getStatus(): Promise<ControllerStatus>;
  disconnect(): Promise<void>;
}
```

#### Rationale

**Alternatives Considered**:

1. **Keep Direct Hardware Integration**: Maintains current tight coupling issues
2. **Plugin Architecture**: More complex than needed for current requirements
3. **Hardware Abstraction Layer**: ✅ **Selected** - Clean separation with
   flexibility
4. **Full Hardware Virtualization**: Overkill for current robot types

**Benefits of HAL Approach**:

- Clean separation between business logic and hardware specifics
- Testable with mock implementations
- Support for multiple robot manufacturers
- Easier integration of new hardware types
- Hardware-agnostic business logic

#### Consequences

##### Positive

- ✅ **Testability**: Mock hardware implementations for testing
- ✅ **Flexibility**: Support multiple robot types simultaneously
- ✅ **Maintainability**: Business logic isolated from hardware changes
- ✅ **Development Speed**: Faster development with hardware simulation
- ✅ **Quality**: Better error handling and status reporting

##### Negative

- ❌ **Performance Overhead**: Additional abstraction layer
- ❌ **Initial Complexity**: More code to implement and maintain
- ❌ **Learning Curve**: Team needs to understand abstraction patterns

##### Neutral

- 📊 **Hardware Discovery**: Need automatic hardware detection
- 📊 **Configuration Complexity**: Hardware-specific configuration management
- 📊 **Driver Management**: Need plugin system for hardware drivers

#### Implementation

```typescript
// Core abstraction interfaces
interface RobotController {
  readonly id: string;
  readonly type: ControllerType;
  readonly capabilities: ControllerCapabilities;

  initialize(config: HardwareConfig): Promise<InitResult>;
  execute(command: RobotCommand): Promise<CommandResult>;
  getState(): Promise<ControllerState>;
}

// Factory for creating controllers
class ControllerFactory {
  static create(type: ControllerType, config: HardwareConfig): RobotController {
    switch (type) {
      case 'MKS42D':
        return new MKS42DController(config);
      case 'MKS57D':
        return new MKS57DController(config);
      case 'Generic':
        return new GenericController(config);
      case 'Mock':
        return new MockController(config);
      default:
        throw new UnsupportedControllerError(type);
    }
  }
}

// High-level robot service
class RobotControlService {
  constructor(
    private controllerFactory: ControllerFactory,
    private configService: ConfigurationService
  ) {}

  async moveRobot(moveCommand: MoveCommand): Promise<MoveResult> {
    const controller = this.getControllerForAxis(moveCommand.axis);
    return controller.execute(moveCommand);
  }
}
```

**Implementation Timeline**:

- Week 1: Define HAL interfaces and contracts
- Week 2: Implement mock controller for testing
- Week 3: Refactor MKS42D to use HAL interface
- Week 4: Refactor MKS57D to use HAL interface
- Week 5: Update business logic to use HAL
- Week 6: Testing and validation

#### Compliance

**Interface Compliance**:

- All hardware controllers must implement `RobotController` interface
- No direct hardware API calls outside of HAL implementations
- All hardware operations must return standardized result types
- Mock implementations required for all production controllers

---

### ADR-003: Standardize on PostgreSQL for Data Persistence

**Status**: Proposed  
**Date**: 2025-01-27  
**Deciders**: System Architect, Database Team  
**Technical Story**: Eliminate mixed storage approach (SQLite + JSON files)

#### Context

Current data storage approach is inconsistent:

- **User Data**: SQLite database (when enabled) or JSON files
- **Configuration**: JSON files only
- **Robot Positions**: JSON files only
- **Session Data**: JSON files only
- **Logs**: File system

**Problems with Mixed Approach**:

- Data consistency issues across storage types
- No ACID transactions across different data types
- Complex backup and recovery procedures
- Difficult to implement advanced querying
- No referential integrity between related data

#### Decision

Migrate all data persistence to PostgreSQL with the following schema design:

```sql
-- Core data tables
CREATE SCHEMA arctos;

-- Users and authentication
CREATE TABLE arctos.users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Robot configurations
CREATE TABLE arctos.robot_configurations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  robot_type VARCHAR(50) NOT NULL,
  configuration JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by INTEGER REFERENCES arctos.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Robot positions
CREATE TABLE arctos.robot_positions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  position_data JSONB NOT NULL,
  group_id INTEGER REFERENCES arctos.position_groups(id),
  created_by INTEGER REFERENCES arctos.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Rationale

**Alternatives Considered**:

1. **Keep SQLite + JSON**: Maintains current inconsistency issues
2. **MongoDB**: NoSQL approach, but loses ACID guarantees
3. **MySQL**: Good option, but PostgreSQL has better JSON support
4. **PostgreSQL**: ✅ **Selected** - Best combination of ACID + JSON +
   scalability

**Why PostgreSQL**:

- ACID transactions across all data types
- Excellent JSON/JSONB support for flexible configuration storage
- Full-text search capabilities for G-code and logs
- Robust backup and point-in-time recovery
- Horizontal scaling options (read replicas, partitioning)
- Strong ecosystem and tooling

#### Consequences

##### Positive

- ✅ **Data Consistency**: ACID transactions across all operations
- ✅ **Query Power**: Complex queries across related data
- ✅ **Backup Simplicity**: Single database backup strategy
- ✅ **Referential Integrity**: Foreign key constraints ensure data validity
- ✅ **Performance**: Query optimization and indexing
- ✅ **Scalability**: Read replicas and connection pooling

##### Negative

- ❌ **Infrastructure Complexity**: Need to manage PostgreSQL instance
- ❌ **Migration Effort**: Significant data migration required
- ❌ **Resource Usage**: Higher memory footprint than SQLite
- ❌ **Operational Overhead**: Database maintenance and monitoring

##### Neutral

- 📊 **Connection Management**: Need connection pooling for scalability
- 📊 **Schema Migrations**: Need database migration system
- 📊 **Monitoring**: Database performance monitoring required

#### Implementation

**Migration Strategy**:

```typescript
// Phase 1: Parallel Write Strategy
class DataMigrationService {
  async writeUser(userData: UserData): Promise<void> {
    // Write to both old (JSON) and new (PostgreSQL) systems
    await this.writeToJsonFile(userData);
    await this.writeToPostgreSQL(userData);
  }

  async readUser(userId: string): Promise<UserData> {
    // Read from PostgreSQL first, fallback to JSON
    try {
      return await this.readFromPostgreSQL(userId);
    } catch (error) {
      return await this.readFromJsonFile(userId);
    }
  }
}

// Phase 2: Data Migration Scripts
class DatabaseMigrator {
  async migrateUsers(): Promise<void> {
    const jsonUsers = await this.loadUsersFromJson();
    for (const user of jsonUsers) {
      await this.insertUserToPostgreSQL(user);
    }
  }

  async migrateConfigurations(): Promise<void> {
    const jsonConfig = await this.loadConfigFromJson();
    await this.insertConfigToPostgreSQL(jsonConfig);
  }
}
```

**Implementation Timeline**:

- Week 1: Set up PostgreSQL infrastructure and schema
- Week 2: Implement parallel write strategy
- Week 3: Create and test data migration scripts
- Week 4: Execute migration and validate data integrity
- Week 5: Switch to PostgreSQL-only reads
- Week 6: Remove JSON file dependencies

**Schema Evolution**:

```sql
-- Migration versioning
CREATE TABLE arctos.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example migration
INSERT INTO arctos.schema_migrations (version) VALUES ('001_initial_schema');
```

#### Compliance

**Data Consistency Rules**:

- All writes must use database transactions
- No direct file system operations for persistent data
- All foreign key relationships must be enforced
- Database migrations must be versioned and reversible

**Performance Requirements**:

- Query response time <50ms for 95% of operations
- Database connection pool properly configured
- Proper indexing for all frequent queries
- Regular query performance analysis

---

### ADR-004: Event-Driven Architecture for Service Communication

**Status**: Proposed  
**Date**: 2025-01-27  
**Deciders**: System Architect, Development Team  
**Technical Story**: Implement loose coupling between microservices

#### Context

With the migration to microservices architecture (ADR-001), services need to
communicate efficiently while maintaining loose coupling. Current synchronous
HTTP-based communication creates tight coupling and availability dependencies.

**Requirements**:

- Real-time updates across services (robot position changes, status updates)
- Resilience to service failures
- Support for multiple subscribers to events
- Order preservation for critical events
- Event replay capability for debugging

#### Decision

Implement event-driven architecture using Redis Streams as the message broker:

```typescript
interface Event {
  id: string;
  type: string;
  timestamp: Date;
  source: string;
  data: any;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    version?: string;
  };
}

class EventBus {
  async publish(event: Event): Promise<void>;
  async subscribe(eventType: string, handler: EventHandler): Promise<void>;
  async unsubscribe(eventType: string, handler: EventHandler): Promise<void>;
}
```

**Event Categories**:

- **Robot Events**: position changes, status updates, errors
- **User Events**: login, logout, configuration changes
- **System Events**: service startup, health changes, alerts
- **G-code Events**: execution start/stop, progress updates

#### Rationale

**Alternatives Considered**:

1. **Direct HTTP Calls**: Simple but creates tight coupling
2. **RabbitMQ**: Full-featured but complex setup
3. **Apache Kafka**: Overkill for current scale
4. **Redis Streams**: ✅ **Selected** - Good balance of features and simplicity
5. **Socket.IO Events**: Already used for client communication, could extend

**Why Redis Streams**:

- Persistent event log with replay capability
- Consumer groups for load balancing
- Excellent performance characteristics
- Simple setup and operation
- Built-in clustering support
- Low operational overhead

#### Implementation

```typescript
// Event definitions
const RobotEvents = {
  POSITION_CHANGED: 'robot.position.changed',
  STATUS_UPDATED: 'robot.status.updated',
  ERROR_OCCURRED: 'robot.error.occurred',
  EMERGENCY_STOP: 'robot.emergency.stop',
};

const UserEvents = {
  USER_LOGGED_IN: 'user.logged.in',
  CONFIG_UPDATED: 'user.config.updated',
  POSITION_SAVED: 'user.position.saved',
};

// Event Bus Implementation
class RedisEventBus implements EventBus {
  constructor(private redis: Redis) {}

  async publish(streamName: string, event: Event): Promise<void> {
    await this.redis.xadd(
      streamName,
      '*',
      'type',
      event.type,
      'data',
      JSON.stringify(event.data),
      'timestamp',
      event.timestamp.toISOString(),
      'source',
      event.source
    );
  }

  async subscribe(
    streamName: string,
    consumerGroup: string,
    handler: EventHandler
  ): Promise<void> {
    const consumer = `consumer-${Date.now()}`;

    // Create consumer group if it doesn't exist
    try {
      await this.redis.xgroup(
        'CREATE',
        streamName,
        consumerGroup,
        '$',
        'MKSTREAM'
      );
    } catch (error) {
      // Group already exists
    }

    // Start consuming messages
    this.consumeMessages(streamName, consumerGroup, consumer, handler);
  }
}

// Service integration example
class RobotControlService {
  constructor(private eventBus: EventBus) {}

  async moveRobot(command: MoveCommand): Promise<void> {
    // Execute move
    const result = await this.hardware.move(command);

    // Publish event
    await this.eventBus.publish('robot-events', {
      id: uuid(),
      type: RobotEvents.POSITION_CHANGED,
      timestamp: new Date(),
      source: 'robot-control-service',
      data: {
        axis: command.axis,
        newPosition: result.position,
        duration: result.duration,
      },
    });
  }
}
```

#### Compliance

**Event Standards**:

- All events must follow standard event structure
- Event types must be registered in central registry
- Events must include correlation IDs for tracing
- Sensitive data must not be included in events (use references)

**Performance Requirements**:

- Event publishing latency <10ms
- Event processing latency <100ms
- Support for 1000+ events per second
- Consumer lag monitoring and alerting

---

## Architecture Decision Process

### Decision Making Framework

1. **Identify Decision Triggers**
   - Performance bottlenecks
   - Scalability requirements
   - Security concerns
   - Technology updates
   - Business requirement changes

2. **Information Gathering**
   - Technical research and prototyping
   - Industry best practices analysis
   - Performance and load testing
   - Security impact assessment
   - Cost-benefit analysis

3. **Alternative Evaluation**
   - Create comparison matrix
   - Prototype critical alternatives
   - Assess long-term implications
   - Consider team capabilities
   - Evaluate operational impact

4. **Decision Documentation**
   - Use ADR template consistently
   - Include rationale and alternatives
   - Document consequences clearly
   - Define compliance measures
   - Set review dates

5. **Implementation Planning**
   - Define migration strategy
   - Create detailed timeline
   - Identify risks and mitigation
   - Plan rollback procedures
   - Establish success criteria

### Review and Evolution

**Regular Review Schedule**:

- **Monthly**: Architecture review meetings
- **Quarterly**: ADR effectiveness assessment
- **Annually**: Strategic architecture planning

**Review Criteria**:

- Decision outcome vs. expected benefits
- Compliance with architectural standards
- Performance impact measurement
- Team productivity impact
- Business value delivery

**Evolution Process**:

- ADRs can be superseded by new decisions
- Deprecated patterns must be documented
- Migration paths must be provided
- Legacy system support timeline

---

_These ADRs provide a structured approach to managing architectural evolution
while maintaining system reliability and team productivity. Each decision should
be regularly reviewed and updated based on changing requirements and new
information._
