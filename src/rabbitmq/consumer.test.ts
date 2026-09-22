/**
 * consumer.test.ts
 *
 * Checks that consume() fails safely if it's called before
 * connectRabbitMQ() has run, instead of doing something confusing
 * like silently never receiving any messages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { consume } from "./consumer";

test("consume() rejects if RabbitMQ has not been initialized yet", async () => {

    await assert.rejects(
        () => consume("some_queue", async () => {}),
        /RabbitMQ has not been initialized/
    );

});
