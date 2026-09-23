/**
 * e2e.test.ts
 *
 * End-to-End Tests for RabbitMQ Service
 *
 * These tests start the actual server and make real HTTP requests
 * to verify the complete workflow from client → server → RabbitMQ.
 *
 * Prerequisites:
 * - RabbitMQ must be running on localhost:5672
 * - .env must be configured with RABBITMQ_URL
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "http";

import app from "./app.js";
import { initializeRabbitMQ, onDeadLetter } from "./rabbitmq/index.js";
import { consume } from "./rabbitmq/consumer.js";
import { QUEUES } from "./rabbitmq/queues.js";
import { closeRabbitMQ } from "./rabbitmq/connection.js";

// Global server instance for all tests
let server: Server;
const TEST_PORT = 5001; // Different from dev port to avoid conflicts

/**
 * Start the Express server for testing
 */
async function startTestServer(): Promise<void> {
    return new Promise((resolve) => {
        server = app.listen(TEST_PORT, () => {
            console.log(`Test server running on port ${TEST_PORT}`);
            resolve();
        });
    });
}

/**
 * Stop the Express server
 */
async function stopTestServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (server) {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Make HTTP POST request
 */
async function httpPost(
    path: string,
    data: unknown,
    queryParams?: Record<string, string>
): Promise<{ status: number; body: unknown }> {
    let url = `http://localhost:${TEST_PORT}${path}`;
    
    if (queryParams) {
        const params = new URLSearchParams(queryParams);
        url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    const body = await response.json();

    return { status: response.status, body };
}

/**
 * Make HTTP GET request
 */
async function httpGet(path: string): Promise<{ status: number; body: unknown }> {
    const url = `http://localhost:${TEST_PORT}${path}`;

    const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
    });

    const body = await response.json();

    return { status: response.status, body };
}

/**
 * Wait for a condition to be true (with timeout)
 */
async function waitFor(
    condition: () => boolean,
    timeoutMs: number = 5000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (condition()) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for condition (${timeoutMs}ms)`);
}

// ============================================================================
// E2E TESTS
// ============================================================================

test("E2E: Server health check", { concurrency: false }, async () => {
    await initializeRabbitMQ();
    await startTestServer();

    try {
        const result = await httpGet("/health");

        assert.equal(result.status, 200);
        assert.equal((result.body as any).status, "ok");
        assert.equal((result.body as any).rabbitmq, "connected");
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Publish message via HTTP and consume it", { concurrency: false }, async () => {
    const testQueueName = `test_queue_${Date.now()}`;
    let receivedMessage: unknown;

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register a consumer for our test queue
        await consume(testQueueName, async (data: unknown) => {
            receivedMessage = data;
        });

        // Publish via HTTP
        const publishData = {
            repository: "test-org/test-repo",
            prNumber: 123,
            cloneUrl: "https://github.com/test-org/test-repo.git",
            commit: "abc123def456",
            branch: "feature/test",
            provider: "github" as const,
            timestamp: new Date().toISOString(),
        };

        const result = await httpPost("/test-publish", publishData, { queue: testQueueName });

        assert.equal(result.status, 200);
        assert.equal((result.body as any).status, "published");

        // Wait for message to be consumed
        await waitFor(() => receivedMessage !== undefined);

        // Verify the message
        assert.deepEqual(receivedMessage, publishData);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Multiple messages are processed in order", { concurrency: false }, async () => {
    const testQueueName = `test_order_${Date.now()}`;
    const receivedMessages: number[] = [];

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register consumer
        await consume(testQueueName, async (data: unknown) => {
            receivedMessages.push((data as any).id);
        });

        // Publish 5 messages in sequence
        for (let i = 1; i <= 5; i++) {
            await httpPost("/test-publish", { id: i, prNumber: i }, { queue: testQueueName });
        }

        // Wait for all messages to be consumed
        await waitFor(() => receivedMessages.length === 5);

        // Verify order
        assert.deepEqual(receivedMessages, [1, 2, 3, 4, 5]);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Failed message is retried and dead-lettered", { concurrency: false }, async () => {
    const testQueueName = `test_retry_${Date.now()}`;
    const deadLetterQueueName = `${testQueueName}.dead_letter`;
    let attemptCount = 0;
    let deadLetteredMessage: unknown;
    let deadLetterMetadata: any;

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register a consumer that fails the first 3 times
        await consume(testQueueName, async (data: unknown) => {
            attemptCount++;

            if (attemptCount <= 3) {
                // Fail the first 3 attempts
                throw new Error(`Simulated failure #${attemptCount}`);
            }

            throw new Error("Simulated failure after retry limit");
        });

        // Register dead-letter handler
        await onDeadLetter(testQueueName, async (data: unknown, metadata: any) => {
            deadLetteredMessage = data;
            deadLetterMetadata = metadata;
        });

        // Publish a message with queue parameter
        const testMessage = { id: 999, prNumber: 999 };
        await httpPost("/test-publish", testMessage, { queue: testQueueName });

        // Wait for dead-letter handler to be called
        await waitFor(() => deadLetteredMessage !== undefined);

        // Verify the dead-lettered message
        assert.deepEqual(deadLetteredMessage, testMessage);
        assert.equal(deadLetterMetadata.retryCount, 4);
        assert.ok(deadLetterMetadata.failureReason);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Health check reports disconnected when no RabbitMQ", { concurrency: false }, async () => {
    // Don't initialize RabbitMQ - server starts without connection
    await startTestServer();

    try {
        const result = await httpGet("/health");

        assert.equal(result.status, 200);
        assert.equal((result.body as any).status, "ok");
        // RabbitMQ should be disconnected
        assert.equal((result.body as any).rabbitmq, "disconnected");
    } finally {
        await stopTestServer();
    }
});

test("E2E: Large message is handled correctly", { concurrency: false }, async () => {
    const testQueueName = `test_large_${Date.now()}`;
    let receivedMessage: unknown;

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register consumer
        await consume(testQueueName, async (data: unknown) => {
            receivedMessage = data;
        });

        // Create a large message with nested objects
        const largeMessage = {
            repository: "test-repo",
            prNumber: 456,
            metadata: {
                author: "test-user",
                createdAt: new Date().toISOString(),
                description: "A".repeat(1000), // 1KB string
                tags: Array.from({ length: 100 }, (_, i) => `tag-${i}`),
                nested: {
                    level1: {
                        level2: {
                            level3: {
                                value: "deeply nested",
                            },
                        },
                    },
                },
            },
        };

        // Publish via HTTP with queue parameter
        const result = await httpPost("/test-publish", largeMessage, { queue: testQueueName });
        assert.equal(result.status, 200);

        // Wait for consumption
        await waitFor(() => receivedMessage !== undefined);

        // Verify the message
        assert.deepEqual(receivedMessage, largeMessage);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Concurrent messages from multiple requests", { concurrency: false }, async () => {
    const testQueueName = `test_concurrent_${Date.now()}`;
    const receivedMessages: any[] = [];

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register consumer
        await consume(testQueueName, async (data: unknown) => {
            receivedMessages.push((data as any).id);
        });

        // Publish 10 messages concurrently with queue parameter
        const publishPromises = Array.from({ length: 10 }, (_, i) =>
            httpPost("/test-publish", { id: i, prNumber: i }, { queue: testQueueName })
        );

        await Promise.all(publishPromises);

        // Wait for all messages to be consumed
        await waitFor(() => receivedMessages.length === 10);

        // Verify all messages were received (order may vary due to concurrency)
        const receivedIds = receivedMessages.sort((a, b) => a - b);
        assert.deepEqual(receivedIds, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});

test("E2E: Connection recovers after handler error", { concurrency: false }, async () => {
    const testQueueName = `test_recovery_${Date.now()}`;
    let messageCount = 0;

    await initializeRabbitMQ();
    await startTestServer();

    try {
        // Register a consumer
        await consume(testQueueName, async (data: any) => {
            messageCount++;

            if (messageCount === 1) {
                throw new Error("Simulated error in handler");
            }
        });

        // Publish first message with queue parameter (will fail and be retried/dead-lettered)
        await httpPost("/test-publish", { id: 1 }, { queue: testQueueName });

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Health check should still report connected
        const healthResult = await httpGet("/health");
        assert.equal((healthResult.body as any).rabbitmq, "connected");

        // Publish second message with queue parameter (should work fine)
        const result = await httpPost("/test-publish", { id: 2 }, { queue: testQueueName });
        assert.equal(result.status, 200);
    } finally {
        await stopTestServer();
        await closeRabbitMQ();
    }
});
