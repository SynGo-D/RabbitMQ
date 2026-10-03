import { connectRabbitMQ, getChannel, onReconnected } from "./connection";

import { QUEUES } from "./queues";

// Export dead-letter queue functionality
export { onDeadLetter, type DeadLetterMetadata } from "./deadletter";

// Pulled into its own function so it can also be re-run by the
// onReconnected() hook below, not just on the very first connect.
async function assertAllQueues() {

    const channel = getChannel();

    for (const queue of Object.values(QUEUES)) {

        await channel.assertQueue(

            queue,

            {

                durable: true

            }

        );

    }

}

export async function initializeRabbitMQ() {

    await connectRabbitMQ();

    await assertAllQueues();

    // If we ever lose connection and reconnect, we get a brand new
    // channel from RabbitMQ. Re-declaring the queues here makes sure
    // they're still there before anyone tries to use them again.
    onReconnected(assertAllQueues);

    console.log("RabbitMQ initialized.");

}
