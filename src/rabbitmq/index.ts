import { connectRabbitMQ } from "./connection";

import { getChannel } from "./connection";

import { QUEUES } from "./queues";

export async function initializeRabbitMQ() {

    await connectRabbitMQ();

    const channel = getChannel();

    for (const queue of Object.values(QUEUES)) {

        await channel.assertQueue(

            queue,

            {

                durable: true

            }

        );

    }

    console.log("RabbitMQ initialized.");

}