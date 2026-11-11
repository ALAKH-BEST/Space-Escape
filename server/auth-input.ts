import { z } from "zod";
import type { User } from "@shared/schema";

/**
 * Registration accepts a username and a password and nothing else. Parsing drops every other
 * field, so a signup cannot set gems, ships or anything else on the account.
 */
export const registerInputSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(24, "Username must be at most 24 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
});

/** Login does not enforce the register rules, so older accounts keep working. */
export const loginInputSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/** The account as the browser may see it. The password hash never leaves the server. */
export function toPublicUser(user: User) {
  const { password: _password, ...rest } = user;
  return rest;
}

/** Postgres reports a unique-constraint violation with code 23505. */
export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}
