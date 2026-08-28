import React from "react";

import { EmblemIcon } from "./GovernmentIcons.js";

/**
 * Rendered while the session is being verified. Occupies the whole viewport so
 * neither the login page nor protected content flashes before the answer.
 */
export function SessionCheck() {
  return (
    <div className="gov-session-check" role="status" aria-live="polite">
      <div className="gov-session-check__flag" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div className="gov-session-check__emblem" aria-hidden="true">
        <EmblemIcon size={44} />
      </div>
      <p className="gov-session-check__title">Verifying session</p>
      <p className="gov-session-check__subtitle">
        Confirming your credentials with the procurement portal…
      </p>
    </div>
  );
}
