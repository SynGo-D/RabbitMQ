# Integration Testing Guide

## Overview

Integration tests verify the **complete message flow** using a real RabbitMQ instance. Unlike unit tests, these test:

- ✅ Publishing and consuming messages end-to-end
- ✅ Retry logic with actual message re-queuing
- ✅ Dead-letter queue routing
- ✅ Message persistence across reconnects
- ✅ Multiple messages in sequence

## Prerequisites

You need:
1. **Docker** - to run RabbitMQ
2. **Node.js 18+** - already have this
3. **npm** - already have this

## Step-by-Step Instructions

### Step 1: Start RabbitMQ in Docker

Open a **new terminal** and run:

```bash
docker run -d \
  --hostname rabbitmq \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

**What this does:**
- `-d`: Run in background
- `--hostname rabbitmq`: RabbitMQ server hostname
- `--name rabbitmq`: Container name (use `docker stop rabbitmq` to stop it)
- `-p 5672:5672`: AMQP port (for message connections)
- `-p 15672:15672`: Management UI port
- `rabbitmq:3-management`: Image with management plugin

**Verify RabbitMQ is running:**

```bash
docker ps | grep rabbitmq
```

You should see the container listed.

**Verify connectivity:**

```bash
curl http://localhost:15672/api/overview
```

If you get JSON output, RabbitMQ is ready! 🎉

---

### Step 2: Create `.env` File

In the RabbitMQ project root, create `.env`:

```bash
cat > .env << 'EOF'
PORT=5000
RABBITMQ_URL=amqp://guest:guest@localhost:5672
EOF
```

Or manually create the file with:
```
PORT=5000
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

### Step 3: Install Dependencies

```bash
npm install
```

---

### Step 4: Run Integration Tests

Now run the integration tests:

```bash
npm run test:integration
```

### Alternative: Run Tests Individually

**Run a specific test:**

```bash
node --import tsx --test src/rabbitmq/integration.test.ts --grep "Publish and consume"
```

**Run with verbose output:**

```bash
node --import tsx --test src/rabbitmq/integration.test.ts --reporter tap
```

---

## Available Test Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests (unit + integration) |
| `npm run test:unit` | Run only unit tests (no RabbitMQ needed) |
| `npm run test:integration` | Run only integration tests (requires RabbitMQ) |
| `npm run dev` | Start dev server (manually test with API) |

---

## What Each Integration Test Does

### Test 1: Publish and Consume

```
1. Connect to RabbitMQ
2. Create test queue
3. Register consumer
4. Publish message: { hello: "world" }
5. Verify message received
6. Clean up and disconnect
```

**Expected output:**
```
✔ Integration: Publish and consume a message
```

---

### Test 2: Message Retry on Failure

```
1. Connect to RabbitMQ
2. Create test queue
3. Register consumer that fails first 2 times
4. Publish message
5. Verify message is retried (automatic)
6. Success on 3rd attempt
```

**Expected output:**
```
✔ Integration: Message retry on handler failure
```

---

### Test 3: Dead-Letter Queue Routing

```
1. Connect to RabbitMQ
2. Create test queue + dead-letter queue
3. Register dead-letter handler
4. Register consumer that always fails
5. Publish message
6. Wait for retries (3 attempts)
7. Verify message moved to dead-letter queue
8. Verify dead-letter handler called
```

**Expected output:**
```
✔ Integration: Dead-letter queue routing
```

---

### Test 4: Multiple Messages in Sequence

```
1. Connect to RabbitMQ
2. Create test queue
3. Register consumer
4. Publish 3 messages in sequence
5. Verify all 3 received in order
```

**Expected output:**
```
✔ Integration: Multiple messages in sequence
```

---

### Test 5: Complex Object Message

```
1. Connect to RabbitMQ
2. Create test queue
3. Register consumer
4. Publish complex object (like PRJob)
5. Verify object received intact
```

**Expected output:**
```
✔ Integration: Message with complex object
```

---

### Test 6: Persistence Across Reconnects

```
1. Connect to RabbitMQ
2. Create durable queue
3. Publish message
4. Close connection
5. Reconnect
6. Register consumer
7. Verify message still there (was persisted)
```

**Expected output:**
```
✔ Integration: Queue persists across reconnects
```

---

## Complete Hands-On Walkthrough

### Session 1: Setup and First Test

```bash
# Terminal 1: Start RabbitMQ
docker run -d \
  --hostname rabbitmq \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management

# Wait 5 seconds for RabbitMQ to start
sleep 5

# Verify it's running
docker ps | grep rabbitmq

# Terminal 2: Setup project
cd d:\Projects_CSE\S5-Project\RabbitMQ
npm install

# Create .env file
echo "PORT=5000" > .env
echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" >> .env

# Run integration tests
npm run test:integration
```

**Expected result:**
```
✅ All 6 integration tests pass
✅ Total time: ~5-10 seconds
```

---

### Session 2: Monitor in RabbitMQ UI

While tests are running, open the RabbitMQ management UI:

```
http://localhost:15672
```

- **Username:** `guest`
- **Password:** `guest`

**What to look for:**
1. Click "Queues and Streams" tab
2. You'll see test queues being created/deleted:
   - `test_publish_consume_*`
   - `test_retry_logic_*`
   - `test_deadletter_*` (and `test_deadletter_*.dead_letter`)
3. Watch message counts change in real-time
4. See queues disappear after tests finish

---

### Session 3: Manual Testing with API

Start the dev server and test manually:

```bash
# Terminal 2: Start dev server
npm run dev

# Terminal 3: Publish a message via API
curl -X POST http://localhost:5000/test-publish \
  -H "Content-Type: application/json" \
  -d '{"repository":"test","prNumber":1,"provider":"github"}'

# Watch server logs for message received
```

---

## Troubleshooting

### Problem: "RabbitMQ connection refused"

**Solution:** Verify RabbitMQ is running:
```bash
docker ps | grep rabbitmq
```

If not running, start it:
```bash
docker start rabbitmq
```

---

### Problem: "Connection timeout"

**Solution:** Check RabbitMQ connectivity:
```bash
docker logs rabbitmq

# or test the port
curl http://localhost:15672/
```

---

### Problem: Tests hang or timeout

**Solution:** RabbitMQ might be stuck. Restart it:
```bash
docker restart rabbitmq
sleep 5
npm run test:integration
```

---

### Problem: "Port 5672 already in use"

**Solution:** Another container is using the port. Stop it:
```bash
docker stop rabbitmq
docker rm rabbitmq
docker run -d --hostname rabbitmq --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

---

### Problem: Windows PowerShell line continuation issues

Use backticks for line continuation in PowerShell:

```powershell
docker run -d `
  --hostname rabbitmq `
  --name rabbitmq `
  -p 5672:5672 `
  -p 15672:15672 `
  rabbitmq:3-management
```

---

## Clean Up

### Stop RabbitMQ

```bash
docker stop rabbitmq
```

### Remove RabbitMQ container

```bash
docker rm rabbitmq
```

### Remove everything

```bash
docker stop rabbitmq
docker rm rabbitmq
rm .env
```

---

## Test Output Interpretation

### Success Output
```
✅ Tests 6
✅ Suites 0
✅ Pass 6
❌ Fail 0
⏱️ Duration: 5000ms
```

### Failure Output
```
❌ Integration: Dead-letter queue routing
   Error: Timeout waiting for condition
   Expected: 1 dead-lettered message
   Actual: 0
```

If a test fails, check:
1. RabbitMQ is running: `docker ps | grep rabbitmq`
2. Connectivity: `curl http://localhost:15672/`
3. `.env` file exists and has correct `RABBITMQ_URL`
4. Check RabbitMQ logs: `docker logs rabbitmq`

---

## Running Tests in CI/CD

For automated testing (GitHub Actions, etc):

```bash
# Start RabbitMQ in background
docker run -d -p 5672:5672 rabbitmq:3

# Wait for startup
sleep 5

# Run tests
npm install
npm run test:integration
```

---

## Performance Notes

- Each test takes ~1-2 seconds
- Total suite runs in ~10-15 seconds
- Tests run in sequence (not parallel)
- Each test uses a unique queue name with timestamp

---

## Files Involved

| File | Purpose |
|------|---------|
| `integration.test.ts` | Integration test suite (6 tests) |
| `package.json` | Test scripts and dependencies |
| `.env` | RabbitMQ connection URL |
| Docker container | Running RabbitMQ instance |

---

## Next Steps

After passing integration tests:

1. ✅ **Unit tests** - Basic functionality checks
2. ✅ **Integration tests** - Full message flow with real RabbitMQ
3. 🔜 **Load tests** - Publish 1000s of messages
4. 🔜 **Chaos tests** - Disconnect/reconnect stress
5. 🔜 **E2E tests** - Test with real microservices

---

## Quick Reference

```bash
# Start RabbitMQ
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Create .env
echo "RABBITMQ_URL=amqp://guest:guest@localhost:5672" > .env

# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run unit tests only
npm run test:unit

# View RabbitMQ UI
# Open browser: http://localhost:15672 (guest/guest)

# Stop RabbitMQ
docker stop rabbitmq
```

---

## Summary

You now have:

✅ **6 comprehensive integration tests**
✅ **Step-by-step setup guide**
✅ **Troubleshooting section**
✅ **CI/CD ready commands**
✅ **Performance notes**
✅ **Hands-on walkthrough**

Ready to test! 🚀
