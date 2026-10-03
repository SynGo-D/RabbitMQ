/**
 * consumer.ts
 *
 * PURPOSE:
 * --------
 * A Consumer listens to a RabbitMQ queue.
 *
 * Whenever a new message arrives,
 * RabbitMQ automatically delivers it
 * to this consumer.
 *
 * Think of it like a cashier at a supermarket.
 *
 * Customers (messages) wait in a queue.
 *
 * The cashier (consumer)
 * serves them one by one.
 */

import type { Channel, ConsumeMessage } from "amqplib";
import { getChannel, onReconnected } from "./connection";

type ConsumerChannel = Pick<
    Channel,
    "assertQueue" | "consume" | "ack" | "sendToQueue"
>;

/**
 * If a message keeps failing, we don't want to retry it forever -
 * that would just spin in a loop and waste resources. After this
 * many attempts, we give up and move it to a "dead letter" queue
 * instead, so a human can look at it later.
 */
const MAX_RETRIES = 3;

/**
 * Every queue we start listening to gets remembered here.
 *
 * Why? If RabbitMQ disconnects and we reconnect, we get a brand
 * new channel and lose all our old listeners. Keeping this list
 * lets us automatically start listening again on the new channel,
 * instead of the app going silent after a reconnect.
 */
const activeSubscriptions: Array<{
    queue: string;
    handler: (data: unknown) => Promise<void>;
}> = [];

/**
 * Starts listening to a RabbitMQ queue.
 *
 * @param queue
 * Queue name to listen to.
 *
 * @param handler
 * Function that processes each received message.
 */
export async function consume(
    queue: string,
    handler: (data: unknown) => Promise<void>
): Promise<void> {

    // Remember this subscription so we can restore it after a reconnect.
    activeSubscriptions.push({ queue, handler });

    await startListening(queue, handler);

}

/**
 * The actual "start listening" logic, pulled out into its own
 * function so it can be called both by consume() and again
 * automatically after a reconnect.
 */
async function startListening(
    queue: string,
    handler: (data: unknown) => Promise<void>
): Promise<void> {

    // Get the existing RabbitMQ channel.
    const channel = getChannel();

    await startListeningOnChannel(channel, queue, handler);

}

/**
 * Channel-based consumer core. Exported so message handling can be tested
 * with a deterministic in-memory channel instead of a live broker.
 */
export async function startListeningOnChannel(
    channel: ConsumerChannel,
    queue: string,
    handler: (data: unknown) => Promise<void>
): Promise<void> {

    // Ensure the queue exists (create it if needed)
    // This is important for dynamic queue names (e.g., in tests)
    await channel.assertQueue(queue, {
        durable: true
    });

    console.log(`Listening to queue: ${queue}\n`);
    // Start listening.
    // RabbitMQ will automatically invoke this callback
    // whenever a message arrives.
    channel.consume(queue, async (msg) => {

        // Safety check.
        // Occasionally RabbitMQ can send a null message.
        if (!msg) {

            console.warn("Received an empty message.");

            return;

        }

        try {

            // Convert the binary Buffer into a string.
            const json = msg.content.toString();

            // Convert the JSON string back into a JavaScript object.
            const data = JSON.parse(json);

            console.log("=====================================");
            console.log("Message Received");
            console.log(`Queue   : ${queue}`);
            console.log("Message : ", data);
            console.log("=====================================\n");

            // Pass the received data
            // to whatever processing function
            // the caller provided.
            await handler(data);

            // Tell RabbitMQ:
            //
            // "The message has been processed successfully."
            //
            // RabbitMQ can now safely remove it
            // from the queue.
            channel.ack(msg);

            console.log("Message acknowledged.\n");

        }
        catch (error) {

            console.error("Failed to process message.");
            console.error(error);

            await handleFailedMessageOnChannel(channel, queue, msg, error);

        }

    });

}

/**
 * Decides what to do with a message that failed to process:
 *
 * - If it hasn't failed too many times yet, put it back on the
 *   same queue with a retry count attached, so it gets tried again.
 * - If it has already failed MAX_RETRIES times, stop retrying and
 *   move it to a dead-letter queue instead, so it doesn't block
 *   or loop forever. A human can inspect it there later.
 *
 * Either way, we ack() the original message - we're not losing it,
 * we're just moving on with a fresh copy of it (or setting it aside).
 */
export async function handleFailedMessageOnChannel(
    channel: ConsumerChannel,
    queue: string,
    msg: ConsumeMessage,
    error: unknown
): Promise<void> {

    const retryCount = getRetryCount(msg) + 1;

    if (retryCount <= MAX_RETRIES) {

        console.warn(`Retrying message (attempt ${retryCount}/${MAX_RETRIES})...\n`);

        channel.sendToQueue(queue, msg.content, {
            persistent: true,
            headers: { "x-retry-count": retryCount }
        });

    } else {

        const deadLetterQueue = `${queue}.dead_letter`;

        console.error(
            `Message failed ${MAX_RETRIES} times. Moving it to "${deadLetterQueue}".\n`
        );

        // Make sure the dead-letter queue exists before we send to it.
        await channel.assertQueue(deadLetterQueue, { durable: true });

        channel.sendToQueue(deadLetterQueue, msg.content, {
            persistent: true,
            headers: {
                "x-retry-count": retryCount,
                "x-failed-reason": error instanceof Error ? error.message : String(error)
            }
        });

    }

    // Remove the original copy - we've either requeued a new copy
    // above, or moved it to the dead-letter queue.
    channel.ack(msg);

}

/**
 * Reads how many times this message has already been retried.
 * A message that has never failed before simply won't have this
 * header, so we treat that as 0.
 */
function getRetryCount(msg: ConsumeMessage): number {

    const headers = msg.properties.headers;

    const count = headers?.["x-retry-count"];

    return typeof count === "number" ? count : 0;

}

/**
 * After a reconnect, start listening again to every queue we were
 * listening to before the connection dropped.
 */
onReconnected(async () => {

    for (const subscription of activeSubscriptions) {

        await startListening(subscription.queue, subscription.handler);

    }

});
