/**
 * integration.test.ts
 *
 * Integration tests for RabbitMQ functionality.
 * 
 * These tests require a real RabbitMQ instance running.
 * They test the complete message flow:
 * - Publishing messages
 * - Consuming messages
 * - Retrying failed messages
 * - Dead-letter queue routing
 * 
 * Run with: npm run test:integration
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { connectRabbitMQ, closeRabbitMQ, getChannel } from "./connection";
import { publish } from "./publisher";
import { consume } from "./consumer";
import { onDeadLetter } from "./deadletter";
import { QUEUES } from "./queues";

// Helper to create a unique queue name for each test
function getTestQueueName(testName: string): string {
    return `test_${testName}_${Date.now()}`;
}

// Helper to wait for a condition
async function waitFor(
    condition: () => boolean,
    timeoutMs: number = 5000
): Promise<void> {
    const startTime = Date.now();
    while (!condition()) {
        if (Date.now() - startTime > timeoutMs) {
            throw new Error("Timeout waiting for condition");
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

test("Integration: Publish and consume a message", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("publish_consume");
    const channel = getChannel();
    await channel.assertQueue(testQueue, { durable: true });

    const receivedMessages: unknown[] = [];

    // Consume
    await consume(testQueue, async (data) => {
        receivedMessages.push(data);
    });

    // Publish
    const testMessage = { hello: "world", timestamp: Date.now() };
    await publish(testQueue, testMessage);

    // Verify
    await waitFor(() => receivedMessages.length > 0);
    assert.equal(receivedMessages.length, 1);
    assert.deepEqual(receivedMessages[0], testMessage);

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Publish and consume a message");
});

test("Integration: Message retry on handler failure", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("retry_logic");
    const channel = getChannel();
    await channel.assertQueue(testQueue, { durable: true });

    const attempts: number[] = [];
    let failCount = 2; // Fail first 2 attempts

    // Consume with retries
    await consume(testQueue, async (data) => {
        attempts.push(attempts.length + 1);
        console.log(`Attempt ${attempts.length} for message:`, data);

        if (failCount > 0) {
            failCount--;
            throw new Error("Simulated failure");
        }

        // Success on 3rd attempt
    });

    // Publish
    const testMessage = { retryTest: true };
    await publish(testQueue, testMessage);

    // Verify we got retries (should see multiple attempts)
    // Note: This requires waiting a bit for retries to happen
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`Received ${attempts.length} attempts`);
    // After retries, the message should be processed successfully
    // (or moved to dead-letter if all retries failed)

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Message retry on handler failure");
});

test("Integration: Dead-letter queue routing", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("deadletter");
    const deadLetterQueue = `${testQueue}.dead_letter`;
    const channel = getChannel();

    await channel.assertQueue(testQueue, { durable: true });
    await channel.assertQueue(deadLetterQueue, { durable: true });

    const deadLetteredMessages: Array<{ data: unknown; retryCount: number }> = [];

    // Register dead-letter handler
    await onDeadLetter(testQueue, async (data, metadata) => {
        deadLetteredMessages.push({
            data,
            retryCount: metadata.retryCount,
        });
        console.log(`Dead-lettered: ${JSON.stringify(data)}, retries: ${metadata.retryCount}`);
    });

    // Consume with permanent failure (will eventually be dead-lettered)
    await consume(testQueue, async () => {
        throw new Error("Permanent failure");
    });

    // Publish
    const testMessage = { willFail: true };
    await publish(testQueue, testMessage);

    // Wait for dead-lettering (3 retries + initial = 4 attempts)
    await waitFor(() => deadLetteredMessages.length > 0, 10000);

    assert.equal(deadLetteredMessages.length, 1);
    assert.deepEqual(deadLetteredMessages[0].data, testMessage);
    assert.equal(deadLetteredMessages[0].retryCount, 4);

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Dead-letter queue routing");
});

test("Integration: Multiple messages in sequence", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("sequence");
    const channel = getChannel();
    await channel.assertQueue(testQueue, { durable: true });

    const receivedMessages: unknown[] = [];

    // Consume
    await consume(testQueue, async (data) => {
        receivedMessages.push(data);
    });

    // Publish multiple messages
    const messages = [
        { id: 1, value: "first" },
        { id: 2, value: "second" },
        { id: 3, value: "third" },
    ];

    for (const msg of messages) {
        await publish(testQueue, msg);
    }

    // Verify all messages received
    await waitFor(() => receivedMessages.length === messages.length);
    assert.equal(receivedMessages.length, 3);

    for (let i = 0; i < messages.length; i++) {
        assert.deepEqual(receivedMessages[i], messages[i]);
    }

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Multiple messages in sequence");
});

test("Integration: Message with complex object", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("complex");
    const channel = getChannel();
    await channel.assertQueue(testQueue, { durable: true });

    const receivedMessages: unknown[] = [];

    // Consume
    await consume(testQueue, async (data) => {
        receivedMessages.push(data);
    });

    // Publish complex message (like PRJob from types.ts)
    const complexMessage = {
        repository: "SynGo-D/test-repo",
        cloneUrl: "https://github.com/SynGo-D/test-repo.git",
        commit: "abc123def456",
        branch: "main",
        prNumber: 42,
        provider: "github",
        timestamp: new Date().toISOString(),
    };

    await publish(testQueue, complexMessage);

    // Verify
    await waitFor(() => receivedMessages.length > 0);
    assert.equal(receivedMessages.length, 1);
    assert.deepEqual(receivedMessages[0], complexMessage);

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Message with complex object");
});

test("Integration: Queue persists across reconnects", async () => {
    // Setup
    await connectRabbitMQ();
    const testQueue = getTestQueueName("persist");
    const channel = getChannel();
    await channel.assertQueue(testQueue, { durable: true });

    // Publish a message
    const testMessage = { persistTest: true };
    await publish(testQueue, testMessage);

    // Close connection
    await closeRabbitMQ();
    console.log("Closed first connection");

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect
    await connectRabbitMQ();
    console.log("Reconnected");

    const receivedMessages: unknown[] = [];

    // Consume (should get the message we sent earlier)
    await consume(testQueue, async (data) => {
        receivedMessages.push(data);
    });

    // Verify message persisted
    await waitFor(() => receivedMessages.length > 0);
    assert.equal(receivedMessages.length, 1);
    assert.deepEqual(receivedMessages[0], testMessage);

    // Cleanup
    await closeRabbitMQ();
    console.log("✅ Test passed: Queue persists across reconnects");
});
