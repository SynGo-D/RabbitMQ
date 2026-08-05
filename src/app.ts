import express from "express";
import cors from "cors";
import { isRabbitMQConnected } from "./rabbitmq/connection.js";

const app = express();

app.use(cors());

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        rabbitmq: isRabbitMQConnected() ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
    });
});

export default app;