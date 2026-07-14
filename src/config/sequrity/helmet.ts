import helmet from "helmet";

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"], // allow images from self, data URIs, and HTTPS sources
      connectSrc: ["'self'", "wss:", "https:"], // websocket and API calls
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 2 * 365 * 24 * 60 * 60, // 2 years in seconds
    includeSubDomains: true,
    preload: true,
  },
});
