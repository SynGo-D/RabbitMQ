/**
 * consumer.test.ts
 *
 * Checks that consume() fails safely if it's called before
 * connectRabbitMQ() has run, instead of doing something confusing
 * like silently never receiving any messages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Channel, ConsumeMessage } from "amqplib";

import {
    consume,
    handleFailedMessageOnChannel,
    startListeningOnChannel,
} from "./consumer";

function createMessage(content: string, retryCount?: number): ConsumeMessage {
    return {
        content: Buffer.from(content),
        fields: {},
        properties: {
            headers: retryCount === undefined
                ? {}
                : { "x-retry-count": retryCount },
        },
    } as ConsumeMessage;
}

test("consume() rejects if RabbitMQ has not been initialized yet", async () => {

    await assert.rejects(
        () => consume("some_queue", async () => {}),
        /RabbitMQ has not been initialized/
    );

});

test("consumer acknowledges a message after its handler succeeds", async () => {
    let deliveryHandler: ((msg: ConsumeMessage | null) => Promise<void>) | undefined;
    const acknowledged: ConsumeMessage[] = [];
    const handled: unknown[] = [];

    const channel = {
        assertQueue: async () => ({}),
        consume: async (_queue: string, callback: (msg: ConsumeMessage | null) => Promise<void>) => {
            deliveryHandler = callback;
            return { consumerTag: "test-consumer" };
        },
        ack: (msg: ConsumeMessage) => acknowledged.push(msg),
        sendToQueue: () => true,
    } as unknown as Channel;

    await startListeningOnChannel(channel, "work_queue", async (data) => {
        handled.push(data);
    });

    const message = createMessage(JSON.stringify({ jobId: 17 }));
    assert.ok(deliveryHandler);
    await deliveryHandler(message);

    assert.deepEqual(handled, [{ jobId: 17 }]);
    assert.deepEqual(acknowledged, [message]);
});

test("invalid JSON is requeued with its first retry count", async () => {
    let deliveryHandler: ((msg: ConsumeMessage | null) => Promise<void>) | undefined;
    const acknowledged: ConsumeMessage[] = [];
    const published: Array<{
        queue: string;
        content: Buffer;
        options: { persistent?: boolean; headers?: Record<string, unknown> };
    }> = [];
    let handlerCalls = 0;

    const channel = {
        assertQueue: async () => ({}),
        consume: async (_queue: string, callback: (msg: ConsumeMessage | null) => Promise<void>) => {
            deliveryHandler = callback;
            return { consumerTag: "test-consumer" };
        },
        ack: (msg: ConsumeMessage) => acknowledged.push(msg),
        sendToQueue: (queue: string, content: Buffer, options: unknown) => {
            published.push({
                queue,
                content,
                options: options as { persistent?: boolean; headers?: Record<string, unknown> },
            });
            return true;
        },
    } as unknown as Channel;

    await startListeningOnChannel(channel, "work_queue", async () => {
        handlerCalls++;
    });

    const message = createMessage("{not-valid-json");
    assert.ok(deliveryHandler);
    await deliveryHandler(message);

    assert.equal(handlerCalls, 0);
    assert.deepEqual(acknowledged, [message]);
    assert.equal(published.length, 1);
    assert.equal(published[0]?.queue, "work_queue");
    assert.equal(published[0]?.content, message.content);
    assert.deepEqual(published[0]?.options, {
        persistent: true,
        headers: { "x-retry-count": 1 },
    });
});

test("failed messages increment the existing retry count", async () => {
    const publishedOptions: unknown[] = [];
    const channel = {
        sendToQueue: (_queue: string, _content: Buffer, options: unknown) => {
            publishedOptions.push(options);
            return true;
        },
        ack: () => {},
    } as unknown as Channel;

    await handleFailedMessageOnChannel(
        channel,
        "work_queue",
        createMessage(JSON.stringify({ jobId: 18 }), 1),
        new Error("temporary failure")
    );

    assert.deepEqual(publishedOptions, [{
        persistent: true,
        headers: { "x-retry-count": 2 },
    }]);
});

test("a message beyond the retry limit is routed to the dead-letter queue", async () => {
    const assertedQueues: Array<{ queue: string; options: unknown }> = [];
    const published: Array<{ queue: string; options: unknown }> = [];
    const acknowledged: ConsumeMessage[] = [];

    const channel = {
        assertQueue: async (queue: string, options: unknown) => {
            assertedQueues.push({ queue, options });
            return {};
        },
        sendToQueue: (queue: string, _content: Buffer, options: unknown) => {
            published.push({ queue, options });
            return true;
        },
        ack: (msg: ConsumeMessage) => acknowledged.push(msg),
    } as unknown as Channel;

    const message = createMessage(JSON.stringify({ jobId: 19 }), 3);
    await handleFailedMessageOnChannel(
        channel,
        "work_queue",
        message,
        new Error("permanent failure")
    );

    assert.deepEqual(assertedQueues, [{
        queue: "work_queue.dead_letter",
        options: { durable: true },
    }]);
    assert.deepEqual(published, [{
        queue: "work_queue.dead_letter",
        options: {
            persistent: true,
            headers: {
                "x-retry-count": 4,
                "x-failed-reason": "permanent failure",
            },
        },
    }]);
    assert.deepEqual(acknowledged, [message]);
});
