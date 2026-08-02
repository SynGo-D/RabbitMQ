import dotenv from "dotenv";
dotenv.config();

import app from "./app";

import { initializeRabbitMQ } from "./rabbitmq";

const PORT = process.env.PORT || 5000;

async function start() {

    try {

        await initializeRabbitMQ();

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