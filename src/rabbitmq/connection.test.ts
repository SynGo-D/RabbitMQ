/**
 * connection.test.ts
 *
 * These tests check what happens BEFORE connectRabbitMQ() has ever
 * been called - i.e. what a brand new copy of this app looks like
 * before it has talked to RabbitMQ at all.
 *
 * We don't spin up a real RabbitMQ server for these tests - that's
 * more of an integration test. Here we just check that the app
 * fails safely (with a clear error) instead of crashing in a
 * confusing way if something tries to use RabbitMQ too early.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getChannel, isRabbitMQConnected } from "./connection";

test("isRabbitMQConnected() is false before connecting", () => {

    assert.equal(isRabbitMQConnected(), false);

});

test("getChannel() throws a clear error before connecting", () => {

    assert.throws(
        () => getChannel(),
        /RabbitMQ has not been initialized/
    );

});
