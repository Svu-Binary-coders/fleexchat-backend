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
import "./config/redis.config.js";
import authRoutes from "./routes/auth.routes.js";
import otpRoutes from "./routes/otp.routes.js";
import uploadRoutes from "./routes/upload.route.js";
import backupRoutes from "./routes/backup.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import accountRoutes from "./routes/accountControllers.routes.js";
import groupRoutes from "./routes/group/chat.routes.js";
import { initializeSocket } from "./socket/index.js";
import { startAllWorkers } from "./worker/index.js";
import http from "http";
// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET_KEY));
// sequrity middlewares
app.use(compressionMiddleware);
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(securityMiddleware);
app.set("trust proxy", 1); // trust first proxy (cloudflare, nginx, etc.)
// connct db
connectDB();

// routs
app.use("/api/auth", authRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/group", groupRoutes);

// init socket
const server = http.createServer(app);
const io = initializeSocket(server);
app.set("io", io);

// workers
startAllWorkers();

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
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
