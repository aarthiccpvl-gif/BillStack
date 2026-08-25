import { z } from 'zod';
import { optionalText } from './common';

/**
 * One schema, two consumers: the login form validates against it in the browser and
 * the API validates the same payload again on the server. There is no second
 * definition that could drift.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email address is required')
  .max(190, 'Email address is too long')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

/**
 * Password policy. Deliberately about length and variety rather than a wall of
 * rules: this is an internal finance system, and the accounts are few and known.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Include a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Include an uppercase letter')
  .refine((value) => /\d/.test(value), 'Include a number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(150),
  email: emailSchema,
  roleId: z.coerce.number().int().positive('Select a role'),
  phone: optionalText(30),
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  /* Optional on top of optionalText: a partial update may omit the key entirely,
     which is different from sending null to clear the number. */
  phone: optionalText(30).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
  mustChangePassword: z.boolean().default(true),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
