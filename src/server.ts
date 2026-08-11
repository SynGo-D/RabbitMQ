import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

import { initializeRabbitMQ } from "./rabbitmq";

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

start();