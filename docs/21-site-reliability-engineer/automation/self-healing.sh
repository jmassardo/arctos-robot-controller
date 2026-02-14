#!/bin/bash
# Self-Healing Automation Script for Arctos Robot Controller
# Monitors system health and automatically recovers from common failures

set -euo pipefail

# Configuration
LOG_FILE="/var/log/arctos/self-healing.log"
LOCKFILE="/tmp/arctos-self-healing.lock"
HEALTH_CHECK_INTERVAL=30  # seconds
MAX_RECOVERY_ATTEMPTS=3
NOTIFICATION_WEBHOOK="${NOTIFICATION_WEBHOOK:-}"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" | tee -a "$LOG_FILE"
}

# Check if another instance is running
if [ -f "$LOCKFILE" ]; then
    if kill -0 "$(cat "$LOCKFILE")" 2>/dev/null; then
        log "INFO" "Self-healing script already running (PID: $(cat "$LOCKFILE"))"
        exit 0
    else
        log "WARN" "Removing stale lockfile"
        rm -f "$LOCKFILE"
    fi
fi

# Create lockfile
echo $$ > "$LOCKFILE"

# Cleanup function
cleanup() {
    rm -f "$LOCKFILE"
    log "INFO" "Self-healing monitoring stopped"
}

trap cleanup EXIT INT TERM

log "INFO" "Starting self-healing monitoring"

# Send notification function
send_notification() {
    local severity=$1
    local message=$2
    
    if [ -n "$NOTIFICATION_WEBHOOK" ]; then
        curl -X POST "$NOTIFICATION_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"🤖 Arctos Self-Healing [$severity]: $message\"}" \
            2>/dev/null || log "WARN" "Failed to send notification"
    fi
}

# Health check functions
check_main_service() {
    if ! systemctl is-active --quiet arctos-robot-controller; then
        log "ERROR" "Main service is down"
        return 1
    fi
    
    # Check if HTTP endpoint is responding
    if ! curl -sf http://localhost:5000/api/health >/dev/null 2>&1; then
        log "ERROR" "HTTP health check failed"
        return 1
    fi
    
    return 0
}

check_database_connectivity() {
    # Test database connection
    if ! curl -sf http://localhost:5000/api/database/health >/dev/null 2>&1; then
        log "ERROR" "Database connectivity check failed"
        return 1
    fi
    
    return 0
}

check_hardware_communication() {
    # Check hardware communication status
    local hardware_status
    hardware_status=$(curl -sf http://localhost:5000/api/hardware/status 2>/dev/null || echo '{"error": true}')
    
    if echo "$hardware_status" | jq -e '.error' >/dev/null 2>&1; then
        log "ERROR" "Hardware communication check failed"
        return 1
    fi
    
    # Check if any protocol is down
    local protocols_down
    protocols_down=$(echo "$hardware_status" | jq -r '.protocols | to_entries[] | select(.value.status != "connected") | .key' 2>/dev/null || echo "")
    
    if [ -n "$protocols_down" ]; then
        log "WARN" "Hardware protocols down: $protocols_down"
        return 1
    fi
    
    return 0
}

check_websocket_health() {
    # Check WebSocket connection health
    local ws_status
    ws_status=$(curl -sf http://localhost:5000/api/websocket/health 2>/dev/null || echo '{"error": true}')
    
    if echo "$ws_status" | jq -e '.error' >/dev/null 2>&1; then
        log "ERROR" "WebSocket health check failed"
        return 1
    fi
    
    return 0
}

check_disk_space() {
    # Check disk space (alert if > 85% full)
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -gt 85 ]; then
        log "WARN" "Disk space usage high: ${disk_usage}%"
        return 1
    fi
    
    return 0
}

check_memory_usage() {
    # Check memory usage (alert if > 90% used)
    local mem_usage
    mem_usage=$(free | awk '/^Mem:/{printf("%.0f", $3/$2*100)}')
    
    if [ "$mem_usage" -gt 90 ]; then
        log "WARN" "Memory usage high: ${mem_usage}%"
        return 1
    fi
    
    return 0
}

# Recovery functions
recover_main_service() {
    local attempt=$1
    log "INFO" "Attempting to recover main service (attempt $attempt)"
    
    # First try restart
    if systemctl restart arctos-robot-controller; then
        log "INFO" "Service restart successful"
        sleep 10
        
        if check_main_service; then
            log "INFO" "Main service recovery successful"
            send_notification "INFO" "Main service recovered after restart"
            return 0
        fi
    fi
    
    # If restart failed, try more aggressive recovery
    log "WARN" "Service restart failed, attempting aggressive recovery"
    
    # Kill any hung processes
    pkill -f "node.*server.js" || true
    sleep 5
    
    # Clear any temporary files
    rm -f /tmp/arctos-*.tmp
    
    # Start service
    if systemctl start arctos-robot-controller; then
        sleep 15
        
        if check_main_service; then
            log "INFO" "Aggressive recovery successful"
            send_notification "WARN" "Main service recovered after aggressive restart"
            return 0
        fi
    fi
    
    log "ERROR" "Failed to recover main service"
    return 1
}

recover_database() {
    local attempt=$1
    log "INFO" "Attempting to recover database connectivity (attempt $attempt)"
    
    # Check if it's a connection pool issue
    if curl -X POST http://localhost:5000/api/admin/database/restart-pool 2>/dev/null; then
        log "INFO" "Database connection pool restarted"
        sleep 5
        
        if check_database_connectivity; then
            log "INFO" "Database recovery successful"
            send_notification "INFO" "Database connectivity recovered"
            return 0
        fi
    fi
    
    # If using SQLite, check database file permissions
    if [ -f "/app/data/robot.db" ]; then
        chmod 664 /app/data/robot.db
        chown arctos:arctos /app/data/robot.db 2>/dev/null || true
    fi
    
    # Restart main service as database issues often resolve with service restart
    systemctl restart arctos-robot-controller
    sleep 10
    
    if check_database_connectivity; then
        log "INFO" "Database recovery successful after service restart"
        send_notification "WARN" "Database recovered after service restart"
        return 0
    fi
    
    log "ERROR" "Failed to recover database connectivity"
    return 1
}

recover_hardware_communication() {
    local attempt=$1
    log "INFO" "Attempting to recover hardware communication (attempt $attempt)"
    
    # Reset hardware interfaces
    if curl -X POST http://localhost:5000/api/hardware/reset-all 2>/dev/null; then
        log "INFO" "Hardware reset command sent"
        sleep 10
        
        if check_hardware_communication; then
            log "INFO" "Hardware communication recovery successful"
            send_notification "INFO" "Hardware communication recovered"
            return 0
        fi
    fi
    
    # Try restarting hardware service
    if systemctl restart arctos-hardware-interface 2>/dev/null; then
        log "INFO" "Hardware interface service restarted"
        sleep 15
        
        if check_hardware_communication; then
            log "INFO" "Hardware recovery successful after service restart"
            send_notification "WARN" "Hardware communication recovered after service restart"
            return 0
        fi
    fi
    
    log "ERROR" "Failed to recover hardware communication"
    return 1
}

recover_websocket() {
    local attempt=$1
    log "INFO" "Attempting to recover WebSocket health (attempt $attempt)"
    
    # Restart WebSocket server
    if curl -X POST http://localhost:5000/api/admin/websocket/restart 2>/dev/null; then
        log "INFO" "WebSocket restart command sent"
        sleep 5
        
        if check_websocket_health; then
            log "INFO" "WebSocket recovery successful"
            send_notification "INFO" "WebSocket communication recovered"
            return 0
        fi
    fi
    
    # Full service restart if WebSocket-specific restart doesn't work
    systemctl restart arctos-robot-controller
    sleep 15
    
    if check_websocket_health; then
        log "INFO" "WebSocket recovery successful after full restart"
        send_notification "WARN" "WebSocket recovered after full service restart"
        return 0
    fi
    
    log "ERROR" "Failed to recover WebSocket health"
    return 1
}

clean_disk_space() {
    log "INFO" "Attempting to clean disk space"
    
    # Clean old log files
    find /var/log/arctos -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Clean temporary files
    find /tmp -name "arctos-*" -mtime +1 -delete 2>/dev/null || true
    
    # Clean old backups (keep last 5)
    find /app/backups -name "*.tar.gz" -type f | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true
    
    # Rotate large log files
    for log in /var/log/arctos/*.log; do
        if [ -f "$log" ] && [ $(stat -f%z "$log" 2>/dev/null || stat -c%s "$log") -gt 104857600 ]; then  # 100MB
            mv "$log" "${log}.old"
            touch "$log"
            chown arctos:arctos "$log" 2>/dev/null || true
        fi
    done
    
    log "INFO" "Disk cleanup completed"
    send_notification "INFO" "Disk space cleaned up"
}

reduce_memory_usage() {
    log "INFO" "Attempting to reduce memory usage"
    
    # Clear system caches
    echo 3 > /proc/sys/vm/drop_caches
    
    # Send memory optimization signal to application
    if curl -X POST http://localhost:5000/api/admin/optimize-memory 2>/dev/null; then
        log "INFO" "Memory optimization command sent to application"
    fi
    
    # If memory usage is still critical, restart service
    sleep 30
    if ! check_memory_usage; then
        log "WARN" "Memory usage still high, restarting service"
        systemctl restart arctos-robot-controller
        send_notification "WARN" "Service restarted due to high memory usage"
    else
        log "INFO" "Memory usage reduced successfully"
        send_notification "INFO" "Memory usage optimized"
    fi
}

# Main recovery orchestrator
attempt_recovery() {
    local check_function=$1
    local recovery_function=$2
    local service_name=$3
    
    for attempt in $(seq 1 $MAX_RECOVERY_ATTEMPTS); do
        if $recovery_function $attempt; then
            return 0
        fi
        
        if [ $attempt -lt $MAX_RECOVERY_ATTEMPTS ]; then
            local wait_time=$((attempt * 30))  # Exponential backoff
            log "INFO" "Waiting ${wait_time}s before next recovery attempt"
            sleep $wait_time
        fi
    done
    
    log "ERROR" "Failed to recover $service_name after $MAX_RECOVERY_ATTEMPTS attempts"
    send_notification "CRITICAL" "Failed to recover $service_name after $MAX_RECOVERY_ATTEMPTS attempts"
    return 1
}

# Main monitoring loop
main_monitoring_loop() {
    local failure_count=0
    local consecutive_failures=0
    
    while true; do
        local checks_failed=0
        
        # Perform health checks
        if ! check_main_service; then
            attempt_recovery check_main_service recover_main_service "main service"
            ((checks_failed++))
        fi
        
        if ! check_database_connectivity; then
            attempt_recovery check_database_connectivity recover_database "database"
            ((checks_failed++))
        fi
        
        if ! check_hardware_communication; then
            attempt_recovery check_hardware_communication recover_hardware_communication "hardware communication"
            ((checks_failed++))
        fi
        
        if ! check_websocket_health; then
            attempt_recovery check_websocket_health recover_websocket "WebSocket"
            ((checks_failed++))
        fi
        
        if ! check_disk_space; then
            clean_disk_space
        fi
        
        if ! check_memory_usage; then
            reduce_memory_usage
        fi
        
        # Track failure patterns
        if [ $checks_failed -gt 0 ]; then
            ((failure_count++))
            ((consecutive_failures++))
            log "WARN" "Health checks failed: $checks_failed, consecutive failures: $consecutive_failures"
            
            # If too many consecutive failures, send alert
            if [ $consecutive_failures -ge 5 ]; then
                send_notification "CRITICAL" "System experiencing $consecutive_failures consecutive health check failures"
            fi
        else
            consecutive_failures=0
            if [ $((failure_count % 10)) -eq 0 ] && [ $failure_count -gt 0 ]; then
                log "INFO" "System health stable after $failure_count total failures"
            fi
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
    done
}

# Start monitoring
log "INFO" "Self-healing monitoring initialized"
send_notification "INFO" "Self-healing automation started"
main_monitoring_loop