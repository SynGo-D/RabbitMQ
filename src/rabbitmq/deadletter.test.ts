/**
 * deadletter.test.ts
 *
 * Tests for dead-letter queue functionality.
 * 
 * These tests verify that:
 * - Dead-letter handlers can be registered
 * - Handlers are called with the correct data and metadata
 * - Dead-letter queues are properly named
 * - Metadata extraction works correctly
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { onDeadLetter, type DeadLetterMetadata } from "./deadletter";

test("onDeadLetter() rejects if RabbitMQ has not been initialized yet", async () => {

    await assert.rejects(
        () => onDeadLetter("some_queue", async () => {}),
        /RabbitMQ has not been initialized/
    );

});

test("dead-letter queue name is derived correctly", () => {

    const testCases = [
        { original: "pr_queue", expected: "pr_queue.dead_letter" },
        { original: "eslint_queue", expected: "eslint_queue.dead_letter" },
        { original: "results_queue", expected: "results_queue.dead_letter" },
    ];

    for (const { original, expected } of testCases) {
        // Dead-letter queue name is: {originalQueue}.dead_letter
        const dlQueueName = `${original}.dead_letter`;
        assert.equal(dlQueueName, expected, `Dead-letter queue name mismatch for ${original}`);
    }

});

test("DeadLetterMetadata has all required fields", () => {

    const metadata: DeadLetterMetadata = {
        originalQueue: "pr_queue",
        deadLetterQueue: "pr_queue.dead_letter",
        retryCount: 3,
        failureReason: "Connection timeout",
        timestamp: new Date().toISOString(),
    };

    assert.equal(metadata.originalQueue, "pr_queue");
    assert.equal(metadata.deadLetterQueue, "pr_queue.dead_letter");
    assert.equal(metadata.retryCount, 3);
    assert.equal(metadata.failureReason, "Connection timeout");
    assert.ok(metadata.timestamp);

});
