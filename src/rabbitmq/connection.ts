import * as amqp from "amqplib";
import { Channel, ChannelModel } from 'amqplib';

let connection: ChannelModel;
let channel: Channel;

/**
 * How many messages a consumer is allowed to hold "in hand" at once,
 * before it has to ack/nack one to get the next.
 *
 * Without this, RabbitMQ would push every single waiting message to
 * us immediately, which can overload our app if there are thousands
 * of messages queued up.
 */
const PREFETCH_COUNT = Number(process.env.RABBITMQ_PREFETCH) || 5;

/**
 * If the connection to RabbitMQ drops (for example, the Docker
 * container restarts), wait this many milliseconds before trying
 * to connect again.
 */
const RECONNECT_DELAY_MS = 5000;

/**
 * Functions that should run again every time we reconnect.
 *
 * For example: re-declaring queues, or re-subscribing consumers.
 * Other files register their own "redo this after reconnecting"
 * function here using onReconnected(), so this file doesn't need
 * to know anything about queues or consumers directly.
 */
const reconnectHooks: Array<() => Promise<void>> = [];

export function onReconnected(hook: () => Promise<void>) {
    reconnectHooks.push(hook);
}

async function runReconnectHooks() {
    for (const hook of reconnectHooks) {
        try {
            await hook();
        } catch (error) {
            console.error("A reconnect hook failed to run:", error);
        }
    }
}

export async function connectRabbitMQ() {
    connection = await amqp.connect(process.env.RABBITMQ_URL!);

    // These two listeners handle the "phone line got cut" situation.
    connection.on("error", (error) => {
        console.error("RabbitMQ connection error:", error.message);
    });

    connection.on("close", () => {
        console.warn("RabbitMQ connection was closed. Will try to reconnect...");
        scheduleReconnect();
    });

    channel = await connection.createChannel();

    // Don't let RabbitMQ flood us with more messages than we can handle.
    await channel.prefetch(PREFETCH_COUNT);

    console.log("Connected to RabbitMQ");
}

/**
 * Keeps retrying connectRabbitMQ() every RECONNECT_DELAY_MS until it
 * succeeds. Once reconnected, it re-runs anything registered with
 * onReconnected() (like re-declaring queues and consumers).
 */
let isReconnecting = false;

function scheduleReconnect() {
    // Avoid starting multiple reconnect loops at the same time.
    if (isReconnecting) {
        return;
    }

    isReconnecting = true;

    setTimeout(async () => {
        try {
            console.log("Attempting to reconnect to RabbitMQ...");

            await connectRabbitMQ();

            console.log("Reconnected. Restoring queues and consumers...");
            await runReconnectHooks();

            isReconnecting = false;
        } catch (error) {
            console.error("Reconnect attempt failed. Will try again shortly.", error);

            // Still couldn't connect, so try again after the same delay.
            isReconnecting = false;
            scheduleReconnect();
        }
    }, RECONNECT_DELAY_MS);
}

export function getChannel() {
    if (!channel) {
        throw new Error("RabbitMQ has not been initialized.");
    }

    return channel;
}

export function isRabbitMQConnected(): boolean {
    return !!channel;
}

/**
 * Closes the channel and connection cleanly.
 *
 * This should be called when the app is shutting down (for example,
 * when we receive a SIGINT/SIGTERM signal), so RabbitMQ knows we
 * left on purpose instead of thinking we crashed.
 */
export async function closeRabbitMQ(): Promise<void> {
    try {
        if (channel) {
            await channel.close();
        }

        if (connection) {
            await connection.close();
        }

        console.log("RabbitMQ connection closed gracefully.");
    } catch (error) {
        console.error("Error while closing RabbitMQ connection:", error);
    }
}
