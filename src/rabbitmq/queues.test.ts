/**
 * queues.test.ts
 *
 * Simple sanity checks for our list of queue names.
 *
 * These don't need a real RabbitMQ connection - we're just making
 * sure the QUEUES object itself is set up correctly, since a typo
 * here (like two queues accidentally sharing the same name) would
 * quietly break message routing between services.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { QUEUES } from "./queues";

test("every queue name is a non-empty string", () => {

    for (const name of Object.values(QUEUES)) {

        assert.equal(typeof name, "string");
        assert.ok(name.length > 0, "queue name should not be empty");

    }

});

test("no two queues accidentally share the same name", () => {

    const names = Object.values(QUEUES);
    const uniqueNames = new Set(names);

    assert.equal(
        uniqueNames.size,
        names.length,
        "found a duplicate queue name in QUEUES"
    );

});
