import morgan from "morgan";

const isProd = process.env.NODE_ENV === "production";

export const loggerMiddleware = morgan(isProd ? "combined" : "dev");
