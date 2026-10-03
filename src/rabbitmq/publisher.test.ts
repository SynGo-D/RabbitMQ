/**
 * publisher.test.ts
 *
 * Checks that publish() fails safely if it's called before
 * connectRabbitMQ() has run, instead of doing something confusing
 * like silently dropping the message.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Channel } from "amqplib";
import { publish, publishToChannel } from "./publisher";

test("publish() rejects if RabbitMQ has not been initialized yet", async () => {

    await assert.rejects(
        () => publish("some_queue", { hello: "world" }),
        /RabbitMQ has not been initialized/
    );

});

test("publishToChannel() serializes the complete message as JSON", () => {
    let publishedContent: Buffer | undefined;

    const channel = {
        sendToQueue: (_queue: string, content: Buffer) => {
            publishedContent = content;
            return true;
        },
    } as Pick<Channel, "sendToQueue">;

    const message = {
        repository: "SynGo-D/example",
        prNumber: 42,
        labels: ["backend", "quality"],
        nested: { enabled: true },
    };

    publishToChannel(channel, "pr_queue", message);

    assert.ok(publishedContent);
    assert.deepEqual(JSON.parse(publishedContent.toString()), message);
});

test("publishToChannel() publishes to the requested queue as persistent", () => {
    let publishedQueue: string | undefined;
    let publishedOptions: unknown;

    const channel = {
        sendToQueue: (queue: string, _content: Buffer, options: unknown) => {
            publishedQueue = queue;
            publishedOptions = options;
            return true;
        },
    } as Pick<Channel, "sendToQueue">;

    publishToChannel(channel, "results_queue", { result: "ok" });

    assert.equal(publishedQueue, "results_queue");
    assert.deepEqual(publishedOptions, { persistent: true });
});
