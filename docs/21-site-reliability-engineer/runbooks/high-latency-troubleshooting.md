# Runbook: High Latency Troubleshooting
**Incident Type**: Performance Degradation  
**Severity**: P2 (High) - P1 (Critical if safety implications)  
**SLO Impact**: Response time SLOs exceeded, user experience degraded

## 🎯 Overview
This runbook addresses high latency issues affecting robot control, API responses, and real-time communication. High latency can significantly impact user experience and robot control precision.

## 🚨 Symptoms and Indicators
- **Prometheus Alerts**:
  - `RobotCommandLatencyHigh`
  - `ControlEndpointLatencyHigh`
  - `RealtimeUpdateLatencyHigh`
- **User Reports**: "Robot feels sluggish", "Interface is slow"
- **Monitoring**: P95 response times exceeding SLO thresholds
- **WebSocket Issues**: Delayed real-time updates

## ⚡ Immediate Assessment (< 5 minutes)

### Step 1: Determine Scope and Impact
```bash
# Check current latency metrics
curl -s http://localhost:5000/metrics | grep -E "(latency|duration)" | sort

# Get real-time performance snapshot
curl -s http://localhost:5000/api/monitoring/performance | jq '.latency'
```

### Step 2: Safety Check for Robot Operations
```bash
# Check if high latency affects safety-critical operations
curl -s http://localhost:5000/api/status | jq '.robot.execution_state'

# If robot is executing G-code, assess risk
if [ "$(curl -s http://localhost:5000/api/status | jq -r '.robot.execution_state')" = "executing" ]; then
  echo "WARNING: Robot currently executing with high latency - assess safety risk"
fi
```

## 🔍 Diagnosis Steps

### Step 1: Identify Latency Source
```bash
# Check system resource utilization
top -n 1 | head -20
iostat -x 1 3
free -h
df -h

# Check application-specific metrics
curl -s http://localhost:5000/api/monitoring/detailed | jq '.performance'
```

### Step 2: Database Performance Check
```bash
# Check database connection pool
curl -s http://localhost:5000/api/monitoring/database | jq '.connection_pool'

# Check slow queries (if using PostgreSQL)
kubectl exec -it postgres-pod -- psql -U arctos -c "
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC 
LIMIT 10;"

# For SQLite, check database locks
lsof | grep robot.db
```

### Step 3: Network and WebSocket Analysis
```bash
# Check network latency
ping -c 10 localhost
ss -i | grep ESTAB | wc -l  # Count established connections

# WebSocket connection analysis
curl -s http://localhost:5000/api/monitoring/websocket | jq '.connections'

# Check for network congestion
netstat -i
sar -n DEV 1 3
```

### Step 4: Application Layer Analysis
```bash
# Check Node.js event loop lag
curl -s http://localhost:5000/api/monitoring/nodejs | jq '.event_loop_lag'

# Check garbage collection metrics
curl -s http://localhost:5000/api/monitoring/nodejs | jq '.gc_stats'

# Review recent application logs for performance issues
tail -100 /var/log/arctos/performance.log | grep -i "slow\|timeout\|latency"
```

### Step 5: Hardware Interface Performance
```bash
# Check hardware protocol response times
for protocol in serial can rs485 modbus tcp; do
  echo "Testing $protocol protocol latency..."
  curl -s -w "%{time_total}s\n" -o /dev/null \
    http://localhost:5000/api/hardware/ping/$protocol
done

# Check hardware buffer status
curl -s http://localhost:5000/api/hardware/buffers | jq '.'
```

## 🛠️ Resolution Procedures

### Procedure A: System Resource Optimization
```bash
# If high CPU usage detected
echo "Optimizing CPU usage..."

# Check for runaway processes
ps aux --sort=-%cpu | head -10

# Adjust Node.js process priority if needed
sudo renice -10 $(pgrep -f "node.*server.js")

# If high memory usage
echo "Checking memory usage..."
echo 3 > /proc/sys/vm/drop_caches  # Clear file system cache (if safe)

# Check for memory leaks
curl -s http://localhost:5000/api/monitoring/nodejs | jq '.memory_usage'
```

### Procedure B: Database Performance Optimization
```bash
# Restart database connection pool
curl -X POST http://localhost:5000/api/admin/database/restart-pool

# For PostgreSQL - analyze and vacuum tables
kubectl exec -it postgres-pod -- psql -U arctos -c "
ANALYZE;
VACUUM ANALYZE positions;
VACUUM ANALYZE configurations;
VACUUM ANALYZE users;
"

# Check and rebuild indexes if needed
kubectl exec -it postgres-pod -- psql -U arctos -c "
REINDEX INDEX idx_positions_timestamp;
REINDEX INDEX idx_configurations_updated_at;
"

# For SQLite - optimize database
sqlite3 /app/data/robot.db "VACUUM;"
sqlite3 /app/data/robot.db "ANALYZE;"
```

### Procedure C: Network and WebSocket Optimization
```bash
# Restart WebSocket server if connection issues
sudo systemctl restart arctos-websocket-server

# Optimize network buffer sizes
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' >> /etc/sysctl.conf
sysctl -p

# Clean up stale connections
ss -K dst 127.0.0.1  # Kill local connections if safe

# Check and adjust WebSocket configuration
curl -X POST http://localhost:5000/api/admin/websocket/optimize \
  -H "Content-Type: application/json" \
  -d '{"ping_interval": 25000, "ping_timeout": 5000}'
```

### Procedure D: Application Performance Tuning
```bash
# Enable Node.js performance monitoring
export NODE_OPTIONS="--max-old-space-size=4096 --gc-interval=100"

# Restart application with optimized settings
sudo systemctl stop arctos-robot-controller
sleep 5
sudo systemctl start arctos-robot-controller

# Wait for service to fully start
sleep 10
sudo systemctl status arctos-robot-controller

# Enable compression for API responses
curl -X POST http://localhost:5000/api/admin/settings \
  -H "Content-Type: application/json" \
  -d '{"compression": true, "compression_level": 6}'
```

### Procedure E: Hardware Interface Optimization
```bash
# Optimize hardware communication settings
curl -X POST http://localhost:5000/api/hardware/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "serial": {"buffer_size": 8192, "timeout": 1000},
    "can": {"buffer_size": 4096, "timeout": 500},
    "modbus": {"timeout": 2000, "retries": 3}
  }'

# Clear hardware communication buffers
curl -X POST http://localhost:5000/api/hardware/clear-buffers

# Restart hardware interface service
sudo systemctl restart arctos-hardware-interface
```

## ✅ Verification Steps

### Step 1: Performance Baseline Check
```bash
# Test API response times
time curl -s http://localhost:5000/api/status > /dev/null
time curl -s http://localhost:5000/api/config > /dev/null

# Test robot command latency
start_time=$(date +%s%N)
curl -X POST http://localhost:5000/api/robot/move \
  -H "Content-Type: application/json" \
  -d '{"x": 0, "y": 0, "z": 0.1, "relative": true}'
end_time=$(date +%s%N)
latency_ms=$(( (end_time - start_time) / 1000000 ))
echo "Robot command latency: ${latency_ms}ms"
```

### Step 2: Load Testing
```bash
# Run brief load test to verify performance
ab -n 100 -c 10 http://localhost:5000/api/status

# Test WebSocket performance
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:5000');
const start = Date.now();
socket.on('status_update', () => {
  console.log('WebSocket latency:', Date.now() - start, 'ms');
  socket.disconnect();
});
socket.emit('get_status');
"
```

### Step 3: User Workflow Validation
```bash
# Test complete user workflow timing
workflow_start=$(date +%s%N)

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "password": "test"}' \
  -c cookies.txt

# Load configuration
curl -b cookies.txt http://localhost:5000/api/config > /dev/null

# Move robot
curl -X POST http://localhost:5000/api/robot/move \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"x": 1, "y": 1, "z": 1, "relative": true}' > /dev/null

workflow_end=$(date +%s%N)
total_latency_ms=$(( (workflow_end - workflow_start) / 1000000 ))
echo "Complete workflow latency: ${total_latency_ms}ms"

# Cleanup
rm -f cookies.txt
```

### Step 4: Monitoring Validation
```bash
# Verify metrics are back within SLO thresholds
curl -s http://localhost:5000/metrics | grep -E "(p95|p99)" | while read line; do
  echo "Checking: $line"
  # Add threshold validation logic here
done

# Check error rates haven't increased
error_rate=$(curl -s http://localhost:5000/metrics | grep http_requests_total | awk '{sum+=$2} END {print sum}')
echo "Current error rate: $error_rate"
```

## 🔄 Prevention Measures

### Immediate Actions
1. **Enhanced Monitoring**
   ```bash
   # Add detailed latency tracking
   curl -X POST http://localhost:5000/api/admin/monitoring/enable-detailed-latency
   
   # Set up proactive alerting
   curl -X POST http://localhost:5000/api/admin/alerts/create \
     -H "Content-Type: application/json" \
     -d '{
       "name": "latency_trend_warning",
       "condition": "increase(avg_latency[5m]) > 20%",
       "threshold": 0.2
     }'
   ```

2. **Performance Budgets**
   ```bash
   # Set performance budgets for critical operations
   curl -X POST http://localhost:5000/api/admin/performance-budgets \
     -H "Content-Type: application/json" \
     -d '{
       "robot_commands": "100ms",
       "api_responses": "500ms",
       "websocket_updates": "50ms"
     }'
   ```

### Long-term Improvements
1. **Caching Strategy**
   - Implement Redis caching for frequently accessed data
   - Add CDN for static assets
   - Cache robot configuration data

2. **Database Optimization**
   - Add database connection pooling
   - Implement query optimization
   - Add database performance monitoring

3. **Architecture Improvements**
   - Consider microservices architecture for heavy operations
   - Implement async processing for non-critical operations
   - Add load balancing for high-traffic scenarios

## 📊 Post-Incident Actions

### Performance Analysis
```bash
# Generate performance report
curl -s http://localhost:5000/api/monitoring/performance-report \
  --data '{"start_time": "'$(date -d '1 hour ago' -Iseconds)'", "end_time": "'$(date -Iseconds)'"}' \
  > performance-incident-report.json

# Analyze latency patterns
awk '/latency/ {print $1, $2}' /var/log/arctos/performance.log | \
  sort -n | tail -100 > latency-analysis.txt
```

### Capacity Planning Update
```bash
# Update capacity planning models based on incident learnings
curl -X POST http://localhost:5000/api/admin/capacity-planning/update \
  -H "Content-Type: application/json" \
  -d '{
    "incident_learnings": {
      "peak_cpu_usage": 85,
      "peak_memory_usage": 78,
      "database_connection_peak": 45,
      "recommendations": ["increase_memory", "optimize_database_queries"]
    }
  }'
```

## 📞 Escalation Contacts

### Technical Escalation
- **Performance Engineer**: perf-eng@company.com
- **Database Administrator**: dba-oncall@company.com
- **Infrastructure Team**: infra-oncall@company.com

### Business Escalation
- **Product Manager**: product@company.com
- **Customer Success**: cs@company.com

## 🔗 Related Runbooks
- [Database Performance Issues](./database-performance.md)
- [WebSocket Connection Problems](./websocket-issues.md)
- [System Resource Exhaustion](./resource-exhaustion.md)
- [Network Connectivity Issues](./network-connectivity.md)

## 📚 Additional Resources
- [Performance Monitoring Dashboard](https://grafana.example.com/d/performance/performance-overview)
- [Latency SLO Dashboard](https://grafana.example.com/d/slo-latency/latency-slos)
- [Performance Optimization Guide](../documentation/performance-optimization.md)
- [Database Tuning Guide](../documentation/database-tuning.md)

---

**Last Updated**: 2024-01-15  
**Reviewed By**: SRE Team, Performance Engineering Team  
**Next Review**: 2024-04-15