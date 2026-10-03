/**
 * Opt-in RabbitMQ performance tests.
 *
 * These tests require a live broker and are intentionally excluded from the
 * normal unit suite. Run them with: npm run test:performance
 */

import "dotenv/config";

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { connectRabbitMQ, closeRabbitMQ, getChannel } from "./connection";
import { consume } from "./consumer";
import { publish } from "./publisher";

interface PerformanceMessage {
    id: number;
    sentAt: number;
    payload: string;
}

interface ScenarioOptions {
    label: string;
    messageCount: number;
    concurrency: number;
    payloadBytes: number;
    timeoutMs: number;
}

interface PerformanceMetrics {
    scenario: string;
    requestedMessages: number;
    receivedMessages: number;
    payloadBytes: number;
    concurrency: number;
    durationMs: number;
    messagesPerSecond: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    errorRatePercent: number;
    publishFailures: number;
    invalidMessages: number;
    duplicateMessages: number;
    timedOut: boolean;
}

function readPositiveInteger(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeNumber(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function percentile(values: number[], percentileValue: number): number {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
    return sorted[index] ?? 0;
}

function round(value: number): number {
    return Number(value.toFixed(2));
}

async function waitForCompletion(
    completion: Promise<void>,
    timeoutMs: number
): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);

        completion.then(() => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

async function runScenario(options: ScenarioOptions): Promise<PerformanceMetrics> {
    const queue = `performance_${options.label}_${randomUUID()}`;
    const payload = "x".repeat(options.payloadBytes);
    const receivedIds = new Set<number>();
    const latencies: number[] = [];

    let deliveries = 0;
    let invalidMessages = 0;
    let duplicateMessages = 0;
    let publishFailures = 0;
    let resolveCompletion: () => void = () => {};

    const completion = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
    });

    await consume(queue, async (data) => {
        deliveries++;

        const message = data as Partial<PerformanceMessage>;
        if (
            typeof message.id !== "number"
            || typeof message.sentAt !== "number"
            || typeof message.payload !== "string"
        ) {
            invalidMessages++;
        } else if (receivedIds.has(message.id)) {
            duplicateMessages++;
        } else {
            receivedIds.add(message.id);
            latencies.push(performance.now() - message.sentAt);
        }

        if (deliveries >= options.messageCount) {
            resolveCompletion();
        }
    });

    let nextMessageId = 0;
    const startedAt = performance.now();
    const originalConsoleLog = console.log;
    console.log = () => {};

    let completedBeforeTimeout = false;

    try {
        const workers = Array.from(
            { length: Math.min(options.concurrency, options.messageCount) },
            async () => {
                while (true) {
                    const id = nextMessageId++;
                    if (id >= options.messageCount) {
                        return;
                    }

                    try {
                        await publish(queue, {
                            id,
                            sentAt: performance.now(),
                            payload,
                        } satisfies PerformanceMessage);
                    } catch {
                        publishFailures++;
                    }
                }
            }
        );

        await Promise.all(workers);
        completedBeforeTimeout = await waitForCompletion(
            completion,
            options.timeoutMs
        );
    } finally {
        console.log = originalConsoleLog;
    }

    const finishedAt = performance.now();
    const durationMs = Math.max(finishedAt - startedAt, 0.001);
    const missingMessages = Math.max(
        options.messageCount - receivedIds.size,
        0
    );
    const errorCount = missingMessages + invalidMessages + duplicateMessages;

    const metrics: PerformanceMetrics = {
        scenario: options.label,
        requestedMessages: options.messageCount,
        receivedMessages: receivedIds.size,
        payloadBytes: options.payloadBytes,
        concurrency: options.concurrency,
        durationMs: round(durationMs),
        messagesPerSecond: round(receivedIds.size / (durationMs / 1000)),
        averageLatencyMs: round(
            latencies.length === 0
                ? 0
                : latencies.reduce((total, value) => total + value, 0) / latencies.length
        ),
        p95LatencyMs: round(percentile(latencies, 0.95)),
        errorRatePercent: round((errorCount / options.messageCount) * 100),
        publishFailures,
        invalidMessages,
        duplicateMessages,
        timedOut: !completedBeforeTimeout,
    };

    await getChannel().deleteQueue(queue);
    console.info(`PERFORMANCE_RESULT ${JSON.stringify(metrics)}`);

    return metrics;
}

function assertPerformance(
    metrics: PerformanceMetrics,
    minimumThroughput: number,
    maximumP95Latency: number
): void {
    const maximumErrorRate = readNonNegativeNumber("PERF_MAX_ERROR_RATE", 0);

    assert.equal(metrics.timedOut, false, "scenario timed out");
    assert.ok(
        metrics.messagesPerSecond >= minimumThroughput,
        `throughput ${metrics.messagesPerSecond} msg/s was below ${minimumThroughput} msg/s`
    );
    assert.ok(
        metrics.p95LatencyMs <= maximumP95Latency,
        `p95 latency ${metrics.p95LatencyMs} ms exceeded ${maximumP95Latency} ms`
    );
    assert.ok(
        metrics.errorRatePercent <= maximumErrorRate,
        `error rate ${metrics.errorRatePercent}% exceeded ${maximumErrorRate}%`
    );
}

describe("RabbitMQ performance", { concurrency: false }, () => {
    before(async () => {
        await connectRabbitMQ();
    });

    after(async () => {
        await closeRabbitMQ();
    });

    test("measures sequential throughput and average/p95 latency", { timeout: 60_000 }, async () => {
        const metrics = await runScenario({
            label: "sequential",
            messageCount: readPositiveInteger("PERF_MESSAGE_COUNT", 100),
            concurrency: 1,
            payloadBytes: readPositiveInteger("PERF_PAYLOAD_BYTES", 1024),
            timeoutMs: readPositiveInteger("PERF_TIMEOUT_MS", 30_000),
        });

        assertPerformance(
            metrics,
            readNonNegativeNumber("PERF_MIN_THROUGHPUT", 1),
            readNonNegativeNumber("PERF_MAX_P95_MS", 10_000)
        );
    });

    test("measures concurrent publishing and error rate", { timeout: 60_000 }, async () => {
        const metrics = await runScenario({
            label: "concurrent",
            messageCount: readPositiveInteger("PERF_CONCURRENT_MESSAGE_COUNT", 200),
            concurrency: readPositiveInteger("PERF_CONCURRENCY", 20),
            payloadBytes: readPositiveInteger("PERF_PAYLOAD_BYTES", 1024),
            timeoutMs: readPositiveInteger("PERF_TIMEOUT_MS", 30_000),
        });

        assertPerformance(
            metrics,
            readNonNegativeNumber("PERF_MIN_THROUGHPUT", 1),
            readNonNegativeNumber("PERF_MAX_P95_MS", 10_000)
        );
    });

    test("measures large-message throughput and latency", { timeout: 60_000 }, async () => {
        const metrics = await runScenario({
            label: "large_message",
            messageCount: readPositiveInteger("PERF_LARGE_MESSAGE_COUNT", 20),
            concurrency: readPositiveInteger("PERF_LARGE_CONCURRENCY", 5),
            payloadBytes: readPositiveInteger("PERF_LARGE_MESSAGE_BYTES", 262_144),
            timeoutMs: readPositiveInteger("PERF_TIMEOUT_MS", 30_000),
        });

        assertPerformance(
            metrics,
            readNonNegativeNumber("PERF_LARGE_MIN_THROUGHPUT", 0.1),
            readNonNegativeNumber("PERF_LARGE_MAX_P95_MS", 15_000)
        );
    });
});
