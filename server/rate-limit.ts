import rateLimit from "express-rate-limit";

const tooMany = (message: string) => ({ message });

/**
 * Password hashing is deliberately slow, so unlimited login and signup attempts are both a
 * password-guessing and a CPU-exhaustion risk. Limits are per client IP (the server trusts one proxy hop).
 */
export function createAuthLimiters(overrides: { loginMax?: number; registerMax?: number } = {}) {
  return {
    // Only failed attempts count, so a player who logs in normally is never throttled.
    login: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: overrides.loginMax ?? 10,
      skipSuccessfulRequests: true,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: tooMany("Too many login attempts. Try again in a few minutes."),
    }),
    register: rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: overrides.registerMax ?? 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: tooMany("Too many signups from this connection. Try again later."),
    }),
  };
}
