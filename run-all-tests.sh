#!/bin/bash
# Run all tests with required infrastructure

echo "🚀 Starting test infrastructure..."

# Start CORS proxy on port 9999
echo "Starting CORS proxy on port 9999..."
npx nps proxy.start &
PROXY_PID=$!

# Start Git HTTP mock server on port 8888
echo "Starting Git HTTP mock server on port 8888..."
npx nps gitserver.start &
SERVER_PID=$!

# Wait for servers to be ready
echo "Waiting for servers to start..."
sleep 3

# Verify servers are running
if ! lsof -i:9999 > /dev/null 2>&1; then
  echo "❌ CORS proxy failed to start on port 9999"
  kill $PROXY_PID $SERVER_PID 2>/dev/null
  exit 1
fi

if ! lsof -i:8888 > /dev/null 2>&1; then
  echo "❌ Git mock server failed to start on port 8888"
  kill $PROXY_PID $SERVER_PID 2>/dev/null
  exit 1
fi

echo "✅ Servers ready!"
echo ""
echo "📊 Running all tests..."
echo ""

# Run tests
npx jest --no-coverage

# Capture exit code
TEST_EXIT_CODE=$?

# Cleanup
echo ""
echo "🧹 Stopping servers..."
npx nps proxy.stop
npx nps gitserver.stop

# Additional cleanup (kill any remaining processes)
kill $PROXY_PID $SERVER_PID 2>/dev/null

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Some tests failed (exit code: $TEST_EXIT_CODE)"
fi

exit $TEST_EXIT_CODE
