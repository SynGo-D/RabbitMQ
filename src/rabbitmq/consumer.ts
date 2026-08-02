import { getChannel } from "./connection";

export async function consume(

    queue: string,

    handler: (data: any) => Promise<void>

) {

    const channel = getChannel();

    channel.consume(queue, async (msg) => {

        if (!msg) return;

        const data = JSON.parse(msg.content.toString());

        await handler(data);

        channel.ack(msg);

    });

}