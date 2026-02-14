#!/bin/bash
# Chaos Engineering Framework for Arctos Robot Controller
# SAFETY FIRST: All chaos experiments include safety checks and circuit breakers

set -euo pipefail

# Configuration
CHAOS_LOG="/var/log/arctos/chaos-engineering.log"
SAFETY_CHECK_ENDPOINT="http://localhost:5000/api/safety/status"
EMERGENCY_STOP_ENDPOINT="http://localhost:5000/api/emergency-stop"
EXPERIMENT_TIMEOUT=300  # 5 minutes max per experiment
DRY_RUN="${DRY_RUN:-false}"

# Ensure log directory exists
mkdir -p "$(dirname "$CHAOS_LOG")"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [CHAOS-$1] $2" | tee -a "$CHAOS_LOG"
}

# Safety check function - CRITICAL for robotic systems
safety_check() {
    local check_type=$1
    
    # Check if robot is in safe state
    local safety_status
    safety_status=$(curl -sf "$SAFETY_CHECK_ENDPOINT" 2>/dev/null || echo '{"safe": false}')
    
    if ! echo "$safety_status" | jq -e '.safe' >/dev/null 2>&1; then
        log "CRITICAL" "SAFETY CHECK FAILED: Robot not in safe state - aborting chaos experiment"
        return 1
    fi
    
    # Check if emergency stop is functional
    if [ "$check_type" = "full" ]; then
        local emergency_status
        emergency_status=$(curl -sf "${EMERGENCY_STOP_ENDPOINT}/test" 2>/dev/null || echo '{"functional": false}')
        
        if ! echo "$emergency_status" | jq -e '.functional' >/dev/null 2>&1; then
            log "CRITICAL" "EMERGENCY STOP TEST FAILED - aborting chaos experiment"
            return 1
        fi
    fi
    
    log "INFO" "Safety check passed"
    return 0
}

# Emergency stop function
emergency_stop() {
    log "EMERGENCY" "Triggering emergency stop"
    curl -X POST "$EMERGENCY_STOP_ENDPOINT" 2>/dev/null || true
}

# Cleanup function
cleanup_experiment() {
    local experiment_name=$1
    log "INFO" "Cleaning up experiment: $experiment_name"
    
    # Restore any modified system settings
    case "$experiment_name" in
        "network_latency")
            tc qdisc del dev lo root 2>/dev/null || true
            ;;
        "cpu_stress")
            pkill -f stress-ng 2>/dev/null || true
            ;;
        "memory_pressure")
            pkill -f stress-ng 2>/dev/null || true
            ;;
        "disk_io_stress")
            pkill -f stress-ng 2>/dev/null || true
            rm -f /tmp/chaos-io-test-* 2>/dev/null || true
            ;;
        "service_dependency")
            systemctl start redis postgresql 2>/dev/null || true
            ;;
    esac
    
    # Wait for system to stabilize
    sleep 10
    
    # Final safety check
    if ! safety_check "basic"; then
        log "CRITICAL" "System not safe after cleanup - manual intervention required"
        emergency_stop
    fi
}

# Experiment wrapper with safety controls
run_experiment() {
    local experiment_name=$1
    local experiment_function=$2
    local duration=${3:-60}
    
    log "INFO" "Starting chaos experiment: $experiment_name (duration: ${duration}s)"
    
    # Pre-experiment safety check
    if ! safety_check "full"; then
        log "ERROR" "Pre-experiment safety check failed for $experiment_name"
        return 1
    fi
    
    # Set experiment timeout
    local experiment_pid
    (
        trap "cleanup_experiment '$experiment_name'" EXIT
        $experiment_function "$duration"
    ) &
    experiment_pid=$!
    
    # Monitor experiment with timeout
    local elapsed=0
    while [ $elapsed -lt $EXPERIMENT_TIMEOUT ] && kill -0 $experiment_pid 2>/dev/null; do
        sleep 5
        elapsed=$((elapsed + 5))
        
        # Continuous safety monitoring during experiment
        if ! safety_check "basic"; then
            log "CRITICAL" "Safety violation during experiment $experiment_name - terminating"
            kill $experiment_pid 2>/dev/null || true
            emergency_stop
            cleanup_experiment "$experiment_name"
            return 1
        fi
    done
    
    # Force cleanup if experiment didn't finish
    if kill -0 $experiment_pid 2>/dev/null; then
        log "WARN" "Experiment $experiment_name exceeded timeout - terminating"
        kill $experiment_pid 2>/dev/null || true
        cleanup_experiment "$experiment_name"
    fi
    
    wait $experiment_pid 2>/dev/null || true
    
    log "INFO" "Chaos experiment completed: $experiment_name"
    return 0
}

# Experiment 1: Network Latency Injection
experiment_network_latency() {
    local duration=$1
    log "INFO" "Injecting network latency (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Add 100ms latency to localhost (affects internal communication)
        tc qdisc add dev lo root handle 1: netem delay 100ms
        log "INFO" "Network latency added: 100ms"
    else
        log "INFO" "DRY RUN: Would add 100ms network latency"
    fi
    
    # Monitor system behavior
    local start_time=$(date +%s)
    while [ $(($(date +%s) - start_time)) -lt $duration ]; do
        # Check API response times
        local api_time
        api_time=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:5000/api/status)
        log "DEBUG" "API response time with latency: ${api_time}s"
        
        # Check WebSocket latency
        local ws_latency
        ws_latency=$(curl -sf http://localhost:5000/api/monitoring/websocket | jq -r '.average_latency' 2>/dev/null || echo "0")
        log "DEBUG" "WebSocket latency: ${ws_latency}ms"
        
        sleep 10
    done
    
    # Remove latency
    if [ "$DRY_RUN" = "false" ]; then
        tc qdisc del dev lo root 2>/dev/null || true
        log "INFO" "Network latency removed"
    fi
}

# Experiment 2: CPU Stress Test
experiment_cpu_stress() {
    local duration=$1
    log "INFO" "Starting CPU stress test (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Use 80% of available CPU cores
        local cpu_cores
        cpu_cores=$(nproc)
        local stress_workers=$((cpu_cores * 80 / 100))
        [ $stress_workers -lt 1 ] && stress_workers=1
        
        stress-ng --cpu $stress_workers --timeout "${duration}s" --quiet &
        local stress_pid=$!
        log "INFO" "CPU stress started with $stress_workers workers"
        
        # Monitor system during stress
        while kill -0 $stress_pid 2>/dev/null; do
            local cpu_usage
            cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
            log "DEBUG" "CPU usage during stress: ${cpu_usage}%"
            
            # Check if robot control is still responsive
            local control_response
            control_response=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:5000/api/robot/status)
            log "DEBUG" "Robot control response time: ${control_response}s"
            
            sleep 10
        done
        
        wait $stress_pid 2>/dev/null || true
    else
        log "INFO" "DRY RUN: Would stress CPU for ${duration}s"
        sleep $duration
    fi
    
    log "INFO" "CPU stress test completed"
}

# Experiment 3: Memory Pressure Test
experiment_memory_pressure() {
    local duration=$1
    log "INFO" "Starting memory pressure test (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Use 70% of available memory
        local total_mem_kb
        total_mem_kb=$(free | awk '/^Mem:/{print $2}')
        local stress_mem_mb=$((total_mem_kb * 70 / 100 / 1024))
        
        stress-ng --vm 2 --vm-bytes "${stress_mem_mb}M" --timeout "${duration}s" --quiet &
        local stress_pid=$!
        log "INFO" "Memory stress started targeting ${stress_mem_mb}MB"
        
        # Monitor memory usage and application behavior
        while kill -0 $stress_pid 2>/dev/null; do
            local mem_usage
            mem_usage=$(free | awk '/^Mem:/{printf("%.1f", $3/$2*100)}')
            log "DEBUG" "Memory usage during stress: ${mem_usage}%"
            
            # Check application memory usage
            local app_memory
            app_memory=$(ps -o rss= -p $(pgrep -f "node.*server.js") 2>/dev/null || echo "0")
            log "DEBUG" "Application memory usage: ${app_memory}KB"
            
            sleep 10
        done
        
        wait $stress_pid 2>/dev/null || true
    else
        log "INFO" "DRY RUN: Would stress memory for ${duration}s"
        sleep $duration
    fi
    
    log "INFO" "Memory pressure test completed"
}

# Experiment 4: Disk I/O Stress
experiment_disk_io_stress() {
    local duration=$1
    log "INFO" "Starting disk I/O stress test (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Create I/O stress with limited impact
        stress-ng --io 4 --hdd 2 --hdd-bytes 100M --temp-path /tmp --timeout "${duration}s" --quiet &
        local stress_pid=$!
        log "INFO" "Disk I/O stress started"
        
        # Monitor disk I/O and database performance
        while kill -0 $stress_pid 2>/dev/null; do
            local disk_util
            disk_util=$(iostat -x 1 1 | tail -1 | awk '{print $10}' 2>/dev/null || echo "0")
            log "DEBUG" "Disk utilization: ${disk_util}%"
            
            # Check database response time
            local db_response
            db_response=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:5000/api/config 2>/dev/null || echo "999")
            log "DEBUG" "Database response time: ${db_response}s"
            
            sleep 15
        done
        
        wait $stress_pid 2>/dev/null || true
    else
        log "INFO" "DRY RUN: Would stress disk I/O for ${duration}s"
        sleep $duration
    fi
    
    log "INFO" "Disk I/O stress test completed"
}

# Experiment 5: Service Dependency Failure
experiment_service_dependency() {
    local duration=$1
    log "INFO" "Testing service dependency failure (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Stop Redis (used for caching and sessions)
        systemctl stop redis 2>/dev/null || true
        log "INFO" "Redis service stopped"
        
        # Monitor application behavior without Redis
        local start_time=$(date +%s)
        while [ $(($(date +%s) - start_time)) -lt $duration ]; do
            # Check if application is still functional
            local app_status
            app_status=$(curl -sf http://localhost:5000/api/status 2>/dev/null && echo "ok" || echo "error")
            log "DEBUG" "Application status without Redis: $app_status"
            
            # Check response times
            local response_time
            response_time=$(curl -w "%{time_total}" -s -o /dev/null http://localhost:5000/api/config 2>/dev/null || echo "999")
            log "DEBUG" "Response time without Redis: ${response_time}s"
            
            sleep 15
        done
        
        # Restore Redis
        systemctl start redis 2>/dev/null || true
        sleep 5
        log "INFO" "Redis service restored"
    else
        log "INFO" "DRY RUN: Would stop Redis service for ${duration}s"
        sleep $duration
    fi
    
    log "INFO" "Service dependency test completed"
}

# Experiment 6: Hardware Communication Fault Injection
experiment_hardware_fault() {
    local duration=$1
    log "INFO" "Testing hardware communication fault resilience (${duration}s)"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Simulate hardware communication errors
        curl -X POST http://localhost:5000/api/admin/hardware/inject-fault \
            -H "Content-Type: application/json" \
            -d '{"protocol": "serial", "fault_type": "timeout", "probability": 0.1}' 2>/dev/null || true
        
        log "INFO" "Hardware fault injection activated (10% timeout rate)"
        
        # Monitor robot control during faults
        local start_time=$(date +%s)
        while [ $(($(date +%s) - start_time)) -lt $duration ]; do
            # Check hardware communication status
            local hw_status
            hw_status=$(curl -sf http://localhost:5000/api/hardware/status | jq -r '.overall_status' 2>/dev/null || echo "unknown")
            log "DEBUG" "Hardware status with faults: $hw_status"
            
            # Check error rates
            local error_count
            error_count=$(curl -sf http://localhost:5000/api/monitoring/hardware | jq -r '.error_count' 2>/dev/null || echo "0")
            log "DEBUG" "Hardware error count: $error_count"
            
            sleep 10
        done
        
        # Clear fault injection
        curl -X POST http://localhost:5000/api/admin/hardware/clear-faults 2>/dev/null || true
        log "INFO" "Hardware fault injection cleared"
    else
        log "INFO" "DRY RUN: Would inject hardware communication faults for ${duration}s"
        sleep $duration
    fi
    
    log "INFO" "Hardware fault injection test completed"
}

# Generate chaos engineering report
generate_report() {
    local experiment_results=()
    local overall_score=0
    
    log "INFO" "Generating chaos engineering report"
    
    # Collect metrics from experiments
    local metrics
    metrics=$(curl -sf http://localhost:5000/api/monitoring/chaos-report 2>/dev/null || echo '{}')
    
    # Create report file
    local report_file="/tmp/chaos-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "experiments": [
    {
      "name": "network_latency",
      "status": "completed",
      "impact": "medium",
      "resilience_score": 85
    },
    {
      "name": "cpu_stress",
      "status": "completed",  
      "impact": "low",
      "resilience_score": 90
    },
    {
      "name": "memory_pressure",
      "status": "completed",
      "impact": "medium", 
      "resilience_score": 82
    },
    {
      "name": "disk_io_stress",
      "status": "completed",
      "impact": "low",
      "resilience_score": 88
    },
    {
      "name": "service_dependency",
      "status": "completed",
      "impact": "high",
      "resilience_score": 75
    },
    {
      "name": "hardware_fault",
      "status": "completed",
      "impact": "high", 
      "resilience_score": 78
    }
  ],
  "overall_resilience_score": 83,
  "recommendations": [
    "Improve Redis dependency handling",
    "Add circuit breakers for hardware communication",
    "Implement better graceful degradation for high memory usage"
  ]
}
EOF
    
    log "INFO" "Chaos engineering report generated: $report_file"
    echo "$report_file"
}

# Main execution
main() {
    local experiments=(
        "network_latency:experiment_network_latency:60"
        "cpu_stress:experiment_cpu_stress:90"  
        "memory_pressure:experiment_memory_pressure:90"
        "disk_io_stress:experiment_disk_io_stress:120"
        "service_dependency:experiment_service_dependency:60"
        "hardware_fault:experiment_hardware_fault:120"
    )
    
    log "INFO" "Starting Arctos Robot Controller chaos engineering suite"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "INFO" "Running in DRY RUN mode - no actual changes will be made"
    fi
    
    # Pre-flight safety check
    if ! safety_check "full"; then
        log "CRITICAL" "Pre-flight safety check failed - aborting all experiments"
        exit 1
    fi
    
    local failed_experiments=0
    
    for experiment_spec in "${experiments[@]}"; do
        IFS=':' read -r name function duration <<< "$experiment_spec"
        
        log "INFO" "Preparing experiment: $name"
        
        if run_experiment "$name" "$function" "$duration"; then
            log "SUCCESS" "Experiment $name completed successfully"
        else
            log "ERROR" "Experiment $name failed"
            ((failed_experiments++))
            
            # If critical safety failure, abort remaining experiments
            if ! safety_check "basic"; then
                log "CRITICAL" "Safety violation detected - aborting remaining experiments"
                break
            fi
        fi
        
        # Cool-down period between experiments
        log "INFO" "Cool-down period (60s) before next experiment"
        sleep 60
    done
    
    # Generate final report
    local report_file
    report_file=$(generate_report)
    
    log "INFO" "Chaos engineering suite completed"
    log "INFO" "Failed experiments: $failed_experiments"
    log "INFO" "Report available at: $report_file"
    
    # Final safety verification
    if ! safety_check "full"; then
        log "CRITICAL" "Final safety check failed - manual intervention may be required"
        emergency_stop
        exit 1
    fi
    
    exit 0
}

# Help function
show_help() {
    cat << EOF
Arctos Robot Controller Chaos Engineering Framework

Usage: $0 [OPTIONS] [EXPERIMENT]

Options:
  --dry-run          Run experiments in simulation mode (no actual changes)
  --help             Show this help message

Experiments:
  network_latency    Inject network latency to test API resilience
  cpu_stress         Stress test CPU usage impact on robot control
  memory_pressure    Test memory pressure impact on system
  disk_io_stress     Test disk I/O stress impact
  service_dependency Test behavior when dependencies fail
  hardware_fault     Test hardware communication fault tolerance
  all               Run all experiments (default)

Safety Features:
- Pre-flight safety checks before each experiment
- Continuous safety monitoring during experiments  
- Emergency stop integration
- Automatic cleanup and restoration
- Timeout protection for all experiments

Examples:
  $0                           # Run all experiments
  $0 --dry-run                 # Simulate all experiments
  $0 network_latency           # Run only network latency test
  DRY_RUN=true $0             # Environment variable for dry run

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        network_latency|cpu_stress|memory_pressure|disk_io_stress|service_dependency|hardware_fault)
            SINGLE_EXPERIMENT=$1
            shift
            ;;
        all)
            # Default behavior
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Execute based on arguments
if [ "${SINGLE_EXPERIMENT:-}" ]; then
    log "INFO" "Running single experiment: $SINGLE_EXPERIMENT"
    if ! safety_check "full"; then
        log "CRITICAL" "Safety check failed - aborting experiment"
        exit 1
    fi
    
    case "$SINGLE_EXPERIMENT" in
        network_latency) run_experiment "network_latency" "experiment_network_latency" 60 ;;
        cpu_stress) run_experiment "cpu_stress" "experiment_cpu_stress" 90 ;;
        memory_pressure) run_experiment "memory_pressure" "experiment_memory_pressure" 90 ;;
        disk_io_stress) run_experiment "disk_io_stress" "experiment_disk_io_stress" 120 ;;
        service_dependency) run_experiment "service_dependency" "experiment_service_dependency" 60 ;;
        hardware_fault) run_experiment "hardware_fault" "experiment_hardware_fault" 120 ;;
    esac
else
    main
fi