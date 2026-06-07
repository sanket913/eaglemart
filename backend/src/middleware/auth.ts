import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/apiError.js';
import { verifyToken } from '../utils/auth.js';

export type AuthedRequest = Request & {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

export const requireAuth = async (req: AuthedRequest, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) return next(new ApiError(401, 'Authentication token is required'));

  const payload = verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return next(new ApiError(401, 'Invalid or inactive user'));

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  return next();
};

export const requireAdmin = (req: AuthedRequest, _res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') return next(new ApiError(403, 'Admin access required'));
  return next();
};
