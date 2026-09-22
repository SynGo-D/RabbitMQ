import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

import { initializeRabbitMQ } from "./rabbitmq";

import { closeRabbitMQ } from "./rabbitmq/connection";

import { consume } from "./rabbitmq/consumer";
import { QUEUES } from "./rabbitmq/queues";


const PORT = process.env.PORT || 5000;

async function start() {

    try {

        await initializeRabbitMQ();

        await consume(QUEUES.PR_QUEUE, async (data) => {
            console.log("Received message:", data);
        });

        app.listen(PORT, () => {

            console.log(`Server running on port ${PORT}`);

        });

    }

    catch (error) {

        console.error("Failed to start server");

        console.error(error);

        process.exit(1);

    }

}

/**
 * Runs when the app is asked to stop (Ctrl+C locally, or when
 * Docker/Kubernetes stops the container).
 *
 * We close the RabbitMQ connection on purpose here so RabbitMQ
 * knows we shut down cleanly, instead of thinking we crashed and
 * trying to redeliver our unacknowledged messages right away.
 */
async function shutdown(signal: string) {

    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    await closeRabbitMQ();

    process.exit(0);

}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
