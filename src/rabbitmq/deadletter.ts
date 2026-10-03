/**
 * deadletter.ts
 *
 * PURPOSE:
 * --------
 * Handles messages that have failed too many times and been moved
 * to dead-letter queues.
 *
 * When a message fails MAX_RETRIES times, it gets moved to a
 * dead-letter queue where it can be:
 * - Logged for investigation
 * - Forwarded to an admin/monitoring service
 * - Re-queued manually after fixing the underlying issue
 * - Analyzed to understand systematic failures
 */

import type { Channel, ConsumeMessage } from "amqplib";
import { getChannel, onReconnected } from "./connection";

type DeadLetterChannel = Pick<
    Channel,
    "assertQueue" | "consume" | "ack" | "nack"
>;

/**
 * Dead-letter queue handlers registered by different services.
 * Each service can provide its own handler to decide what to do
 * with dead-lettered messages from its queues.
 */
const deadLetterHandlers: Array<{
    queue: string;
    handler: (data: unknown, metadata: DeadLetterMetadata) => Promise<void>;
}> = [];

/**
 * Metadata about a dead-lettered message.
 * Helps handlers understand why the message failed and how many times.
 */
export interface DeadLetterMetadata {
    /** Original queue the message came from */
    originalQueue: string;

    /** Dead-letter queue the message is in */
    deadLetterQueue: string;

    /** How many times the message was retried */
    retryCount: number;

    /** Error message or reason for the final failure */
    failureReason?: string;

    /** When the message was dead-lettered */
    timestamp: string;
}

/**
 * Registers a handler for dead-lettered messages from a specific queue.
 *
 * @param originalQueue The main queue name (e.g., "pr_queue")
 * @param handler Function to process dead-lettered messages
 *
 * @example
 * ```ts
 * onDeadLetter("pr_queue", async (data, metadata) => {
 *     console.error(`PR job failed after ${metadata.retryCount} retries:`, data);
 *     await notifyAdmin(data, metadata);
 * });
 * ```
 */
export async function onDeadLetter(
    originalQueue: string,
    handler: (data: unknown, metadata: DeadLetterMetadata) => Promise<void>
): Promise<void> {

    const deadLetterQueue = `${originalQueue}.dead_letter`;

    deadLetterHandlers.push({ queue: deadLetterQueue, handler });

    await startListeningToDeadLetter(originalQueue, deadLetterQueue, handler);

}

/**
 * The actual "start listening to dead-letter queue" logic.
 * Called both by onDeadLetter() and again automatically after a reconnect.
 */
async function startListeningToDeadLetter(
    originalQueue: string,
    deadLetterQueue: string,
    handler: (data: unknown, metadata: DeadLetterMetadata) => Promise<void>
): Promise<void> {

    const channel = getChannel();

    await listenToDeadLettersOnChannel(
        channel,
        originalQueue,
        deadLetterQueue,
        handler
    );

}

/**
 * Channel-based dead-letter consumer core. Exported for deterministic
 * component tests that do not require a running RabbitMQ instance.
 */
export async function listenToDeadLettersOnChannel(
    channel: DeadLetterChannel,
    originalQueue: string,
    deadLetterQueue: string,
    handler: (data: unknown, metadata: DeadLetterMetadata) => Promise<void>
): Promise<void> {

    // Make sure the dead-letter queue exists.
    // (It should have been created already when the first message failed,
    // but we declare it here to be safe.)
    await channel.assertQueue(deadLetterQueue, { durable: true });

    console.log(`Listening to dead-letter queue: ${deadLetterQueue}\n`);

    // Start listening to the dead-letter queue.
    channel.consume(deadLetterQueue, async (msg) => {

        if (!msg) {
            console.warn("Received an empty message from dead-letter queue.");
            return;
        }

        try {

            // Extract message content and metadata.
            const json = msg.content.toString();
            const data = JSON.parse(json);

            const headers = msg.properties.headers || {};
            const retryCount = typeof headers["x-retry-count"] === "number"
                ? headers["x-retry-count"]
                : 0;
            const failureReason = headers["x-failed-reason"] as string | undefined;

            const metadata: DeadLetterMetadata = {
                originalQueue,
                deadLetterQueue,
                retryCount,
                failureReason,
                timestamp: new Date().toISOString()
            };

            console.log("=====================================");
            console.log("Dead-Letter Message Received");
            console.log(`Original Queue : ${originalQueue}`);
            console.log(`Retry Count    : ${retryCount}`);
            console.log(`Failure Reason : ${failureReason || "Unknown"}`);
            console.log("Message        : ", data);
            console.log("=====================================\n");

            // Pass the message to the handler.
            await handler(data, metadata);

            // Acknowledge the dead-letter message.
            // We've processed it (logged, notified admin, etc.)
            // so remove it from the queue.
            channel.ack(msg);

            console.log("Dead-letter message acknowledged.\n");

        } catch (error) {

            console.error("Failed to process dead-letter message.");
            console.error(error);

            // Don't ack - let it be redelivered if something went wrong
            // in our dead-letter handler itself. This should be rare!
            channel.nack(msg, false);

        }

    });

}

/**
 * After a reconnect, start listening again to every dead-letter queue
 * we were listening to before the connection dropped.
 */
onReconnected(async () => {

    for (const dlHandler of deadLetterHandlers) {

        // Extract the original queue name from the dead-letter queue name.
        // Format: "queue_name.dead_letter" -> "queue_name"
        const originalQueue = dlHandler.queue.replace(".dead_letter", "");

        try {
            await startListeningToDeadLetter(
                originalQueue,
                dlHandler.queue,
                dlHandler.handler
            );
        } catch (error) {
            console.error(`Failed to restore dead-letter listener for ${dlHandler.queue}:`, error);
        }

    }

});
