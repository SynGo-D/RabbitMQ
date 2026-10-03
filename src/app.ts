import express from "express";
import cors from "cors";
import { isRabbitMQConnected } from "./rabbitmq/connection.js";

import { publish } from "./rabbitmq/publisher";
import { QUEUES } from "./rabbitmq/queues";

const app = express();

app.use(cors());

app.use(express.json());

app.post("/test-publish", async (req, res) => {
    // Allow specifying which queue to publish to (for testing)
    // If not specified, defaults to PR_QUEUE
    const queue = req.query.queue || QUEUES.PR_QUEUE;
    
    try {
        await publish(queue as string, req.body);
        res.json({ status: "published" });
    } catch (error) {
        res.status(500).json({ 
            status: "error", 
            message: error instanceof Error ? error.message : "Unknown error" 
        });
    }
});



app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        rabbitmq: isRabbitMQConnected() ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
    });
});

export default app;