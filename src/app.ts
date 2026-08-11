import express from "express";
import cors from "cors";
import { isRabbitMQConnected } from "./rabbitmq/connection.js";

import { publish } from "./rabbitmq/publisher";
import { QUEUES } from "./rabbitmq/queues";

const app = express();

app.use(cors());

app.use(express.json());

app.post("/test-publish", async (req, res) => {
    await publish(QUEUES.PR_QUEUE, req.body);
    res.json({ status: "published" });
});



app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        rabbitmq: isRabbitMQConnected() ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
    });
});

export default app;