import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const signToken = (payload: { userId: string; role: 'CUSTOMER' | 'ADMIN' }) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);

export const verifyToken = (token: string) => jwt.verify(token, env.JWT_SECRET) as { userId: string; role: 'CUSTOMER' | 'ADMIN' };
