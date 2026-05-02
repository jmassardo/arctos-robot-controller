# Docker Deployment Guide

This guide covers how to deploy Arctos Robot Controller using Docker containers.

## Quick Start

### Production Deployment

1. **Build and start the application**:

   ```bash
   docker-compose up --build -d
   ```

2. **Access the application**:
   - Open http://localhost:5000 in your browser
   - The application will be available with persistent data storage

3. **View logs**:
   ```bash
   docker-compose logs -f arctos-robot-controller
   ```

### Development Environment

1. **Start development environment**:

   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

2. **Access the application**:
   - Backend: http://localhost:5000
   - Frontend dev server: http://localhost:3000 (with hot reload)

## Container Architecture

### Production Setup (`docker-compose.yml`)

- **Main Application**: Node.js backend serving React frontend
- **Redis** (optional): For job queues and caching
- **Nginx** (optional): Reverse proxy with SSL termination
- **Volumes**: Persistent data storage for configuration and logs

### Development Setup (`docker-compose.dev.yml`)

- **Development Container**: Hot-reloading enabled
- **Volume Mounts**: Source code mounted for live development
- **Debug Access**: Full shell access for debugging

## Container Images

### Production Image (`Dockerfile`)

- **Multi-stage build** for optimized size
- **Non-root user** for security
- **Health checks** for monitoring
- **Alpine Linux** base for minimal footprint

### Development Image (`Dockerfile.dev`)

- **Full development tools** included
- **Source code mounting** for live development
- **Debug capabilities** enabled

## Environment Configuration

### Production Environment (`.env.docker.example`)

- Copy `.env.docker.example` to `.env.docker` and customize for your deployment
- Set secure values for JWT_SECRET and SESSION_SECRET
- Configure hardware interfaces as needed

### Environment Variables

- `NODE_ENV`: Set to "production" for deployment
- `PORT`: Application port (default: 5000)
- `DB_PATH`: SQLite database location
- `LOG_LEVEL`: Logging verbosity
- `HARDWARE_SIMULATION`: Enable/disable hardware simulation

## Data Persistence

### Volumes

- `arctos_data`: Application data and SQLite database
- `arctos_config`: Robot configuration files
- `arctos_logs`: Application logs
- `redis_data`: Redis persistence (if used)

### Backup

```bash
# Backup volumes
docker run --rm -v arctos_data:/source -v $(pwd):/backup alpine tar czf /backup/arctos_data_backup.tar.gz -C /source .

# Restore volumes
docker run --rm -v arctos_data:/target -v $(pwd):/backup alpine tar xzf /backup/arctos_data_backup.tar.gz -C /target
```

## Deployment Commands

### Using NPM Scripts

```bash
# Build Docker image
npm run docker:build

# Start production environment
npm run docker:compose

# Start development environment
npm run docker:compose-dev

# View logs
npm run docker:logs

# Stop all containers
npm run docker:stop

# Clean up everything
npm run docker:clean
```

### Using Shell Scripts

```bash
# Build with versioning
./scripts/docker-build.sh

# Deploy with health checks
./scripts/docker-deploy.sh
```

## Monitoring and Health Checks

### Health Endpoint

- **URL**: `http://localhost:5000/api/health`
- **Response**: JSON with system status
- **Used by**: Docker health checks and monitoring

### Container Status

```bash
# Check container health
docker-compose ps

# View detailed health status
docker inspect --format='{{.State.Health.Status}}' arctos-controller
```

## Networking

### Port Mapping

- **5000**: Main application (HTTP/WebSocket)
- **80/443**: Nginx reverse proxy (if enabled)
- **6379**: Redis (if enabled)
- **3000**: Development frontend (dev mode only)

### Service Discovery

- Services communicate using container names
- Internal network: `arctos-network`
- External access through mapped ports

## Security

### Container Security

- **Non-root user**: Application runs as `arctos` user
- **Read-only filesystem**: Where possible
- **Security headers**: Implemented in Nginx
- **Network isolation**: Containers in private network

### Secrets Management

- Use Docker secrets for production
- Environment variables for development
- Never commit secrets to version control

## Scaling

### Horizontal Scaling

```bash
# Scale main application
docker-compose up --scale arctos-robot-controller=3

# Load balancing via Nginx
```

### Resource Limits

Add to docker-compose.yml:

```yaml
services:
  arctos-robot-controller:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
```

## Troubleshooting

### Common Issues

1. **Permission Denied**

   ```bash
   # Fix ownership
   sudo chown -R 1001:1001 ./data ./config ./logs
   ```

2. **Port Already in Use**

   ```bash
   # Check what's using the port
   lsof -i :5000

   # Use different port
   PORT=5001 docker-compose up
   ```

3. **Container Won't Start**

   ```bash
   # Check logs
   docker-compose logs arctos-robot-controller

   # Debug mode
   docker run -it arctos-robot-controller:latest sh
   ```

4. **Health Check Failing**

   ```bash
   # Test health endpoint directly
   curl http://localhost:5000/api/health

   # Check container network
   docker network inspect arctos_arctos-network
   ```

### Development Debugging

```bash
# Access development container shell
docker-compose -f docker-compose.dev.yml exec arctos-dev sh

# View development logs
docker-compose -f docker-compose.dev.yml logs -f

# Restart services
docker-compose -f docker-compose.dev.yml restart
```

## Performance Optimization

### Image Size

- Multi-stage builds reduce final image size
- .dockerignore excludes unnecessary files
- Alpine Linux base image

### Build Speed

- Layer caching optimizations
- Separate dependency installation
- Build-time argument usage

### Runtime Performance

- Health check optimization
- Resource limit configuration
- Volume mount strategies

## Platform Support

### Tested Platforms

- **x86_64**: Intel/AMD processors
- **ARM64**: Apple Silicon, ARM servers
- **Operating Systems**: Linux, macOS, Windows (via Docker Desktop)

### Multi-Architecture Build

```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 -t arctos-robot-controller:latest .
```

## Future Enhancements

- Kubernetes deployment manifests
- Container orchestration with Docker Swarm
- Advanced monitoring with Prometheus/Grafana
- Automated security scanning
- CI/CD pipeline integration
