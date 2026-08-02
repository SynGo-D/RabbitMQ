import * as amqp from "amqplib";

let connection: amqp.Connection;
let channel: amqp.Channel;

export async function connectRabbitMQ() {
    connection = await amqp.connect(process.env.RABBITMQ_URL!);

    channel = await connection.createChannel();

    console.log("Connected to RabbitMQ");
}

export function getChannel() {
    if (!channel) {
        throw new Error("RabbitMQ has not been initialized.");
    }

    return channel;
}