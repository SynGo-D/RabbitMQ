# End-to-End (E2E) Testing Guide

## Overview

End-to-End (E2E) tests verify the complete workflow from HTTP client requests through the entire RabbitMQ pipeline. Unlike unit tests (which test components in isolation) and integration tests (which test RabbitMQ interactions), E2E tests start the actual server and make real HTTP requests.

## What E2E Tests Do

E2E tests validate:
- ✅ HTTP endpoints work correctly
- ✅ Server startup and initialization
- ✅ Message publishing via REST API
- ✅ Message consumption and delivery
- ✅ Retry logic and dead-letter routing
- ✅ Error recovery and resilience
- ✅ Concurrent request handling
- ✅ Large message handling
- ✅ Health check accuracy

## Prerequisites

Before running E2E tests, ensure:

1. **RabbitMQ is running**
   ```bash
   docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   ```

2. **.env is configured**
   ```bash
   echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env
   ```

3. **Dependencies installed**
   ```bash
   npm install
   ```

## Quick Start

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific E2E Test

```bash
node --import tsx --test src/e2e.test.ts --grep "Publish message via HTTP"
```

### Run with Verbose Output

```bash
node --import tsx --test src/e2e.test.ts --verbose
```

## E2E Tests Explained

### 1. Server Health Check

**What it tests:** Health endpoint works and reports correct RabbitMQ status

```typescript
test("E2E: Server health check", async () => {
    // Starts server
    // Calls GET /health
    // Verifies status: ok, rabbitmq: connected
});
```

**Command:** `npm run test:e2e --grep "health check"`

**Expected Output:**
```json
{
  "status": "ok",
  "rabbitmq": "connected",
  "timestamp": "2026-09-23T..."
}
```

---

### 2. Publish and Consume

**What it tests:** Complete message flow from HTTP POST to consumption

```typescript
test("E2E: Publish message via HTTP and consume it", async () => {
    // 1. Start server
    // 2. Register consumer
    // 3. POST message to /test-publish
    // 4. Consumer receives and verifies message
    // 5. Cleanup
});
```

**Command:** `npm run test:e2e --grep "Publish message via HTTP"`

**Flow Diagram:**
```
HTTP POST /test-publish
        ↓
    Express App
        ↓
    publish() function
        ↓
    RabbitMQ Queue
        ↓
    consume() handler
        ↓
    Message processed
```

---

### 3. Message Ordering

**What it tests:** Messages are processed in FIFO order

```typescript
test("E2E: Multiple messages are processed in order", async () => {
    // Publishes 5 messages
    // Verifies they're consumed in order: 1, 2, 3, 4, 5
});
```

**Command:** `npm run test:e2e --grep "in order"`

---

### 4. Retry and Dead-Letter

**What it tests:** Failed messages are retried 3 times, then dead-lettered

```typescript
test("E2E: Failed message is retried and dead-lettered", async () => {
    // 1. Consumer throws error 3 times
    // 2. Message retried 3 times automatically
    // 3. On 4th failure, moved to dead-letter queue
    // 4. Dead-letter handler called with metadata
    // 5. Verify retry count = 4
});
```

**Command:** `npm run test:e2e --grep "retried and dead-lettered"`

**Retry Timeline:**
```
Attempt 1: Handler throws → Retry with count: 1
Attempt 2: Handler throws → Retry with count: 2
Attempt 3: Handler throws → Retry with count: 3
Attempt 4: Handler throws → Move to dead-letter queue (count: 4)
```

---

### 5. Health Without RabbitMQ

**What it tests:** Server still starts and reports correct status if RabbitMQ is down

```typescript
test("E2E: Health check reports disconnected when no RabbitMQ", async () => {
    // Don't initialize RabbitMQ
    // Start server
    // Verify rabbitmq: "disconnected"
});
```

**Command:** `npm run test:e2e --grep "disconnected when no RabbitMQ"`

---

### 6. Large Message Handling

**What it tests:** Large and complex messages are serialized/deserialized correctly

```typescript
test("E2E: Large message is handled correctly", async () => {
    // Creates 1KB+ message with nested objects
    // Publishes via HTTP
    // Verifies complete message is received
});
```

**Command:** `npm run test:e2e --grep "Large message"`

---

### 7. Concurrent Requests

**What it tests:** Server handles multiple simultaneous requests

```typescript
test("E2E: Concurrent messages from multiple requests", async () => {
    // Publishes 10 messages concurrently (Promise.all)
    // Verifies all 10 are consumed
    // Works even though order may vary
});
```

**Command:** `npm run test:e2e --grep "Concurrent messages"`

---

### 8. Error Recovery

**What it tests:** Server stays healthy after handler errors

```typescript
test("E2E: Connection recovers after handler error", async () => {
    // 1. Publish message 1 (handler throws)
    // 2. Check health → still connected
    // 3. Publish message 2 (handler succeeds)
    // 4. Verify everything still works
});
```

**Command:** `npm run test:e2e --grep "recovers after handler error"`

---

## Running Tests Step-by-Step

### Complete Walkthrough

```bash
# Terminal 1: Start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Wait 5 seconds for startup
sleep 5

# Terminal 2: Setup project
cd d:\Projects_CSE\S5-Project\RabbitMQ
npm install
echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env

# Run E2E tests
npm run test:e2e

# You should see 8 ✔ marks:
# ✔ E2E: Server health check
# ✔ E2E: Publish message via HTTP and consume it
# ✔ E2E: Multiple messages are processed in order
# ✔ E2E: Failed message is retried and dead-lettered
# ✔ E2E: Health check reports disconnected when no RabbitMQ
# ✔ E2E: Large message is handled correctly
# ✔ E2E: Concurrent messages from multiple requests
# ✔ E2E: Connection recovers after handler error
```

## Expected Output

```
D:\Projects_CSE\S5-Project\RabbitMQ> npm run test:e2e

> rabbitmq@1.0.0 test:e2e
> node --import tsx --test src/e2e.test.ts

✔ E2E: Server health check (1234ms)
✔ E2E: Publish message via HTTP and consume it (2105ms)
✔ E2E: Multiple messages are processed in order (1567ms)
✔ E2E: Failed message is retried and dead-lettered (3456ms)
✔ E2E: Health check reports disconnected when no RabbitMQ (456ms)
✔ E2E: Large message is handled correctly (1234ms)
✔ E2E: Concurrent messages from multiple requests (2345ms)
✔ E2E: Connection recovers after handler error (1567ms)

ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14234.5161
```

## Test Utilities

The E2E test file includes helper functions:

### `startTestServer()`
Starts Express server on port 5001

```typescript
await startTestServer();
```

### `stopTestServer()`
Stops the Express server

```typescript
await stopTestServer();
```

### `httpPost(path, data)`
Makes POST request to server

```typescript
const result = await httpPost("/test-publish", { id: 1 });
// Returns: { status: 200, body: { status: "published" } }
```

### `httpGet(path)`
Makes GET request to server

```typescript
const result = await httpGet("/health");
// Returns: { status: 200, body: { status: "ok", rabbitmq: "connected" } }
```

### `waitFor(condition, timeoutMs)`
Waits for condition to become true or timeout

```typescript
await waitFor(() => messageCount === 5, 5000);
```

## Debugging Failed Tests

### If Test Fails: "RabbitMQ connection failed"

```bash
# Check RabbitMQ is running
docker ps | grep rabbitmq

# If not running, start it
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Check logs
docker logs rabbitmq
```

### If Test Fails: "Timeout waiting for condition"

```bash
# Test waited too long for message consumption
# Possible causes:
# 1. RabbitMQ is slow (check docker logs rabbitmq)
# 2. Consumer handler crashed (check console output)
# 3. Network connectivity issue

# Increase timeout in test:
await waitFor(() => condition, 10000); // 10 seconds instead of 5
```

### If Test Fails: "Port already in use"

```bash
# Another process is using port 5001
# Find and kill it:
netstat -ano | findstr :5001
taskkill /PID <PID> /F

# Or change TEST_PORT in e2e.test.ts
```

## Test Isolation

Each test:
- ✅ Starts fresh server instance
- ✅ Uses unique queue names (with timestamp)
- ✅ Cleans up after itself
- ✅ Closes all connections

**No test pollution** - Tests can run in any order

## Performance Considerations

| Test | Duration | Why |
|------|----------|-----|
| Health check | ~400ms | Quick server startup |
| Publish and consume | ~1500ms | Network + message delivery |
| Message ordering | ~2000ms | 5 messages × processing |
| Retry and dead-letter | ~3500ms | 4 retry attempts |
| Large message | ~1200ms | Serialization overhead |
| Concurrent | ~2300ms | 10 concurrent requests |

**Total E2E suite: ~14 seconds**

## Running Tests in CI/CD

For GitHub Actions or other CI systems:

```yaml
# .github/workflows/test.yml
- name: Start RabbitMQ
  run: docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

- name: Setup
  run: |
    npm install
    echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env

- name: Run E2E Tests
  run: npm run test:e2e
```

## Test Coverage

E2E tests cover:

| Component | Coverage |
|-----------|----------|
| Express Server | ✅ Full |
| HTTP Endpoints | ✅ Full |
| Message Publishing | ✅ Full |
| Message Consumption | ✅ Full |
| Retry Logic | ✅ Full |
| Dead-Letter Routing | ✅ Full |
| Connection Management | ✅ Full |
| Error Handling | ✅ Full |
| Concurrent Operations | ✅ Full |

## Commands Reference

```bash
# All tests (unit + integration + e2e)
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires RabbitMQ)
npm run test:integration

# E2E tests only (requires RabbitMQ + server)
npm run test:e2e

# Specific E2E test
node --import tsx --test src/e2e.test.ts --grep "health check"

# With verbose output
node --import tsx --test src/e2e.test.ts --verbose

# With watch mode (not recommended for E2E - use dev server instead)
npm run dev
```

## Next Steps

After E2E tests pass:

1. ✅ **All unit tests passing** (`npm run test:unit`)
2. ✅ **All integration tests passing** (`npm run test:integration`)
3. ✅ **All E2E tests passing** (`npm run test:e2e`)

Your RabbitMQ service is **production-ready**! 🚀

## Architecture: Testing Pyramid

```
        ╔═══════════════════╗
        ║   E2E Tests (8)   │  Complete workflows
        ║   Server + HTTP   │  ~14 seconds
        ╚═══════════════════╝
             △ △ △ △ △ △
    ╔═════════════════════════════╗
    │  Integration Tests (6)       │  RabbitMQ interactions
    │  No HTTP server              │  ~12 seconds
    ╚═════════════════════════════╝
      △ △ △ △ △ △ △ △ △ △
 ╔═════════════════════════════════════╗
 │      Unit Tests (9)                 │  Individual functions
 │      No dependencies                │  ~1 second
 ╚═════════════════════════════════════╝
```

## Summary

E2E tests validate the complete RabbitMQ service:
- ✅ 8 comprehensive test scenarios
- ✅ ~14 second total runtime
- ✅ Tests real HTTP requests and message flow
- ✅ Covers success, failure, and recovery cases
- ✅ Verifies concurrent operations
- ✅ Production-ready validation

**Ready to test? Run:** `npm run test:e2e` 🎉
