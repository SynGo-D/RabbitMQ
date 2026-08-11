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

import { getChannel } from "./connection";

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

    // Get the existing RabbitMQ channel.
    const channel = getChannel();

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

            /**
             * Negative acknowledgement.
             *
             * RabbitMQ now knows
             * the consumer failed.
             *
             * Setting requeue=true
             * places the message back
             * into the queue.
             *
             * This prevents message loss.
             */
            channel.nack(msg, false, true);

        }

    });

}