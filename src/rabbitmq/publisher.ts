import { getChannel } from "./connection";

export async function publish(

    queue: string,

    message: unknown

) {

    const channel = getChannel();

    channel.sendToQueue(

        queue,

        Buffer.from(JSON.stringify(message)),

        {

            persistent: true

        }

    );

}