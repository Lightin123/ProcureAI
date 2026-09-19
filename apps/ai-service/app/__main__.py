"""Runs the service with the bind address taken from configuration.

``python -m app`` binds to ``HOST``/``PORT``, which default to loopback and
8000. A deployment sets ``HOST=0.0.0.0`` and takes ``PORT`` from the platform;
a development machine that sets neither stays off its local network.
"""

import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
