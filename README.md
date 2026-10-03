# RabbitMQ

This is the shared RabbitMQ communication layer for the CodePulse
backend microservices. It is not a service that does any code
review or debt calculation itself - it just gives every other
microservice (Webhook Listener, Worker, Analysis Engine, Result
Collector, Debt Calculation, Notification, Main Backend) a simple,
consistent way to publish and consume messages through RabbitMQ.

## What's in here

```
src/
  app.ts                 Small Express app used for local testing (health check, test-publish route)
  server.ts              Entry point - connects to RabbitMQ, then starts the Express app
  rabbitmq/
    connection.ts        Opens/holds the RabbitMQ connection and channel, auto-reconnects
    publisher.ts         publish(queue, message) - send a message to a queue
    consumer.ts           consume(queue, handler) - listen to a queue, with retry + dead-letter handling
    deadletter.ts        onDeadLetter(queue, handler) - handle messages that failed after retries
    queues.ts             The list of every queue name used across the system
    types.ts               TypeScript interfaces describing what each queue's messages look like
    index.ts               initializeRabbitMQ() - connects and declares all queues
```

## Running it locally

1. Make sure RabbitMQ is running (for example, via Docker):
   ```
   docker run -d --hostname rabbitmq --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   ```
2. Copy `.env.example` to `.env` and adjust `RABBITMQ_URL` if needed.
3. Install dependencies and start the dev server:
   ```
   npm install
   npm run dev
   ```
4. Check `http://localhost:5000/health` - it should report `"rabbitmq": "connected"`.

## How to use this from another service

### Publishing a message

```ts
import { publish } from "./rabbitmq/publisher";
import { QUEUES } from "./rabbitmq/queues";
import type { PRJob } from "./rabbitmq/types";

const job: PRJob = {
    repository: "SynGo-D/example-repo",
    cloneUrl: "https://github.com/SynGo-D/example-repo.git",
    commit: "abc123",
    branch: "main",
    prNumber: 42,
    provider: "github",
    timestamp: new Date().toISOString(),
};

await publish(QUEUES.PR_QUEUE, job);
```

### Consuming messages

```ts
import { consume } from "./rabbitmq/consumer";
import { QUEUES } from "./rabbitmq/queues";

await consume(QUEUES.PR_QUEUE, async (data) => {
    // `data` is already parsed from JSON here.
    // Throw an error if the message couldn't be processed -
    // consume() will take care of retrying or dead-lettering it.
});
```

### Handling dead-lettered messages

When a message fails 3 times, it's moved to a dead-letter queue. 
Register a handler to be notified:

```ts
import { onDeadLetter } from "./rabbitmq";
import { QUEUES } from "./rabbitmq/queues";

await onDeadLetter(QUEUES.PR_QUEUE, async (data, metadata) => {
    // Message failed after 3 retries
    console.error("PR job permanently failed:", {
        repository: data.repository,
        prNumber: data.prNumber,
        failureReason: metadata.failureReason,
        retryCount: metadata.retryCount,
    });
    
    // You can:
    // - Send an alert to Slack/PagerDuty
    // - Store in a database for manual review
    // - Create a ticket for investigation
    // - Forward to an admin service
});
```

See [DEAD_LETTER_GUIDE.md](DEAD_LETTER_GUIDE.md) for detailed documentation on dead-letter queues.

## Queues

See [src/rabbitmq/queues.ts](src/rabbitmq/queues.ts) for the full,
commented list of queues and which two services each one connects.
The message shape carried by each queue is documented in
[src/rabbitmq/types.ts](src/rabbitmq/types.ts).

## Reliability behaviour

- **Reconnects automatically.** If the connection to RabbitMQ drops,
  `connection.ts` retries every 5 seconds and re-declares queues /
  re-subscribes consumers once it's back.
- **Retries failed messages.** If a `consume()` handler throws, the
  message is retried up to 3 times.
- **Dead-letters messages that keep failing.** After 3 failed
  attempts, the message is moved to `<queue-name>.dead_letter`
  instead of being retried forever, so it doesn't block the queue.
- **Shuts down gracefully.** On `SIGINT`/`SIGTERM` (e.g. `Ctrl+C`,
  or Docker/Kubernetes stopping the container), the RabbitMQ
  connection is closed cleanly before the process exits.

## Environment variables

| Variable       | Description                              |
|----------------|-------------------------------------------|
| `PORT`         | Port the Express app listens on           |
| `RABBITMQ_URL` | Connection string for the RabbitMQ server |
