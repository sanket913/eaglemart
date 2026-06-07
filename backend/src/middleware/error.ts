import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: 'Validation failed', errors: error.flatten() });
  }

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message, details: error.details });
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  return res.status(500).json({
    message: env.NODE_ENV === 'production' ? 'Internal server error' : message,
  });
};
