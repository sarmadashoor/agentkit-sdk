#!/bin/bash

et -euo pipefail

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/claude.config.json"
STATE_DIR="$PROJECT_ROOT/state"
PROMPTS_DIR="$PROJECT_ROOT/prompts"
TEST_RUNNER_DIR="$PROJECT_ROOT/test-runner"

# State files
LAST_OUTPUT="$STATE_DIR/last-output.txt"
LAST_COMMAND="$STATE_DIR/last-command.sh"
RESULT_SUMMARY="$STATE_DIR/result.summary.json"
PATCH_FILE="$STATE_DIR/patch.diff"

# Config
TEST_COMMAND=$(jq -r '.testCommand' "$CONFIG_FILE")
MAX_RETRIES=$(jq -r '.settings.maxRetries' "$CONFIG_FILE")
WATCH_INTERVAL=$(jq -r '.settings.watchInterval' "$CONFIG_FILE")
SOURCE_DIR=$(jq -r '.directories.source' "$CONFIG_FILE")
TEST_DIR=$(jq -r '.directories.test' "$CONFIG_FILE")

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$STATE_DIR/daemon.log"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$STATE_DIR/daemon.log" >&2
}

run_tests() {
    local attempt=$1
    log "Running tests (attempt $attempt/$MAX_RETRIES): $TEST_COMMAND"
    echo "$TEST_COMMAND" > "$LAST_COMMAND"

    local exit_code=0
    eval "$TEST_COMMAND" > "$LAST_OUTPUT" 2>&1 || exit_code=$?

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local total_tests=0
    local failed_tests=0

    if grep -q "Tests:" "$LAST_OUTPUT"; then
        total_tests=$(grep "Tests:" "$LAST_OUTPUT" | grep -o '[0-9]\+ total' | grep -o '[0-9]\+' | head -1 2>/dev/null || echo "0")
        failed_tests=$(grep "Tests:" "$LAST_OUTPUT" | grep -o '[0-9]\+ failed' | grep -o '[0-9]\+' | head -1 2>/dev/null || echo "0")
    elif grep -q "failing\|passed" "$LAST_OUTPUT"; then
        total_tests=$(grep -o '[0-9]\+) ' "$LAST_OUTPUT" | wc -l 2>/dev/null || echo "0")
        failed_tests=$(grep -c "failing\|FAIL\|✗" "$LAST_OUTPUT" 2>/dev/null || echo "0")
    else
        total_tests=$(grep -c "test\|spec\|it(" "$LAST_OUTPUT" 2>/dev/null || echo "0")
        failed_tests=$(grep -c "FAIL\|✗\|failing\|Error:" "$LAST_OUTPUT" 2>/dev/null || echo "0")
    fi

    [[ "$total_tests" =~ ^[0-9]+$ ]] || total_tests=0
    [[ "$failed_tests" =~ ^[0-9]+$ ]] || failed_tests=0
    local passed_tests=$((total_tests - failed_tests))
    (( passed_tests < 0 )) && passed_tests=0

    local failed_files_json
    failed_files_json=$(grep -o "[^/]*\.test\.[jt]sx\?\|[^/]*\.spec\.[jt]sx\?" "$LAST_OUTPUT" 2>/dev/null | sort | uniq | jq -R . | jq -s .)
    [[ -z "$failed_files_json" ]] && failed_files_json="[]"

    local error_summary
    error_summary=$(grep -A 5 -B 2 "Error\|FAIL\|✗\|failing" "$LAST_OUTPUT" | head -20 | jq -R . | jq -s 'join("\n")' || echo "\"\"")

    cat > "$RESULT_SUMMARY" <<EOF
{
  "timestamp": "$timestamp",
  "status": "$([ $exit_code -eq 0 ] && echo passed || echo failed)",
  "testCommand": $(echo "$TEST_COMMAND" | jq -R .),
  "exitCode": $exit_code,
  "totalTests": $total_tests,
  "passedTests": $passed_tests,
  "failedTests": $failed_tests,
  "failedTestFiles": $failed_files_json,
  "errorSummary": $error_summary,
  "attemptNumber": $attempt,
  "lastPatchApplied": null
}
EOF

    log "Test results: $passed_tests passed, $failed_tests failed (exit code: $exit_code)"
    return $exit_code
}

populate_prompt() {
    local template="$PROMPTS_DIR/test-fix.md"
    local output_file="$STATE_DIR/populated-prompt.md"

    local summary_json=$(cat "$RESULT_SUMMARY")
    local failed_files=$(echo "$summary_json" | jq -r '.failedTestFiles[]' 2>/dev/null || echo "")
    local attempt_number=$(echo "$summary_json" | jq -r '.attemptNumber' 2>/dev/null || echo "1")

    local source_code=""
    for file in $failed_files; do
        if [ -f "$TEST_DIR/$file" ]; then
            source_code+="\n### Test File: $file\n\\`\\`\\`\n$(cat "$TEST_DIR/$file")\n\\`\\`\\`\n"
            local base_name=$(basename "$file" | sed 's/\.test\|\.spec//' | sed 's/\.[jt]sx\?$//')
            local source_file=$(find "$SOURCE_DIR" -name "${base_name}.*" | head -1)
            if [ -f "$source_file" ]; then
                source_code+="\n### Source File: $source_file\n\\`\\`\\`\n$(cat "$source_file")\n\\`\\`\\`\n"
            fi
        fi
    done

    cp "$template" "$output_file"
    sed -i "s/{testCommand}/$TEST_COMMAND/g" "$output_file"
    sed -i "s/{workingDirectory}/$(pwd | sed 's/\//\\\//g')/g" "$output_file"
    sed -i "s/{attemptNumber}/$attempt_number/g" "$output_file"

    python3 - <<EOF
import json
with open("$output_file") as f:
    content = f.read()
with open("$RESULT_SUMMARY") as f:
    summary = json.load(f)
with open("$LAST_OUTPUT") as f:
    test_output = f.read()
failed_files = summary.get("failedTestFiles", [])
attempt = summary.get("attemptNumber", 1)
source_code = '''$source_code'''
content = content.replace("{testOutput}", test_output)
content = content.replace("{failedTestFiles}", ", ".join(failed_files))
content = content.replace("{previousAttempts}", f"This is attempt {attempt}")
content = content.replace("{sourceCode}", source_code)
with open("$output_file", "w") as f:
    f.write(content)
EOF

    echo "$output_file"
}

invoke_claude() {
    local prompt_file=$1
    local claude_output="$STATE_DIR/claude-response.md"
    log "Invoking Claude CLI with prompt: $prompt_file"
    echo "# Waiting for Claude CLI response..." > "$PATCH_FILE"

    if cat "$prompt_file" | claude --dangerously-skip-permissions > "$claude_output" 2>&1; then
        if grep -q "PATCH START" "$claude_output" && grep -q "PATCH END" "$claude_output"; then
            sed -n '/PATCH START/,/PATCH END/p' "$claude_output" | sed '1d;$d' > "$PATCH_FILE"
            log "Patch extracted to $PATCH_FILE"
            return 0
        fi
        error "No valid patch in Claude's response"
    else
        error "Claude CLI execution failed"
        log "Claude stdout:"
        cat "$claude_output" | tee -a "$STATE_DIR/daemon.log"
    fi
    return 1
}

apply_patch() {
    log "Applying patch..."
    if [ -f "$TEST_RUNNER_DIR/patch-applier.ts" ]; then
        if command -v tsx >/dev/null 2>&1; then
            tsx "$TEST_RUNNER_DIR/patch-applier.ts"
        elif command -v ts-node >/dev/null 2>&1; then
            ts-node "$TEST_RUNNER_DIR/patch-applier.ts"
        else
            npx tsc "$TEST_RUNNER_DIR/patch-applier.ts"
            node "$TEST_RUNNER_DIR/patch-applier.js"
        fi
    else
        error "Missing patch-applier.ts"
        return 1
    fi
}

check_dependencies() {
    local missing=()
    for cmd in claude jq python3; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

cleanup() {
    log "Daemon interrupted. Exiting cleanly."
    exit 0
}

main() {
    log "Starting Claude Loop Daemon"
    trap cleanup SIGINT SIGTERM

    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        log "=== Attempt $attempt/$MAX_RETRIES ==="
        if run_tests "$attempt"; then
            log "✅ All tests passed. Stopping daemon."
            break
        fi

        log "❌ Tests failed. Invoking Claude..."
        local prompt_file=$(populate_prompt)
        log "Prompt populated: $prompt_file"

        if invoke_claude "$prompt_file"; then
            log "🧠 Claude patch received"
            if apply_patch; then
                log "✅ Patch applied"
                sleep 2
            else
                error "❌ Patch application failed"
            fi
        else
            error "❌ Claude failed to generate patch"
        fi

        ((attempt++))
        if [ $attempt -le $MAX_RETRIES ]; then
            sleep_seconds=$((WATCH_INTERVAL / 1000))
            sleep "$sleep_seconds"
        fi
    done

    if [ $attempt -gt $MAX_RETRIES ]; then
        error "❌ Retry limit exceeded."
        exit 1
    fi
    log "🎉 Done. All tests passing."
}

# Entry point
if [ "${1:-}" = "--check" ]; then
    check_dependencies
    log "Dependencies OK"
    exit 0
fi

check_dependencies
main "$@"
