import { z } from "zod";
export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });
export const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), studentNumber: z.string().trim().min(3).max(40), password: z.string().min(8).max(100).regex(/[A-Za-z]/).regex(/[0-9]/) });
export const passwordSchema = z.string().min(8).max(100).regex(/[A-Za-z]/).regex(/[0-9]/);
