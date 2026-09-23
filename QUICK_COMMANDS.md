# Quick Command Reference for Integration Testing

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

### Run Integration Tests

```bash
# Terminal 2: Run integration tests
npm run test:integration
```

---

## All Available Commands

### Installation
```bash
npm install
```

### Testing
```bash
# All tests (unit + integration)
npm test

# Unit tests only (no RabbitMQ needed)
npm run test:unit

# Integration tests only (requires RabbitMQ)
npm run test:integration

# Run specific integration test
node --import tsx --test src/rabbitmq/integration.test.ts --grep "Publish and consume"
```

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

### ✅ Success
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

### ❌ Failure
```
✖ Integration: Dead-letter queue routing
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
