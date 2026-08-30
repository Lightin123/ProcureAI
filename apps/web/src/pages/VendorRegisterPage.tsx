import React, { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import type { AuthenticatedUser } from "../api/auth.js";
import { ApiRequestError } from "../api/client.js";
import { permissionChecker, useAuth } from "../auth/AuthContext.js";
import { landingPathFor } from "../auth/routeAccess.js";
import { GovernmentAlert } from "../components/GovernmentAlert.js";
import { PasswordInput } from "../components/PasswordInput.js";
import { CheckCircleIcon, EmblemIcon, IndiaFlagIcon } from "../components/GovernmentIcons.js";
import { SessionCheck } from "../components/SessionCheck.js";

const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Supplier self-registration.
 *
 * The account created here is always a supplier account — the role is not in
 * the request and cannot be influenced from this page. Department and
 * administrator accounts are provisioned internally.
 */
export function VendorRegisterPage() {
  const { status, register, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Supplier Registration · ProcureAI";
  }, []);

  if (status === "checking") {
    return <SessionCheck />;
  }

  if (status === "authenticated") {
    return <Navigate to={landingPathFor(hasPermission) ?? "/"} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(undefined);
    setFieldErrors({});

    try {
      const authenticated: AuthenticatedUser = await register({
        organizationName,
        fullName,
        email,
        ...(phone.trim() === "" ? {} : { phone: phone.trim() }),
        password,
        confirmPassword,
        acceptedTerms: true,
      });

      // Straight into onboarding: the account exists but the capability
      // profile is empty, and an empty profile is matched against nothing.
      const landing = landingPathFor(permissionChecker(authenticated));
      await navigate(landing === "/vendor" ? "/vendor/onboarding" : (landing ?? "/"), {
        replace: true,
      });
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
        setFormError("Registration could not be completed. Check that the portal service is running.");
      }
      setSubmitting(false);
    }
  }

  const passwordsMatch = confirmPassword === "" || password === confirmPassword;
  const canSubmit =
    organizationName.trim().length >= 3 &&
    fullName.trim().length >= 2 &&
    email.trim() !== "" &&
    password.length >= MINIMUM_PASSWORD_LENGTH &&
    password === confirmPassword &&
    acceptedTerms;

  return (
    <div className="gov-login">
      <div className="gov-top-bar">
        <div className="portal-container gov-top-bar__inner">
          <div className="gov-top-bar__left">
            <IndiaFlagIcon width={22} height={15} />
            <span className="gov-top-bar__title">भारत सरकार | Government of India</span>
          </div>
          <div className="gov-top-bar__right">
            <a href="#register-form" className="gov-skip-link">
              Skip to registration
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
            <h1 className="gov-login__portal-name">Supplier Registration</h1>
            <p className="gov-login__tagline">
              Open to enterprises of every kind and every sector
            </p>

            <ul className="gov-login__points">
              <li>
                <CheckCircleIcon size={16} />
                <span>
                  Manufacturers, farmers' collectives, contractors, laboratories, service firms,
                  hospitals, training institutes and technology companies alike
                </span>
              </li>
              <li>
                <CheckCircleIcon size={16} />
                <span>
                  A guided capability profile that asks only what is relevant to your sector
                </span>
              </li>
              <li>
                <CheckCircleIcon size={16} />
                <span>
                  Published procurement requirements matched against what your organisation can
                  actually deliver
                </span>
              </li>
              <li>
                <CheckCircleIcon size={16} />
                <span>Save your progress and return at any time</span>
              </li>
            </ul>

            <p className="gov-login__notice">
              Registration creates a supplier account only. Departmental and administrator
              accounts are issued internally and cannot be created here. Information you submit
              is used to match your organisation to government requirements.
            </p>
          </section>

          <section className="gov-login__panel" id="register-form">
            <div className="gov-login__panel-header">
              <h2 className="gov-login__panel-title">Create a Supplier Account</h2>
              <p className="gov-login__panel-subtitle">
                Two minutes to register. The capability profile can be completed in stages
                afterwards.
              </p>
            </div>

            <div className="gov-login__panel-body">
              {formError !== undefined && (
                <GovernmentAlert type="error" title="Registration Failed" role="alert">
                  {formError}
                </GovernmentAlert>
              )}

              <form onSubmit={(event) => void handleSubmit(event)} noValidate>
                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-organisation">
                    Registered organisation name<span className="gov-form-required">*</span>
                  </label>
                  <p className="gov-form-hint" id="register-organisation-hint">
                    As recorded on your incorporation, registration or Udyam certificate.
                  </p>
                  <input
                    id="register-organisation"
                    className={`gov-form-control${fieldErrors.organizationName ? " gov-form-control--error" : ""}`}
                    type="text"
                    autoFocus
                    maxLength={200}
                    value={organizationName}
                    aria-describedby="register-organisation-hint"
                    onChange={(event) => setOrganizationName(event.target.value)}
                  />
                  {fieldErrors.organizationName && (
                    <p className="gov-form-error">{fieldErrors.organizationName}</p>
                  )}
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-name">
                    Your full name<span className="gov-form-required">*</span>
                  </label>
                  <input
                    id="register-name"
                    className={`gov-form-control${fieldErrors.fullName ? " gov-form-control--error" : ""}`}
                    type="text"
                    autoComplete="name"
                    maxLength={150}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                  {fieldErrors.fullName && <p className="gov-form-error">{fieldErrors.fullName}</p>}
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-email">
                    Email address<span className="gov-form-required">*</span>
                  </label>
                  <input
                    id="register-email"
                    className={`gov-form-control${fieldErrors.email ? " gov-form-control--error" : ""}`}
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  {fieldErrors.email && <p className="gov-form-error">{fieldErrors.email}</p>}
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-phone">
                    Telephone
                  </label>
                  <input
                    id="register-phone"
                    className="gov-form-control"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-password">
                    Password<span className="gov-form-required">*</span>
                  </label>
                  <p className="gov-form-hint" id="register-password-hint">
                    At least {MINIMUM_PASSWORD_LENGTH} characters. Use a phrase you will remember —
                    there is no self-service password reset yet.
                  </p>
                  <PasswordInput
                    id="register-password"
                    error={!!fieldErrors.password}
                    autoComplete="new-password"
                    value={password}
                    aria-describedby="register-password-hint"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {fieldErrors.password && <p className="gov-form-error">{fieldErrors.password}</p>}
                </div>

                <div className="gov-form-group">
                  <label className="gov-form-label" htmlFor="register-confirm">
                    Confirm password<span className="gov-form-required">*</span>
                  </label>
                  <PasswordInput
                    id="register-confirm"
                    error={!passwordsMatch || !!fieldErrors.confirmPassword}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  {!passwordsMatch && (
                    <p className="gov-form-error">The two passwords do not match.</p>
                  )}
                  {fieldErrors.confirmPassword && (
                    <p className="gov-form-error">{fieldErrors.confirmPassword}</p>
                  )}
                </div>

                <div className="gov-form-group">
                  <label className="gov-checkbox" htmlFor="register-terms">
                    <input
                      id="register-terms"
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                    />
                    <span>
                      I am authorised to register this organisation, and the information I provide
                      will be true and complete.
                    </span>
                  </label>
                  {fieldErrors.acceptedTerms && (
                    <p className="gov-form-error">{fieldErrors.acceptedTerms}</p>
                  )}
                </div>

                <button
                  className="gov-btn gov-btn--primary gov-btn--lg gov-login__submit"
                  type="submit"
                  disabled={submitting || !canSubmit}
                >
                  {submitting ? "Creating account…" : "Register and Begin Onboarding"}
                </button>
              </form>

              <p className="gov-login__help">
                Already registered? <Link to="/login">Sign in to the portal</Link>.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="gov-login__footer">
        <div className="portal-container">
          <p>ProcureAI · Public Procurement Decision Support Platform · Government of India</p>
          <p className="gov-login__footer-note">
            Developed for Smart India Hackathon 2026 (SIH26136). Demonstration system.
          </p>
        </div>
      </footer>
    </div>
  );
}
