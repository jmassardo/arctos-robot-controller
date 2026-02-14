#!/bin/bash

# Script to process all files in the prompts folder with GitHub Copilot CLI
# Usage: ./process-prompts.sh [options]

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Utility functions with logging
log_to_main() {
    # Ensure log directory exists before writing
    mkdir -p "$(dirname "$MAIN_LOG_FILE")" 2>/dev/null || true
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$MAIN_LOG_FILE"
}

print_info() { 
    echo -e "${BLUE}[INFO]${NC} $1"
    log_to_main "[INFO] $1"
}
print_success() { 
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    log_to_main "[SUCCESS] $1"
}
print_warning() { 
    echo -e "${YELLOW}[WARNING]${NC} $1"
    log_to_main "[WARNING] $1"
}
print_error() { 
    echo -e "${RED}[ERROR]${NC} $1"
    log_to_main "[ERROR] $1"
}
print_step() { 
    echo -e "${PURPLE}[STEP]${NC} $1"
    log_to_main "[STEP] $1"
}
print_file() { 
    echo -e "${CYAN}[FILE]${NC} $1"
    log_to_main "[FILE] $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPTS_DIR="$PROJECT_ROOT/prompts"
OUTPUT_BASE_DIR="$PROJECT_ROOT/generated"
LOGS_DIR="$PROJECT_ROOT/logs"
INDIVIDUAL_LOGS_DIR="$LOGS_DIR/individual_runs"
MAIN_LOG_FILE="$LOGS_DIR/batch_processing_$(date '+%Y%m%d_%H%M%S').log"

# Options
DRY_RUN=false
PARALLEL=false
MAX_PARALLEL=3
SKIP_EXISTING=false
FILTER_PATTERN=""
CONTINUE_ON_ERROR=true
USE_DOCKER=false
COPILOT_IMAGE="${COPILOT_IMAGE:-ghcr.io/github/copilot-cli:latest}"
# macOS-compatible timeout function
run_with_timeout() {
    local timeout_duration="$1"
    shift
    # Run command in background
    "$@" &
    local pid=$!
    
    # Wait for timeout or completion
    (
        sleep "$timeout_duration"
        if kill -0 "$pid" 2>/dev/null; then
            echo "Command timed out after ${timeout_duration}s" >&2
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            kill -KILL "$pid" 2>/dev/null || true
        fi
    ) &
    local timeout_pid=$!
    
    # Wait for main command
    local exit_code=0
    if wait "$pid" 2>/dev/null; then
        exit_code=$?
    else
        exit_code=124  # timeout exit code
    fi
    
    # Kill timeout monitor
    kill "$timeout_pid" 2>/dev/null || true
    wait "$timeout_pid" 2>/dev/null || true
    
    return $exit_code
}

# Function to show usage
show_usage() {
    cat << EOF
Process All Prompts with GitHub Copilot CLI

Usage: $0 [options]

Options:
  -d, --dry-run         Show what would be processed without running copilot
  -p, --parallel        Process files in parallel (faster but more resource intensive)
  -j, --jobs N          Number of parallel jobs (default: 3, only with --parallel)
  -s, --skip-existing   Skip files that already have generated output
  -f, --filter PATTERN  Only process files matching the pattern (e.g., "*.md")
  -e, --stop-on-error   Stop processing if any file fails (default: continue)
  -D, --docker          Use Docker containers for isolated execution (requires GITHUB_TOKEN)
  --image IMAGE         Custom Docker image (only with --docker, default: ghcr.io/github/copilot-cli:latest)
  --clean               Clean the output directory before processing
  -h, --help            Show this help message

Environment Variables:
  GITHUB_TOKEN          GitHub Personal Access Token (required only with --docker)
  COPILOT_TIMEOUT       Timeout in seconds for each copilot command (default: 300)
  COPILOT_IMAGE         Docker image to use with --docker (default: ghcr.io/github/copilot-cli:latest)

Examples:
  # Basic usage (no GITHUB_TOKEN needed for local execution)
  $0

  # Docker isolated execution (requires GITHUB_TOKEN environment variable)
  export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
  $0 --docker

  # Dry run to see what files would be processed
  $0 --dry-run

  # Process only markdown files in parallel
  $0 --parallel --filter "*.md"

  # Skip files that already have output and stop on first error
  $0 --skip-existing --stop-on-error

Directory Structure:
  Input:  $PROMPTS_DIR/
  Output: $OUTPUT_BASE_DIR/
  Main Log: $MAIN_LOG_FILE
  Individual Logs: $INDIVIDUAL_LOGS_DIR/
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -p|--parallel)
                PARALLEL=true
                shift
                ;;
            -j|--jobs)
                MAX_PARALLEL="$2"
                shift 2
                ;;
            -s|--skip-existing)
                SKIP_EXISTING=true
                shift
                ;;
            -f|--filter)
                FILTER_PATTERN="$2"
                shift 2
                ;;
            -e|--stop-on-error)
                CONTINUE_ON_ERROR=false
                shift
                ;;
            -D|--docker)
                USE_DOCKER=true
                shift
                ;;
            --image)
                COPILOT_IMAGE="$2"
                shift 2
                ;;
            --clean)
                if [ -d "$OUTPUT_BASE_DIR" ]; then
                    print_info "Cleaning output directory: $OUTPUT_BASE_DIR"
                    rm -rf "$OUTPUT_BASE_DIR"
                fi
                shift
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                print_error "Unexpected argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Check Docker environment
check_docker_environment() {
    print_step "Checking Docker environment..."
    
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker is not installed"
        print_info "Install Docker from https://docker.com/"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running or not accessible"
        print_info "Make sure Docker daemon is running and you have permission to access it"
        exit 1
    fi
    
    print_success "Docker is available"
}

# Prepare Docker image
prepare_docker_image() {
    print_step "Preparing Docker image: $COPILOT_IMAGE"
    
    if ! docker image inspect "$COPILOT_IMAGE" >/dev/null 2>&1; then
        print_info "Pulling Docker image..."
        if ! docker pull "$COPILOT_IMAGE"; then
            print_error "Failed to pull Docker image: $COPILOT_IMAGE"
            print_info "Make sure the image exists and you have access to it"
            exit 1
        fi
    else
        print_success "Docker image is available"
    fi
}

# Validate environment and setup
setup_environment() {
    print_step "Setting up environment..."
    
    # Create directories
    mkdir -p "$OUTPUT_BASE_DIR"
    mkdir -p "$LOGS_DIR"
    mkdir -p "$INDIVIDUAL_LOGS_DIR"
    mkdir -p "$(dirname "$MAIN_LOG_FILE")"
    
    # Initialize main log file
    cat > "$MAIN_LOG_FILE" << EOF
================================================================================
GitHub Copilot CLI Batch Processing Session
================================================================================
Start Time: $(date)
Script: $0
Arguments: $@
Prompts Directory: $PROMPTS_DIR
Output Directory: $OUTPUT_BASE_DIR
Main Log: $MAIN_LOG_FILE
Individual Logs: $INDIVIDUAL_LOGS_DIR
================================================================================
Configuration:
- Dry Run: $DRY_RUN
- Parallel: $PARALLEL
- Max Parallel Jobs: $MAX_PARALLEL
- Skip Existing: $SKIP_EXISTING
- Filter Pattern: ${FILTER_PATTERN:-"(none)"}
- Continue On Error: $CONTINUE_ON_ERROR
- Use Docker: $USE_DOCKER
- Docker Image: ${COPILOT_IMAGE:-"(default)"}
- Timeout: ${COPILOT_TIMEOUT:-300}s
================================================================================

EOF
    
    # Check if copilot command is available (only for local execution)
    if [ "$USE_DOCKER" = false ]; then
        if ! command -v copilot >/dev/null 2>&1; then
            print_error "GitHub Copilot CLI is not installed or not in PATH"
            print_info "Install it with: gh auth login && gh extension install github/gh-copilot"
            exit 1
        fi
    fi
    
    # Check Docker environment if using containers
    if [ "$USE_DOCKER" = true ]; then
        check_docker_environment
        prepare_docker_image
        
        # Check for GitHub token (required for Docker execution)
        if [ -z "$GITHUB_TOKEN" ]; then
            print_error "GITHUB_TOKEN environment variable is required when using --docker"
            print_info "Set it with: export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx"
            exit 1
        fi
    fi
    
    # Check prompts directory
    if [ ! -d "$PROMPTS_DIR" ]; then
        print_error "Prompts directory not found: $PROMPTS_DIR"
        exit 1
    fi
    
    print_success "Environment setup complete"
    print_info "Prompts directory: $PROMPTS_DIR"
    print_info "Output directory: $OUTPUT_BASE_DIR"
    print_info "Main log file: $MAIN_LOG_FILE"
    print_info "Individual logs: $INDIVIDUAL_LOGS_DIR"
}

# Get list of files to process
get_file_list() {
    local files=()
    
    if [ -n "$FILTER_PATTERN" ]; then
        # Use find with pattern
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$PROMPTS_DIR" -maxdepth 1 -name "$FILTER_PATTERN" -type f -print0)
    else
        # Get all files
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$PROMPTS_DIR" -maxdepth 1 -type f -print0)
    fi
    
    # Filter out hidden files and common non-prompt files
    local filtered_files=()
    for file in "${files[@]}"; do
        local basename=$(basename "$file")
        # Skip hidden files, backup files, etc.
        if [[ ! "$basename" =~ ^\. ]] && [[ ! "$basename" =~ ~$ ]] && [[ ! "$basename" =~ \.bak$ ]]; then
            filtered_files+=("$file")
        fi
    done
    
    # Sort files by basename for logical processing order
    IFS=$'\n' sorted_files=($(printf '%s\n' "${filtered_files[@]}" | sort -V))
    printf '%s\0' "${sorted_files[@]}"
}

# Process a single file
process_file() {
    local filepath="$1"
    local filename=$(basename "$filepath")
    local relative_path
    # Use a more portable way to get relative path
    if command -v realpath >/dev/null 2>&1; then
        relative_path=$(realpath --relative-to="$PROMPTS_DIR" "$filepath" 2>/dev/null || echo "${filepath#$PROMPTS_DIR/}")
    else
        relative_path="${filepath#$PROMPTS_DIR/}"
    fi
    local output_dir="$OUTPUT_BASE_DIR/$(dirname "$relative_path")"
    local output_file="$output_dir/${filename%.*}_output"
    
    # Create individual log file for this specific prompt
    local individual_log_file="$INDIVIDUAL_LOGS_DIR/${filename%.*}_$(date '+%Y%m%d_%H%M%S').log"
    
    # Create output directory
    mkdir -p "$output_dir"
    
    print_file "Processing: $relative_path"
    
    # Skip if output already exists and skip option is enabled
    if [ "$SKIP_EXISTING" = true ] && [ -d "$output_file" ] && [ "$(ls -A "$output_file" 2>/dev/null)" ]; then
        print_warning "Skipping $filename (output already exists)"
        log_to_main "SKIPPED - $relative_path (output exists)"
        return 0
    fi
    
    if [ "$DRY_RUN" = true ]; then
        if [ "$USE_DOCKER" = true ]; then
            echo "  Would run in Docker container: $COPILOT_IMAGE"
            echo "  Docker command: docker run --rm -e GITHUB_TOKEN=*** -v ... $COPILOT_IMAGE copilot ..."
        else
            echo "  Would run locally: copilot -p \"Read the contents of $filename and write the necessary code, tests, and documentation to satisfy the requirements\" --allow-all"
        fi
        echo "  Output dir: $output_file"
        echo "  Individual log: $individual_log_file"
        return 0
    fi
    
    # Create individual output directory for this file
    mkdir -p "$output_file"
    
    # Initialize individual log file
    cat > "$individual_log_file" << EOF
================================================================================
Individual Copilot Processing Log
================================================================================
File: $filename
Full Path: $filepath
Relative Path: $relative_path
Start Time: $(date)
Main Processing Session: $(basename "$MAIN_LOG_FILE" .log)
Output Directory: $output_file
================================================================================

ORIGINAL PROMPT CONTENT:
EOF
    
    # Add the original prompt content
    echo "$(cat "$filepath")" >> "$individual_log_file"
    echo "" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    echo "COPILOT COMMAND EXECUTION:" >> "$individual_log_file"
    if [ "$USE_DOCKER" = true ]; then
        echo "Execution Mode: Docker Container" >> "$individual_log_file"
        echo "Docker Image: $COPILOT_IMAGE" >> "$individual_log_file"
        echo "Command: copilot -p \"Read the contents of $filename and write the necessary code, tests, and documentation to satisfy the requirements\" --allow-all" >> "$individual_log_file"
    else
        echo "Execution Mode: Local" >> "$individual_log_file"
        echo "Command: copilot -p \"Read the contents of $filename and write the necessary code, tests, and documentation to satisfy the requirements\" --allow-all" >> "$individual_log_file"
    fi
    echo "Working Directory: $(dirname "$filepath")" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    echo "" >> "$individual_log_file"
    
    local start_time=$(date +%s)
    local timeout=${COPILOT_TIMEOUT:-300}
    
    # Branch execution based on Docker usage
    if [ "$USE_DOCKER" = true ]; then
        process_file_with_docker "$filepath" "$filename" "$output_file" "$individual_log_file" "$start_time" "$timeout"
    else
        process_file_locally "$filepath" "$filename" "$output_file" "$individual_log_file" "$start_time" "$timeout"
    fi
}

# Process file locally (original method)
process_file_locally() {
    local filepath="$1"
    local filename="$2" 
    local output_file="$3"
    local individual_log_file="$4"
    local start_time="$5"
    local timeout="$6"
    
    # Change to the file's directory and run copilot command with comprehensive logging
    cd "$(dirname "$filepath")"
    
    # Run copilot command with timeout and capture all output
    if run_with_timeout "$timeout" copilot -p "Read the contents of $filename and write the necessary code, tests, and documentation to satisfy the requirements" --allow-all 2>&1 | tee -a "$individual_log_file" > "$output_file/copilot_output.log"; then
        process_file_success "$filename" "$filepath" "$output_file" "$individual_log_file" "$start_time"
    else
        process_file_failure "$filename" "$filepath" "$output_file" "$individual_log_file" "$start_time" "$timeout"
    fi
}

# Process file with Docker container
process_file_with_docker() {
    local filepath="$1"
    local filename="$2" 
    local output_file="$3"
    local individual_log_file="$4"
    local start_time="$5"
    local timeout="$6"
    
    local file_dir=$(dirname "$filepath")
    local container_name="copilot-processor-$(date +%s)-$$"
    
    # Add Docker execution info to log
    echo "DOCKER EXECUTION MODE:" >> "$individual_log_file"
    echo "Container: $container_name" >> "$individual_log_file"
    echo "Image: $COPILOT_IMAGE" >> "$individual_log_file"
    echo "File Directory: $file_dir" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    echo "" >> "$individual_log_file"
    
    local container_script="
        set -e
        echo 'Docker Copilot Container Started'
        echo 'Working Directory: \$(pwd)'
        echo 'Available Files:'
        ls -la
        echo ''
        echo 'Processing: $filename'
        echo '================================='
        
        # Run the copilot command
        copilot -p \"Read the contents of $filename and write the necessary code, tests, and documentation to satisfy the requirements\" --allow-all
    "
    
    # Run Docker container with mounted file directory and GitHub token
    if run_with_timeout "$timeout" docker run --rm \
        --name "$container_name" \
        -e GITHUB_TOKEN="$GITHUB_TOKEN" \
        -v "$file_dir:/workspace:ro" \
        -v "$output_file:/output" \
        -w /workspace \
        "$COPILOT_IMAGE" \
        /bin/bash -c "$container_script" 2>&1 | tee -a "$individual_log_file" > "$output_file/copilot_output.log"; then
        
        process_file_success "$filename" "$filepath" "$output_file" "$individual_log_file" "$start_time"
    else
        process_file_failure "$filename" "$filepath" "$output_file" "$individual_log_file" "$start_time" "$timeout"
        # Clean up container if it's still running
        docker rm -f "$container_name" 2>/dev/null || true
    fi
}

# Handle successful file processing
process_file_success() {
    local filename="$1"
    local filepath="$2"
    local output_file="$3"
    local individual_log_file="$4"
    local start_time="$5"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    # Use a more portable way to get relative path
    local relative_path
    if command -v realpath >/dev/null 2>&1; then
        relative_path=$(realpath --relative-to="$PROMPTS_DIR" "$filepath" 2>/dev/null || echo "${filepath#$PROMPTS_DIR/}")
    else
        relative_path="${filepath#$PROMPTS_DIR/}"
    fi
    
    # Write success footer to individual log
    echo "" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    echo "EXECUTION COMPLETED SUCCESSFULLY" >> "$individual_log_file"
    echo "End Time: $(date)" >> "$individual_log_file"
    echo "Duration: ${duration} seconds" >> "$individual_log_file"
    echo "Output Directory: $output_file" >> "$individual_log_file"
    echo "Execution Mode: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Local")" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    
    print_success "✅ Completed $filename (${duration}s)"
    log_to_main "SUCCESS - $relative_path (${duration}s) - Individual Log: $individual_log_file"
    
    # Save file content for reference
    cp "$filepath" "$output_file/original_prompt.txt"
    
    # Create summary file
    cat > "$output_file/summary.txt" << EOF
File: $relative_path
Processed: $(date)
Duration: ${duration} seconds
Status: SUCCESS
Execution Mode: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Local")
Individual Log: $individual_log_file

Files:
- original_prompt.txt: Copy of the original prompt file
- copilot_output.log: Copilot command output
- summary.txt: This summary file

Individual log contains:
- Original prompt content
- Full copilot command execution
- All output and errors
EOF
    
    return 0
}

# Handle failed file processing
process_file_failure() {
    local filename="$1"
    local filepath="$2"
    local output_file="$3"
    local individual_log_file="$4"
    local start_time="$5"
    local timeout="$6"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local exit_code=$?
    # Use a more portable way to get relative path
    local relative_path
    if command -v realpath >/dev/null 2>&1; then
        relative_path=$(realpath --relative-to="$PROMPTS_DIR" "$filepath" 2>/dev/null || echo "${filepath#$PROMPTS_DIR/}")
    else
        relative_path="${filepath#$PROMPTS_DIR/}"
    fi
    
    # Write error footer to individual log
    echo "" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    echo "EXECUTION FAILED" >> "$individual_log_file"
    echo "End Time: $(date)" >> "$individual_log_file"
    echo "Duration: ${duration} seconds" >> "$individual_log_file"
    echo "Exit Code: $exit_code" >> "$individual_log_file"
    echo "Timeout Setting: ${timeout}s" >> "$individual_log_file"
    echo "Execution Mode: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Local")" >> "$individual_log_file"
    echo "================================================================================" >> "$individual_log_file"
    
    print_error "❌ Failed $filename (${duration}s)"
    log_to_main "FAILED - $relative_path (${duration}s) - Exit Code: $exit_code - Individual Log: $individual_log_file"
    
    # Save error information
    cat > "$output_file/error.txt" << EOF
File: $relative_path
Processed: $(date)
Duration: ${duration} seconds
Exit Code: $exit_code
Status: FAILED
Execution Mode: $([ "$USE_DOCKER" = true ] && echo "Docker" || echo "Local")
Individual Log: $individual_log_file

Check the individual log file for detailed error information:
$individual_log_file

Also check copilot_output.log for captured output.
EOF
    
    # Copy original prompt for reference even on failure
    cp "$filepath" "$output_file/original_prompt.txt" 2>/dev/null || true
    
    return 1
}

# Process files sequentially
process_sequential() {
    local files=("$@")
    local total=${#files[@]}
    local current=0
    local successful=0
    local failed=0
    
    print_step "Processing $total files sequentially..."
    
    for filepath in "${files[@]}"; do
        current=$((current + 1))
        echo ""
        print_info "[$current/$total] Processing file..."
        
        if process_file "$filepath"; then
            successful=$((successful + 1))
        else
            failed=$((failed + 1))
            if [ "$CONTINUE_ON_ERROR" = false ]; then
                print_error "Stopping due to error (--stop-on-error enabled)"
                break
            fi
        fi
    done
    
    echo ""
    print_step "Sequential processing complete:"
    print_success "✅ Successful: $successful"
    if [ $failed -gt 0 ]; then
        print_error "❌ Failed: $failed"
    fi
}

# Process files in parallel
process_parallel() {
    local files=("$@")
    local total=${#files[@]}
    
    print_step "Processing $total files in parallel (max $MAX_PARALLEL jobs)..."
    
    # Create a temporary file to track results
    local results_file=$(mktemp)
    trap "rm -f $results_file" EXIT
    
    # Process files in parallel using xargs
    printf '%s\n' "${files[@]}" | xargs -n 1 -P "$MAX_PARALLEL" -I {} bash -c '
        source_file="$1"
        if process_file "$source_file"; then
            echo "SUCCESS: $source_file"
        else
            echo "FAILED: $source_file"
        fi
    ' _ {}
    
    print_success "Parallel processing complete"
}

# Generate summary report
generate_summary() {
    local summary_file="$OUTPUT_BASE_DIR/processing_summary.txt"
    local successful=$(find "$OUTPUT_BASE_DIR" -name "summary.txt" | wc -l)
    local failed=$(find "$OUTPUT_BASE_DIR" -name "error.txt" | wc -l)
    local total=$((successful + failed))
    
    cat > "$summary_file" << EOF
GitHub Copilot CLI Batch Processing Summary
==========================================

Processed: $(date)
Total files: $total
Successful: $successful
Failed: $failed
Success rate: $(( total > 0 ? successful * 100 / total : 0 ))%

Configuration:
- Prompts directory: $PROMPTS_DIR
- Output directory: $OUTPUT_BASE_DIR
- Main log file: $MAIN_LOG_FILE
- Individual logs: $INDIVIDUAL_LOGS_DIR
- Parallel processing: $PARALLEL
- Continue on error: $CONTINUE_ON_ERROR
- Filter pattern: ${FILTER_PATTERN:-"(none)"}
- Execution mode: $([ "$USE_DOCKER" = true ] && echo "Docker ($COPILOT_IMAGE)" || echo "Local")

Generated Outputs:
$(find "$OUTPUT_BASE_DIR" -type d -name "*_output" | sort)

Individual Log Files:
$(find "$INDIVIDUAL_LOGS_DIR" -name "*.log" | sort)

Main Log File: $MAIN_LOG_FILE
EOF
    
    # Also write summary to main log
    cat >> "$MAIN_LOG_FILE" << EOF

================================================================================
FINAL SUMMARY
================================================================================
End Time: $(date)
Total Files: $total
Successful: $successful
Failed: $failed
Success Rate: $(( total > 0 ? successful * 100 / total : 0 ))%

Individual Log Files Generated:
$(find "$INDIVIDUAL_LOGS_DIR" -name "*.log" -printf "  - %f\n" | sort)

$(if [ $failed -gt 0 ]; then
    echo "FAILED FILES:"
    grep "FAILED -" "$MAIN_LOG_FILE" | sed 's/.*FAILED - /  - /'
fi)

$(if [ $successful -gt 0 ]; then
    echo "SUCCESSFUL FILES:"
    grep "SUCCESS -" "$MAIN_LOG_FILE" | sed 's/.*SUCCESS - /  - /'
fi)
================================================================================
Session Complete
================================================================================
EOF
    
    echo ""
    print_step "Processing Summary:"
    cat "$summary_file"
    
    print_info "Full summary saved to: $summary_file"
    print_info "Main log file: $MAIN_LOG_FILE"
    print_info "Individual logs directory: $INDIVIDUAL_LOGS_DIR"
}

# Main execution function
main() {
    echo -e "${PURPLE}🤖 GitHub Copilot CLI Batch Processor${NC}"
    echo "======================================="
    
    # Parse arguments and setup
    parse_args "$@"
    setup_environment
    
    # Get list of files to process
    files_array=()
    while IFS= read -r -d '' file; do
        files_array+=("$file")
    done < <(get_file_list)    
    if [ ${#files_array[@]} -eq 0 ]; then
        print_warning "No files found to process"
        if [ -n "$FILTER_PATTERN" ]; then
            print_info "Filter pattern: $FILTER_PATTERN"
        fi
        exit 0
    fi
    
    print_info "Found ${#files_array[@]} files to process"
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No copilot commands will be executed"
    fi
    
    # List files that will be processed
    echo ""
    print_step "Files to process:"
    for file in "${files_array[@]}"; do
        # Use a more portable way to get relative path
        local relative_path
        if command -v realpath >/dev/null 2>&1; then
            relative_path=$(realpath --relative-to="$PROMPTS_DIR" "$file" 2>/dev/null || echo "${file#$PROMPTS_DIR/}")
        else
            relative_path="${file#$PROMPTS_DIR/}"
        fi
        echo "  📄 $relative_path"
    done
    
    if [ "$DRY_RUN" = false ]; then
        echo ""
        read -p "Continue with processing? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Aborted by user"
            exit 0
        fi
    fi
    
    # Process files
    local start_time=$(date +%s)
    
    if [ "$PARALLEL" = true ] && [ "$DRY_RUN" = false ]; then
        # Export function for parallel processing
        export -f process_file print_file print_success print_error print_warning
        export OUTPUT_BASE_DIR PROMPTS_DIR LOG_FILE SKIP_EXISTING
        process_parallel "${files_array[@]}"
    else
        process_sequential "${files_array[@]}"
    fi
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    if [ "$DRY_RUN" = false ]; then
        generate_summary
        echo ""
        print_success "🎉 Batch processing completed in ${total_duration} seconds!"
    else
        print_success "🎉 Dry run completed!"
    fi
}

# Run main function with all arguments
main "$@"