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
    role: z.enum(['super_admin', 'admin', 'inventory_manager', 'storekeeper', 'procurement_officer', 'sales_officer', 'auditor', 'read_only']),
    warehouseId: z.string().uuid().optional().nullable(),
});
export const RefreshSchema = z.object({
    refreshToken: z.string().min(1),
});
export const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
});
