import React, { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import type { AuthenticatedUser } from "../api/auth.js";
import { ApiRequestError } from "../api/client.js";
import { permissionChecker, useAuth } from "../auth/AuthContext.js";
import { canAccessPath, landingPathFor } from "../auth/routeAccess.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { PasswordInput } from "../components/PasswordInput.js";
import { EmblemIcon, CheckCircleIcon, IndiaFlagIcon } from "../components/GovernmentIcons.js";
import { SessionCheck } from "../components/SessionCheck.js";

const DEMO_ACCOUNTS = [
  { email: "official@procureai.local", role: "Government Official" },
  { email: "admin@procureai.local", role: "Administrator" },
  { email: "official.health@procureai.local", role: "Official, second department" },
  { email: "vendor@procureai.local", role: "Supplier — Demo Vendor Solutions" },
  { email: "supplier.agri@procureai.local", role: "Supplier — agriculture" },
  { email: "supplier.manufacturing@procureai.local", role: "Supplier — manufacturing" },
  { email: "supplier.health@procureai.local", role: "Supplier — healthcare" },
];

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { status, sessionExpired, login, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Sign In · ProcureAI";
  }, []);

  /**
   * The remembered location belongs to whoever was interrupted, which is not
   * necessarily whoever just signed in — after a sign-out and a switch of
   * account it can point at a section this user may not open. Honour it only
   * if this user can actually reach it; otherwise start them at their own
   * landing page.
   *
   * The permission check is made against the user passed in rather than against
   * context: immediately after `login()` resolves, this component has not
   * re-rendered, so the context value still describes the previous (anonymous)
   * visitor and every destination would fail the check.
   */
  function destinationFor(check: (permission: string) => boolean): string {
    const from = (location.state as LocationState | null)?.from;
    const landing = landingPathFor(check) ?? "/";

    if (from === undefined || from === "/login") {
      return landing;
    }

    return canAccessPath(from, check) ? from : landing;
  }

  if (status === "checking") {
    return <SessionCheck />;
  }

  if (status === "authenticated") {
    return <Navigate to={destinationFor(hasPermission)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});

    try {
      const authenticated: AuthenticatedUser = await login(email, password);
      await navigate(destinationFor(permissionChecker(authenticated)), { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const detail of error.details) {
            mapped[detail.field] = detail.message;
          }
          setFieldErrors(mapped);
        }
        setFormError(error.message);
      } else {
        setFormError("Sign-in could not be completed. Check that the portal service is running.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="gov-login">
      <div className="gov-top-bar">
        <div className="portal-container gov-top-bar__inner">
          <div className="gov-top-bar__left">
            <IndiaFlagIcon width={22} height={15} />
            <span className="gov-top-bar__title">भारत सरकार | Government of India</span>
          </div>
          <div className="gov-top-bar__right">
            <a href="#login-form" className="gov-skip-link">
              Skip to sign in
            </a>
          </div>
        </div>
      </div>

      <main className="gov-login__main">
        <div className="portal-container gov-login__grid">
          <section className="gov-login__identity">
            <div className="gov-login__emblem" aria-hidden="true">
              <EmblemIcon size={70} />
            </div>
            <p className="gov-login__ministry">
              Ministry of Commerce &amp; Industry · Government of India
            </p>
            <h1 className="gov-login__portal-name">ProcureAI</h1>
            <p className="gov-login__tagline">Public Procurement Decision Support Platform</p>

            <ul className="gov-login__points">
              <li>
                <CheckCircleIcon size={16} />
                <span>AI-assisted requirement analysis, reviewed and approved by an official</span>
              </li>
              <li>
                <CheckCircleIcon size={16} />
                <span>Every decision recorded against the official who made it</span>
              </li>
              <li>
                <CheckCircleIcon size={16} />
                <span>Access restricted to your department's procurement records</span>
              </li>
            </ul>

            <p className="gov-login__notice">
              This is a restricted Government of India system. Access is monitored and recorded.
              Unauthorised use is prohibited.
            </p>
          </section>

          <section className="gov-login__panel" id="login-form">
            <div className="gov-login__panel-header">
              <h2 className="gov-login__panel-title">Official Sign In</h2>
              <p className="gov-login__panel-subtitle">
                Use the credentials issued by your department administrator.
              </p>
            </div>

            <div className="gov-login__panel-body">
              {sessionExpired && (
                <GovernmentAlert type="warning" title="Session Ended" role="status">
                  Your session expired due to inactivity. Sign in again to continue.
                </GovernmentAlert>
              )}

              {formError !== undefined && (
                <GovernmentAlert type="error" title="Sign-In Failed" role="alert">
                  {formError}
                </GovernmentAlert>
              )}

              <form onSubmit={(event) => void handleSubmit(event)} noValidate>
                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="login-email">
                    Registered Email Address
                    <span className="gov-form-required">*</span>
                  </label>
                  <input
                    id="login-email"
                    className={`gov-form-control${fieldErrors.email ? " gov-form-control--error" : ""}`}
                    type="email"
                    name="email"
                    autoComplete="username"
                    autoFocus
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                  />
                  {fieldErrors.email && (
                    <p className="gov-form-error" id="login-email-error">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="login-password">
                    Password
                    <span className="gov-form-required">*</span>
                  </label>
                  <PasswordInput
                    id="login-password"
                    error={!!fieldErrors.password}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                  />
                  {fieldErrors.password && (
                    <p className="gov-form-error" id="login-password-error">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <button
                  className="gov-btn gov-btn--primary gov-btn--lg gov-login__submit"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Verifying credentials…" : "Sign In"}
                </button>
              </form>

              <p className="gov-login__help">
                Forgotten your password? Contact your department administrator to have it reset.
              </p>

              <div className="gov-login__register">
                <p className="gov-login__register-title">Are you a supplier?</p>
                <p className="gov-login__register-text">
                  Startups, manufacturers, service providers and solution providers across every
                  sector can register directly. Government and administrator accounts are issued
                  by the department and cannot be created here.
                </p>
                <Link className="gov-btn gov-btn--secondary" to="/register">
                  Register your organisation
                </Link>
              </div>
            </div>

            {import.meta.env.DEV && (
              <div className="gov-login__demo">
                <p className="gov-login__demo-title">Development demo accounts</p>
                <ul>
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.email}>
                      <button
                        type="button"
                        className="gov-login__demo-fill"
                        onClick={() => setEmail(account.email)}
                      >
                        {account.email}
                      </button>
                      <span>{account.role}</span>
                    </li>
                  ))}
                </ul>
                <p className="gov-login__demo-note">
                  Password is the <code>SEED_DEMO_PASSWORD</code> set in <code>apps/api/.env</code>.
                  Run <code>npm run seed</code> to create or reset these accounts. This panel is not
                  included in a production build.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="gov-login__footer">
        <div className="portal-container">
          <p>
            ProcureAI · Public Procurement Decision Support Platform · Government of India
          </p>
          <p className="gov-login__footer-note">
            Developed for Smart India Hackathon 2026 (SIH26136). Demonstration system.
          </p>
        </div>
      </footer>
    </div>
  );
}
