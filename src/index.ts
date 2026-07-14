import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cookieParser from "cookie-parser";
const app = express();

// import all routes
import globalErrorHandler from "./validators/globalErrorHandeler.validetor.js";
import { compressionMiddleware } from "./config/sequrity/compression.js";
import { corsMiddleware } from "./config/sequrity/cors.js";
import { loggerMiddleware } from "./config/sequrity/logger.js";
import { securityMiddleware } from "./config/sequrity/helmet.js";
import connectDB from "./config/mongoDB.config.js";
import connectRedis from "./config/redis.config.js";

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET_KEY));
// sequrity middlewares
app.use(compressionMiddleware);
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(securityMiddleware);
app.set("trust proxy", 1); // trust first proxy
// connct db
connectDB();
connectRedis;

// 404 handler
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// global error handler
app.use(globalErrorHandler);

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
