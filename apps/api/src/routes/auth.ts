import { Router } from "express";
import { z } from "zod";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  setSessionCookie,
} from "../auth/cookies.js";
import { getCurrentUser, toPublicUser } from "../auth/currentUser.js";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "../auth/password.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "../middleware/rateLimit.js";
import {
  createSession,
  deleteExpiredSessions,
  revokeSession,
  revokeSessionsForUser,
} from "../repositories/sessions.js";
import { findUserCredentialsByEmail, recordLogin } from "../repositories/users.js";
import { registerVendorAccount } from "../repositories/vendorRegistration.js";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email address is required.").max(320),
  password: z.string().min(1, "Password is required.").max(200),
});

const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Supplier self-registration. Government and administrator accounts are not
 * self-service — they are provisioned by a department — so this endpoint
 * creates a VENDOR account and nothing else. The role is a literal in the
 * repository rather than anything derived from the request body (D61).
 */
const registerSchema = z
  .object({
    organizationName: z
      .string()
      .trim()
      .min(3, "Enter the registered name of your organisation.")
      .max(200),
    fullName: z.string().trim().min(2, "Enter your full name.").max(150),
    email: z.email("Enter a valid email address.").max(320),
    phone: z.string().trim().max(30).optional(),
    password: z
      .string()
      .min(MINIMUM_PASSWORD_LENGTH, `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.`)
      .max(200),
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, "You must accept the portal terms of use to register."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  })
  .refine((value) => new Set(value.password).size >= 4, {
    path: ["password"],
    message: "Choose a password made up of at least four different characters.",
  });

export const authRouter: Router = Router();

authRouter.post("/login", async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "The submitted details are not valid.",
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    const { email, password } = parsed.data;
    const rateLimitKey = `${email.toLowerCase()}|${request.ip ?? "unknown"}`;

    if (isRateLimited(rateLimitKey)) {
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Too many sign-in attempts. Try again in a few minutes.",
      );
    }

    const credentials = await findUserCredentialsByEmail(email);

    // An unknown address, a disabled account and a wrong password are
    // indistinguishable — same work performed, same response.
    if (credentials === undefined || credentials.passwordHash === null || !credentials.isActive) {
      await verifyAgainstDummyHash(password);
      recordFailedAttempt(rateLimitKey);
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "The email address or password is incorrect.",
      );
    }

    if (!(await verifyPassword(password, credentials.passwordHash))) {
      recordFailedAttempt(rateLimitKey);
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "The email address or password is incorrect.",
      );
    }

    clearAttempts(rateLimitKey);

    // A fresh sign-in never leaves an older token live, which also removes any
    // possibility of session fixation.
    await revokeSessionsForUser(credentials.id);
    await deleteExpiredSessions();

    const session = await createSession({
      userId: credentials.id,
      userAgent: request.get("user-agent"),
      ipAddress: request.ip,
    });

    await recordLogin(credentials.id);
    setSessionCookie(response, session.token, session.expiresAt);

    response.json({
      data: {
        user: toPublicUser({
          id: credentials.id,
          fullName: credentials.fullName,
          email: credentials.email,
          role: credentials.role,
          organizationId: credentials.organizationId,
          organizationName: credentials.organizationName,
          organizationKind: credentials.organizationKind,
        }),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/register", async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "The submitted details are not valid.",
        parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      );
    }

    // Registration is rate limited per client address. Unlike sign-in it cannot
    // be keyed on an existing account, so the address is the only stable key.
    const rateLimitKey = `register|${request.ip ?? "unknown"}`;
    if (isRateLimited(rateLimitKey)) {
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Too many registration attempts. Try again in a few minutes.",
      );
    }
    recordFailedAttempt(rateLimitKey);

    const { organizationName, fullName, email, phone, password } = parsed.data;

    // A supplier who already has an account needs to be told so plainly; being
    // vague here would leave them unable to proceed at all. Sign-in remains
    // uniform, so this reveals only what a password-reset flow would anyway.
    if ((await findUserCredentialsByEmail(email)) !== undefined) {
      throw new ApiError(
        409,
        "EMAIL_IN_USE",
        "An account already exists for this email address. Sign in instead.",
      );
    }

    const account = await registerVendorAccount({
      organizationName,
      fullName,
      email,
      passwordHash: await hashPassword(password),
      phone: phone === undefined || phone === "" ? null : phone,
    });

    await deleteExpiredSessions();
    const session = await createSession({
      userId: account.userId,
      userAgent: request.get("user-agent"),
      ipAddress: request.ip,
    });

    await recordLogin(account.userId);
    setSessionCookie(response, session.token, session.expiresAt);

    response.status(201).json({
      data: {
        user: toPublicUser({
          id: account.userId,
          fullName,
          email,
          role: "VENDOR",
          organizationId: account.organizationId,
          organizationName: account.organizationName,
          organizationKind: "VENDOR",
        }),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];

    // Revoked server-side before the response is sent, so a copied cookie is
    // dead regardless of whether the browser honours the clearing header.
    if (token !== undefined && token !== "") {
      await revokeSession(token);
    }

    clearSessionCookie(response);
    response.json({ data: { loggedOut: true } });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (request, response, next) => {
  try {
    response.json({ data: { user: toPublicUser(getCurrentUser(request)) } });
  } catch (error) {
    next(error);
  }
});
