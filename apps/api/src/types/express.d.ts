import type { AuthenticatedUser } from "../auth/currentUser.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
