#!/bin/bash

# AI Infrastructure Test Suite Runner
# Runs all tests for the three-tier AI model system
#
# Usage:
#   ./scripts/test-ai-infrastructure.sh [options]
#
# Options:
#   --all          Run all AI infrastructure tests (default)
#   --unit         Run only unit tests (model configuration)
#   --integration  Run only integration tests (AI features)
#   --fallback     Run only fallback mechanism tests
#   --task         Run only Task model tests
#   --benchmark    Run performance benchmark tests
#   --coverage     Run with coverage report
#   --watch        Run in watch mode
#   --verbose      Show detailed output
#
# Examples:
#   ./scripts/test-ai-infrastructure.sh --all
#   ./scripts/test-ai-infrastructure.sh --unit --coverage
#   ./scripts/test-ai-infrastructure.sh --integration --verbose
#   ./scripts/test-ai-infrastructure.sh --benchmark

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
RUN_ALL=true
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_FALLBACK=false
RUN_TASK=false
RUN_BENCHMARK=false
RUN_COVERAGE=false
RUN_WATCH=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      RUN_ALL=true
      shift
      ;;
    --unit)
      RUN_ALL=false
      RUN_UNIT=true
      shift
      ;;
    --integration)
      RUN_ALL=false
      RUN_INTEGRATION=true
      shift
      ;;
    --fallback)
      RUN_ALL=false
      RUN_FALLBACK=true
      shift
      ;;
    --task)
      RUN_ALL=false
      RUN_TASK=true
      shift
      ;;
    --benchmark)
      RUN_ALL=false
      RUN_BENCHMARK=true
      shift
      ;;
    --coverage)
      RUN_COVERAGE=true
      shift
      ;;
    --watch)
      RUN_WATCH=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Print header
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI Infrastructure Test Suite${NC}"
echo -e "${BLUE}  Three-Tier Model System (Primary/Task/Fallback)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Build test command
TEST_CMD="yarn test"
TEST_ARGS=""

# Add coverage flag
if [ "$RUN_COVERAGE" = true ]; then
  TEST_ARGS="$TEST_ARGS --coverage"
  echo -e "${YELLOW}📊 Running with coverage report${NC}"
fi

# Add watch flag
if [ "$RUN_WATCH" = true ]; then
  TEST_ARGS="$TEST_ARGS --watch"
  echo -e "${YELLOW}👁️  Running in watch mode${NC}"
fi

# Add verbose flag
if [ "$VERBOSE" = true ]; then
  TEST_ARGS="$TEST_ARGS --verbose"
  echo -e "${YELLOW}📢 Verbose output enabled${NC}"
fi

echo ""

# Function to run specific test file
run_test() {
  local test_name=$1
  local test_file=$2

  echo -e "${BLUE}▶ Running ${test_name}...${NC}"

  if [ "$VERBOSE" = true ]; then
    $TEST_CMD $test_file $TEST_ARGS
  else
    # Capture output to show errors if test fails
    TEST_OUTPUT=$($TEST_CMD $test_file $TEST_ARGS 2>&1)
    TEST_EXIT_CODE=$?

    if [ $TEST_EXIT_CODE -eq 0 ]; then
      # On success, show summary only
      echo "$TEST_OUTPUT" | grep -E "(PASS|FAIL|Test Suites|Tests:)"
    else
      # On failure, show full output for debugging
      echo "$TEST_OUTPUT"
    fi

    return $TEST_EXIT_CODE
  fi

  TEST_EXIT_CODE=$?

  if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ ${test_name} passed${NC}"
  else
    echo -e "${RED}✗ ${test_name} failed${NC}"
    echo -e "${YELLOW}💡 Run with --verbose for more details${NC}"
    exit 1
  fi

  echo ""
}

# Run tests based on options
if [ "$RUN_ALL" = true ]; then
  echo -e "${GREEN}Running all AI infrastructure tests...${NC}"
  echo ""

  run_test "Model Configuration Tests" "server/routes/api/ai/__tests__/modelConfig.test.ts"
  run_test "Fallback Mechanism Tests" "server/routes/api/ai/__tests__/fallback.test.ts"
  run_test "AI Features Integration Tests" "server/routes/api/ai/__tests__/aiFeatures.integration.test.ts"
  run_test "Task Model Tests" "server/routes/api/ai/__tests__/taskModel.test.ts"
  run_test "Existing AI Permission Tests" "server/routes/api/ai/ai.test.ts"

else
  if [ "$RUN_UNIT" = true ]; then
    run_test "Model Configuration Tests" "server/routes/api/ai/__tests__/modelConfig.test.ts"
  fi

  if [ "$RUN_INTEGRATION" = true ]; then
    run_test "AI Features Integration Tests" "server/routes/api/ai/__tests__/aiFeatures.integration.test.ts"
  fi

  if [ "$RUN_FALLBACK" = true ]; then
    run_test "Fallback Mechanism Tests" "server/routes/api/ai/__tests__/fallback.test.ts"
  fi

  if [ "$RUN_TASK" = true ]; then
    run_test "Task Model Tests" "server/routes/api/ai/__tests__/taskModel.test.ts"
  fi

  if [ "$RUN_BENCHMARK" = true ]; then
    run_test "LLM Performance Benchmarks" "server/routes/api/ai/__tests__/llm.benchmark.test.ts"
    run_test "Workflow Benchmarks" "server/routes/api/ai/__tests__/workflow.benchmark.test.ts"
  fi
fi

# Print summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All AI infrastructure tests passed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Print coverage summary if enabled
if [ "$RUN_COVERAGE" = true ]; then
  echo -e "${YELLOW}📊 Coverage report generated in coverage/lcov-report/index.html${NC}"
  echo ""
fi

# Print model context info
echo -e "${BLUE}Model Context Windows:${NC}"
echo -e "  Primary (zai-glm-4.6):     200k tokens"
echo -e "  Task (qwen3-30b-a3b-inst): 15k tokens"
echo -e "  Fallback (GLM-4.6):        200k tokens"
echo ""

echo -e "${GREEN}Test suite completed successfully!${NC}"
