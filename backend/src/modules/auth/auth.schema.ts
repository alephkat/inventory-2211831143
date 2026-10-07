import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const RegisterSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8),
  roleId: z.string().uuid(),
  warehouseId: z.string().uuid().optional().nullable(),
});

export const PublicRegisterSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8),
  captchaToken: z.string().min(1),
  captchaAnswer: z.number().int().min(0),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type PublicRegisterInput = z.infer<typeof PublicRegisterSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
