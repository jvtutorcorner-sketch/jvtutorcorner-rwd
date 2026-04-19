#!/bin/bash

# Ensure Node.js paths are included (Common for Mac Homebrew/Intel)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Configuration
RUNS=${STRESS_RUNS:-5}
GROUPS_COUNT=${STRESS_GROUP_COUNT:-3}
TEST_FILE="e2e/classroom_room_whiteboard_sync.spec.ts"
TEST_NAME="Stress test"
PROJECT="chromium"

# Statistics
SUCCESS=0
FAILED=0
LOG_DIR="test-results/stress-logs-$(date +%s)"

mkdir -p "$LOG_DIR"

echo "======================================================="
echo "🎓 Classroom Whiteboard Sync - Stability Stress Test"
echo "======================================================="
echo "Total Runs to execute: $RUNS"
echo "Concurrent Groups per run: $GROUPS_COUNT (Total Connections: $((GROUPS_COUNT * 2)))"
echo "Logs Directory: $LOG_DIR"
echo "======================================================="
echo ""

for i in $(seq 1 $RUNS); do
  echo "▶️  Run $i of $RUNS (Groups: $GROUPS_COUNT)..."
  LOG_FILE="$LOG_DIR/run_$i.log"
  
  # Run the Playwright test and capture output in both stdout and log file
  STRESS_GROUP_COUNT=$GROUPS_COUNT npx playwright test "$TEST_FILE" -g "$TEST_NAME" --project="$PROJECT" > "$LOG_FILE" 2>&1
  
  if [ $? -eq 0 ]; then
    echo "   ✅ Run $i: SUCCESS"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "   ❌ Run $i: FAILED"
    FAILED=$((FAILED + 1))
    echo "   📄 See log: $LOG_FILE"
  fi
  echo "-------------------------------------------------------"
done

echo ""
echo "======================================================="
echo "📊 STABILITY TEST SUMMARY"
echo "======================================================="
echo "Total Runs : $RUNS"
echo "Successful : $SUCCESS"
echo "Failed     : $FAILED"

if [ $RUNS -gt 0 ]; then
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.2f\", ($SUCCESS / $RUNS) * 100}")
  echo "Success Rate: ${SUCCESS_RATE}%"
fi

echo "======================================================="
if [ $FAILED -eq 0 ]; then
  echo "✅ System is STABLE under configured load."
  exit 0
else
  echo "⚠️ System exhibited instability. Please check failed logs."
  exit 1
fi
