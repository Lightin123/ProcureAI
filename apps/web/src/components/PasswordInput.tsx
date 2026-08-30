import React, { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./GovernmentIcons.js";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function PasswordInput({ error, className, value, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const stringValue = typeof value === "string" ? value : "";
  const hasValue = stringValue.length > 0;

  return (
    <div className="gov-password-input-wrap">
      <input
        className={`gov-form-control ${className || ""}${error ? " gov-form-control--error" : ""}`}
        type={showPassword ? "text" : "password"}
        value={value}
        {...props}
      />
      {hasValue && (
        <button
          type="button"
          className="gov-password-toggle"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
        </button>
      )}
    </div>
  );
}
