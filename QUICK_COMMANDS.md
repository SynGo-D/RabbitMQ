# Quick Command Reference for Testing (Unit / Integration / E2E)

## TL;DR - Just Run These Commands

### Setup (First Time Only)

```bash
# Terminal 1: Start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Wait 5 seconds
timeout 5

# Terminal 2: Setup project
cd d:\Projects_CSE\S5-Project\RabbitMQ
npm install
echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env
```

### Run All Tests

```bash
# Terminal 2: Run ALL tests (unit + integration + e2e)
npm test
```

### Run Specific Test Type

```bash
# Unit tests only (no RabbitMQ needed)
npm run test:unit

# Integration tests only (requires RabbitMQ)
npm run test:integration

# E2E tests only (requires RabbitMQ + full server)
npm run test:e2e
```

---

## All Available Commands

### Installation
```bash
npm install
```

### Testing
```bash
# All tests (unit + integration + e2e)
npm test

# Unit tests only (no RabbitMQ needed)
npm run test:unit

# Integration tests only (requires RabbitMQ)
npm run test:integration

# E2E tests only (requires RabbitMQ + server)
npm run test:e2e

# Run specific test by name (unit test)
node --import tsx --test src/rabbitmq/connection.test.ts --grep "isRabbitMQConnected"

# Run specific test by name (integration test)
node --import tsx --test src/rabbitmq/integration.test.ts --grep "Publish and consume"

# Run specific test by name (E2E test)
node --import tsx --test src/e2e.test.ts --grep "health check"

# Verbose output
node --import tsx --test src/e2e.test.ts --verbose
```

### E2E Testing

**What is E2E Testing?**
End-to-End tests start the actual HTTP server and make real requests to verify the complete workflow from client → HTTP → RabbitMQ → consumer.

**E2E vs Integration vs Unit:**
- **Unit Tests**: Test individual functions (no dependencies)
- **Integration Tests**: Test RabbitMQ interactions (direct library calls)
- **E2E Tests**: Test complete workflow (HTTP requests + server + RabbitMQ)

**E2E Test Scenarios:**
1. Server health check
2. Publish message via HTTP and consume
3. Multiple messages in order
4. Message retry and dead-letter routing
5. Large message handling
6. Concurrent requests
7. Connection recovery

**Run E2E Tests:**
```bash
npm run test:e2e
```

**Expected E2E Output:**
```
✔ E2E: Server health check
✔ E2E: Publish message via HTTP and consume it
✔ E2E: Multiple messages are processed in order
✔ E2E: Failed message is retried and dead-lettered
✔ E2E: Health check reports disconnected when no RabbitMQ
✔ E2E: Large message is handled correctly
✔ E2E: Concurrent messages from multiple requests
✔ E2E: Connection recovers after handler error

ℹ tests 8
ℹ pass 8
ℹ fail 0
ℹ duration_ms 14234ms
```

**E2E Test Duration:** ~14 seconds total

**See Full E2E Guide:** Read [E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md) for comprehensive documentation.

### Development
```bash
# Start dev server on port 5000
npm run dev

# Build TypeScript
npm build

# Run compiled app
npm start
```

### Docker/RabbitMQ
```bash
# Start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Check if running
docker ps | grep rabbitmq

# View logs
docker logs rabbitmq

# Stop RabbitMQ
docker stop rabbitmq

# Remove container
docker rm rabbitmq

# Restart
docker restart rabbitmq
```

### Troubleshooting
```bash
# Check RabbitMQ connectivity
curl http://localhost:15672/

# Check specific port
telnet localhost 5672

# View detailed logs
docker logs -f rabbitmq

# Full restart
docker stop rabbitmq && docker rm rabbitmq && docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

---

## Test Results Explained

### ✅ Unit Tests Success
```
✔ isRabbitMQConnected() is false before connecting
✔ getChannel() throws a clear error before connecting
✔ publish() rejects if RabbitMQ has not been initialized yet
✔ consume() rejects if RabbitMQ has not been initialized yet
✔ onDeadLetter() rejects if RabbitMQ has not been initialized yet
✔ dead-letter queue name is derived correctly
✔ DeadLetterMetadata has all required fields
✔ every queue name is a non-empty string
✔ no two queues accidentally share the same name
✔ publishToChannel() serializes the complete message as JSON
✔ publishToChannel() publishes to the requested queue as persistent
✔ consumer acknowledges a message after its handler succeeds
✔ invalid JSON is requeued with its first retry count
✔ failed messages increment the existing retry count
✔ a message beyond the retry limit is routed to the dead-letter queue
✔ dead-letter handler receives parsed data and broker metadata
✔ dead-letter message is negatively acknowledged when its handler fails

ℹ tests 17
ℹ pass 17
ℹ fail 0
```

### ✅ Integration Tests Success
```
✔ Integration: Publish and consume a message
✔ Integration: Message retry on handler failure
✔ Integration: Dead-letter queue routing
✔ Integration: Multiple messages in sequence
✔ Integration: Message with complex object
✔ Integration: Queue persists across reconnects

ℹ tests 6
ℹ pass 6
ℹ fail 0
```

### ✅ E2E Tests Success
```
✔ E2E: Server health check
✔ E2E: Publish message via HTTP and consume it
✔ E2E: Multiple messages are processed in order
✔ E2E: Failed message is retried and dead-lettered
✔ E2E: Health check reports disconnected when no RabbitMQ
✔ E2E: Large message is handled correctly
✔ E2E: Concurrent messages from multiple requests
✔ E2E: Connection recovers after handler error

ℹ tests 8
ℹ pass 8
ℹ fail 0
```

### ✅ All Tests Success
```
✔ All tests passing (17 + 6 + 8 = 31 total)
ℹ tests 31
ℹ pass 31
ℹ fail 0
ℹ duration_ms 28000ms (approx 28 seconds total)
```

### ❌ Failure Troubleshooting
```
✖ E2E: Publish message via HTTP and consume it
  Error: Timeout waiting for condition
```

**Fix:** Check RabbitMQ: `docker ps | grep rabbitmq`

---

## Environment Variables (in .env)

```
PORT=5000
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

## Manual API Testing

```bash
# Start server
npm run dev

# In another terminal, publish a message
curl -X POST http://localhost:5000/test-publish \
  -H "Content-Type: application/json" \
  -d '{"repository":"test-repo","prNumber":1,"provider":"github"}'

# Check health
curl http://localhost:5000/health
```

---

## Watch in Browser

While tests run, open:
```
http://localhost:15672
```

Login: `guest` / `guest`

Click "Queues" to see test queues being created/deleted in real-time.

---

## Complete Walkthrough

```bash
# 1. Start RabbitMQ (Terminal 1)
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
sleep 5

# 2. Setup (Terminal 2)
cd d:\Projects_CSE\S5-Project\RabbitMQ
npm install
echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env

# 3. Run tests (Terminal 2)
npm run test:integration

# 4. View results (should see 6 ✔ marks)

# 5. Browse RabbitMQ (Browser)
# Open: http://localhost:15672
# Login: guest/guest

# 6. Cleanup (Terminal 1)
docker stop rabbitmq
docker rm rabbitmq
```

---

## Tests Overview

| # | Test | What It Tests | Time |
|---|------|---------------|------|
| 1 | Publish and consume | Basic message flow | ~1s |
| 2 | Retry on failure | Automatic retries | ~1s |
| 3 | Dead-letter routing | Failed message handling | ~2s |
| 4 | Sequence | Multiple messages | ~1s |
| 5 | Complex object | Real job objects | ~1s |
| 6 | Persistence | Messages survive reconnect | ~2s |

**Total time: ~10-15 seconds**

---

## Expected Output

```
D:\Projects_CSE\S5-Project\RabbitMQ> npm run test:integration

> rabbitmq@1.0.0 test:integration
> node --import tsx --test src/rabbitmq/integration.test.ts

✔ Integration: Publish and consume a message (1234ms)
✔ Integration: Message retry on handler failure (2105ms)
✔ Integration: Dead-letter queue routing (3456ms)
✔ Integration: Multiple messages in sequence (1567ms)
✔ Integration: Message with complex object (1234ms)
✔ Integration: Queue persists across reconnects (2345ms)

ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12000.5161
```

---

## Stopping Everything

```bash
# Stop RabbitMQ
docker stop rabbitmq

# Remove container
docker rm rabbitmq

# Clean .env
rm .env

# Done!
```

---

## Windows PowerShell Tips

If using PowerShell, use backticks for line continuation:

```powershell
docker run -d `
  --hostname rabbitmq `
  --name rabbitmq `
  -p 5672:5672 `
  -p 15672:15672 `
  rabbitmq:3-management
```

---

## Pro Tips

1. **Keep RabbitMQ running** - Start it once, leave it running
2. **Watch UI while testing** - Open `localhost:15672` to see queues in real-time
3. **Check logs if tests fail** - `docker logs rabbitmq`
4. **Test in isolation** - Each test uses unique queue name with timestamp
5. **Parallel testing** - Tests run sequentially for simplicity

---

## Next Commands to Run

```bash
# 1. Start RabbitMQ NOW
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 2. After 5 seconds, run this
npm run test:integration

# 3. Watch the magic happen! ✨
```

Ready? Go! 🚀
