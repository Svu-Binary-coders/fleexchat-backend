import compression from "compression";
import { Request, Response } from "express";

export const compressionMiddleware = compression({
  level: 6, // Compression level (0-9), where 0 is no compression and 9 is maximum compression
  threshold: 1024, // >1kb allow compression, <1kb no compression
  filter: (req: Request, res: Response) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
});
