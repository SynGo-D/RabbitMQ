# Dead-Letter Queue Implementation Guide

## Overview

Dead-letter queues (DLQ) are a safety mechanism in RabbitMQ for handling messages that fail repeatedly. When a message fails to process after a maximum number of retries, it's moved to a dead-letter queue instead of being lost or blocking the system.

## How It Works

### The Flow

```
Normal Queue
    ↓
Message Processing
    ↓
Success? → Acknowledge & Remove
    ↓ No
Retry Count < MAX_RETRIES? 
    ↓ Yes
    → Re-queue with retry count
    ↓ No (failed MAX_RETRIES times)
Dead-Letter Queue
    ↓
Admin/Monitoring Handler
```

### Configuration

- **MAX_RETRIES**: 3 (in `consumer.ts`)
- **Dead-Letter Queue Naming**: `{original_queue_name}.dead_letter`
  - Example: `pr_queue` → `pr_queue.dead_letter`

## Current Implementation

### What Happens When a Message Fails

1. **First Failure**: Message is re-queued with `x-retry-count: 1`
2. **Second Failure**: Message is re-queued with `x-retry-count: 2`
3. **Third Failure**: Message is re-queued with `x-retry-count: 3`
4. **Fourth Failure**: Message is moved to dead-letter queue with:
   - `x-retry-count: 4`
   - `x-failed-reason: {error message}`

### Dead-Letter Message Headers

When a message moves to a dead-letter queue, it preserves:
- Original message content
- `x-retry-count`: Number of failed attempts
- `x-failed-reason`: The error message from the last failure

## How to Use It

### Register a Dead-Letter Handler

```typescript
import { onDeadLetter } from "./rabbitmq";
import { QUEUES } from "./rabbitmq/queues";

// When the service starts, register handlers for dead-lettered messages:
await onDeadLetter(QUEUES.PR_QUEUE, async (data, metadata) => {
    console.error("PR job failed after retries:", data);
    console.error("Metadata:", metadata);
    
    // Handle the dead-lettered message:
    // - Log it to a database
    // - Send an alert
    // - Create a ticket for manual review
    // - Re-queue manually after fixes
});
```

### DeadLetterMetadata Structure

```typescript
interface DeadLetterMetadata {
    originalQueue: string;          // "pr_queue"
    deadLetterQueue: string;        // "pr_queue.dead_letter"
    retryCount: number;             // 4 (MAX_RETRIES + 1)
    failureReason?: string;         // "Connection timeout"
    timestamp: string;              // ISO 8601 timestamp
}
```

## Example: Monitoring Failures

Here's how you might handle dead-lettered PR jobs:

```typescript
await onDeadLetter(QUEUES.PR_QUEUE, async (data, metadata) => {
    const prJob = data as PRJob;
    
    // Log to your monitoring system
    console.error(`PR #${prJob.prNumber} permanently failed in ${prJob.repository}`);
    console.error(`Failure reason: ${metadata.failureReason}`);
    console.error(`Retry count: ${metadata.retryCount}`);
    
    // Send an alert
    await sendSlackAlert({
        channel: "#critical-failures",
        message: `PR processing failed after ${metadata.retryCount} retries`,
        prNumber: prJob.prNumber,
        reason: metadata.failureReason,
    });
    
    // Store for analysis
    await saveFailureRecord({
        queue: metadata.originalQueue,
        message: prJob,
        error: metadata.failureReason,
        timestamp: metadata.timestamp,
    });
});
```

## Testing

### Unit Tests

```bash
npm test
```

This runs tests that verify:
- Dead-letter handlers reject if RabbitMQ isn't initialized
- Dead-letter queue names are correctly formatted
- Metadata structure is valid

### Integration Testing (with Real RabbitMQ)

To test the full flow:

1. Start RabbitMQ:
   ```bash
   docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
   ```

2. Start your service:
   ```bash
   npm run dev
   ```

3. Publish a message that will fail:
   ```bash
   curl -X POST http://localhost:5000/test-publish \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. Publish it 4 times to trigger dead-letter routing

5. Check logs to see dead-letter handler invocation

6. View in RabbitMQ Admin Panel:
   - Go to `http://localhost:15672`
   - Username: `guest`, Password: `guest`
   - Navigate to **Queues** to see `*.dead_letter` queues

## Key Features

✅ **Automatic Retry Logic**
- Retries up to 3 times automatically
- Tracks retry count in message headers

✅ **Dead-Letter Routing**
- Failed messages moved to dedicated queues
- Prevents blocking the main queue

✅ **Metadata Preservation**
- Failure reason stored with message
- Retry count and timestamp included

✅ **Reconnection Safety**
- Dead-letter handlers re-registered after reconnect
- No message loss on connection drop

✅ **Graceful Degradation**
- Errors in dead-letter handlers don't crash the system
- Failed dead-letter messages are nack'd for redelivery

## Best Practices

1. **Always register handlers**: Don't rely on messages piling up in dead-letter queues
   ```typescript
   await onDeadLetter(QUEUES.YOUR_QUEUE, handler);
   ```

2. **Log comprehensively**: Include all context for debugging
   ```typescript
   console.error({
       queue: metadata.originalQueue,
       message: data,
       attempts: metadata.retryCount,
       reason: metadata.failureReason,
       timestamp: metadata.timestamp,
   });
   ```

3. **Alert on critical failures**: Notify ops/admins immediately
   ```typescript
   await notifyOps(`Message in ${metadata.deadLetterQueue}`, data);
   ```

4. **Store for analysis**: Keep records to identify patterns
   ```typescript
   await database.deadLetters.insert({ metadata, data });
   ```

5. **Provide manual recovery**: Allow re-queuing after fixes
   ```typescript
   // After admin fixes the issue, they can re-publish the message
   await publish(metadata.originalQueue, data);
   ```

## Troubleshooting

### Messages are not going to dead-letter queue
- Check that MAX_RETRIES (3) has been exceeded
- Verify the handler is registered with `onDeadLetter()`
- Check logs for retry count increments

### Dead-letter handler is not being called
- Verify RabbitMQ is connected: Check `/health` endpoint
- Confirm you called `await onDeadLetter()` during startup
- Check that the original queue name matches exactly

### Messages disappearing from dead-letter queue
- Verify the handler is doing `channel.ack(msg)`
- Check for errors in the handler function
- Ensure handler doesn't throw unhandled errors

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Your Service                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  await consume(QUEUES.PR_QUEUE, handler1)               │
│         ↓                                               │
│  Message processing...                                  │
│         ↓                                               │
│      Success? ─→ ack() ─→ Message removed               │
│         ↓                                               │
│  Retries < 3? ─→ sendToQueue() with retry count++       │
│         ↓                                               │
│  await onDeadLetter(QUEUES.PR_QUEUE, handler2)          │
│         ↓                                               │
│  Move to pr_queue.dead_letter                           │
│         ↓                                               │
│  handler2() is called with message + metadata           │
│         ↓                                               │
│  ack() ─→ Message removed from dead-letter queue        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Files Involved

- **deadletter.ts**: Dead-letter queue consumer and registration logic
- **deadletter.test.ts**: Unit tests for dead-letter functionality
- **consumer.ts**: Original consumer with retry logic (calls handleFailedMessage)
- **index.ts**: Exports `onDeadLetter` function
- **server.ts**: Example handler registration

## Summary

Dead-letter queues are now fully implemented with:
- ✅ Automatic retry logic (3 attempts)
- ✅ Dead-letter queue creation and consumption
- ✅ Metadata tracking (retry count, error reason, timestamp)
- ✅ Handler registration system
- ✅ Reconnection safety
- ✅ Comprehensive logging
- ✅ Unit tests
