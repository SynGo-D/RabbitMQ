/**
 * publisher.test.ts
 *
 * Checks that publish() fails safely if it's called before
 * connectRabbitMQ() has run, instead of doing something confusing
 * like silently dropping the message.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { publish } from "./publisher";

test("publish() rejects if RabbitMQ has not been initialized yet", async () => {

    await assert.rejects(
        () => publish("some_queue", { hello: "world" }),
        /RabbitMQ has not been initialized/
    );

});
