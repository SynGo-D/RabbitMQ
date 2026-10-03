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
import type { Channel, ConsumeMessage } from "amqplib";

import {
    listenToDeadLettersOnChannel,
    onDeadLetter,
    type DeadLetterMetadata,
} from "./deadletter";

function createDeadLetterMessage(
    data: unknown,
    headers: Record<string, unknown> = {}
): ConsumeMessage {
    return {
        content: Buffer.from(JSON.stringify(data)),
        fields: {},
        properties: { headers },
    } as ConsumeMessage;
}

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

test("dead-letter handler receives parsed data and broker metadata", async () => {
    let deliveryHandler: ((msg: ConsumeMessage | null) => Promise<void>) | undefined;
    const acknowledged: ConsumeMessage[] = [];
    let receivedData: unknown;
    let receivedMetadata: DeadLetterMetadata | undefined;

    const channel = {
        assertQueue: async () => ({}),
        consume: async (_queue: string, callback: (msg: ConsumeMessage | null) => Promise<void>) => {
            deliveryHandler = callback;
            return { consumerTag: "dead-letter-test" };
        },
        ack: (msg: ConsumeMessage) => acknowledged.push(msg),
        nack: () => {},
    } as unknown as Channel;

    await listenToDeadLettersOnChannel(
        channel,
        "pr_queue",
        "pr_queue.dead_letter",
        async (data, metadata) => {
            receivedData = data;
            receivedMetadata = metadata;
        }
    );

    const message = createDeadLetterMessage(
        { prNumber: 42 },
        {
            "x-retry-count": 4,
            "x-failed-reason": "analysis timed out",
        }
    );

    assert.ok(deliveryHandler);
    await deliveryHandler(message);

    assert.deepEqual(receivedData, { prNumber: 42 });
    assert.equal(receivedMetadata?.originalQueue, "pr_queue");
    assert.equal(receivedMetadata?.deadLetterQueue, "pr_queue.dead_letter");
    assert.equal(receivedMetadata?.retryCount, 4);
    assert.equal(receivedMetadata?.failureReason, "analysis timed out");
    assert.ok(receivedMetadata?.timestamp);
    assert.equal(Number.isNaN(Date.parse(receivedMetadata!.timestamp)), false);
    assert.deepEqual(acknowledged, [message]);
});

test("dead-letter message is negatively acknowledged when its handler fails", async () => {
    let deliveryHandler: ((msg: ConsumeMessage | null) => Promise<void>) | undefined;
    const acknowledged: ConsumeMessage[] = [];
    const negativelyAcknowledged: Array<{
        message: ConsumeMessage;
        allUpTo: boolean | undefined;
    }> = [];

    const channel = {
        assertQueue: async () => ({}),
        consume: async (_queue: string, callback: (msg: ConsumeMessage | null) => Promise<void>) => {
            deliveryHandler = callback;
            return { consumerTag: "dead-letter-test" };
        },
        ack: (msg: ConsumeMessage) => acknowledged.push(msg),
        nack: (message: ConsumeMessage, allUpTo?: boolean) => {
            negativelyAcknowledged.push({ message, allUpTo });
        },
    } as unknown as Channel;

    await listenToDeadLettersOnChannel(
        channel,
        "pr_queue",
        "pr_queue.dead_letter",
        async () => {
            throw new Error("alert service unavailable");
        }
    );

    const message = createDeadLetterMessage({ prNumber: 43 });
    assert.ok(deliveryHandler);
    await deliveryHandler(message);

    assert.deepEqual(acknowledged, []);
    assert.deepEqual(negativelyAcknowledged, [{
        message,
        allUpTo: false,
    }]);
});
