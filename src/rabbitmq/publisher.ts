/**
 * publisher.ts
 *
 * PURPOSE:
 * --------
 * A Publisher (also called a Producer) is responsible for
 * sending messages to a RabbitMQ queue.
 *
 * Think of it like a post office:
 * - You give a letter (message) to the post office.
 * - The post office delivers it to the mailbox (queue).
 *
 * The Publisher DOES NOT process the message.
 * It only sends it.
 */

import { getChannel } from "./connection";

/**
 * Publishes a message to the specified RabbitMQ queue.
 *
 * @param queue   Name of the queue.
 * @param message JavaScript object to send.
 */
export async function publish(
    queue: string,
    message: unknown
): Promise<void> {

    // Get the RabbitMQ communication channel.
    // This channel was created when the server started.
    const channel = getChannel();

    // Convert the JavaScript object into a JSON string.
    // RabbitMQ cannot store JavaScript objects directly.
    const messageBuffer = Buffer.from(JSON.stringify(message));

    // Send the message to the specified queue.
    const success = channel.sendToQueue(
        queue,
        messageBuffer,
        {
            // Save the message to disk.
            // If RabbitMQ restarts unexpectedly,
            // persistent messages can be recovered.
            persistent: true
        }
    );

    // Display whether the message was accepted.
    if (success) {

        console.log("=====================================");
        console.log("Message Published Successfully");
        console.log(`Queue   : ${queue}`);
        console.log("Message : ", message);
        console.log("=====================================\n");

    } else {

        console.warn("RabbitMQ queue is temporarily full.");
        console.warn("Message could not be published immediately.");

    }
}