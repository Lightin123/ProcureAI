"""Service-to-service authentication for the internal AI endpoints.

The AI service has no users. Its only legitimate caller is the Express backend,
which holds a shared secret and sends it on every request. This is what stops a
publicly reachable deployment from being an open endpoint that anyone can spend
the project's LLM quota through.

The token is never logged, and a rejection says only that the token was missing
or wrong — it never echoes what was sent.
"""

import logging
import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings

logger = logging.getLogger(__name__)

INTERNAL_TOKEN_HEADER = "X-Internal-Token"


async def require_internal_token(
    x_internal_token: str | None = Header(default=None, alias=INTERNAL_TOKEN_HEADER),
) -> None:
    """Rejects any caller that cannot present the configured token.

    When no token is configured the check is skipped, which keeps local
    development working against a service started without one. That state is
    only reachable outside production: the startup guard in ``main`` refuses to
    run a production process with no token, so "unconfigured" can never quietly
    become "unauthenticated in production".
    """
    expected = get_settings().ai_service_token

    if expected is None:
        return

    if x_internal_token is None or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid internal service token is required.",
        )
