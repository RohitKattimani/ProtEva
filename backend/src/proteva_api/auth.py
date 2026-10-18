"""Google Identity Services verification and short-lived ProtEva access tokens."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any

from .settings import Settings


class AuthenticationError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthenticatedUser:
    subject: str
    email: str
    name: str | None = None
    picture: str | None = None

    def public(self) -> dict[str, str | None]:
        return {"id": self.subject, "email": self.email, "name": self.name, "picture": self.picture}


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class AuthService:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return bool(self.settings.google_oauth_client_id and self.settings.auth_signing_secret)

    def configuration(self) -> dict[str, Any]:
        return {"enabled": self.enabled, "clientId": self.settings.google_oauth_client_id if self.enabled else None}

    def verify_google_credential(self, credential: str) -> AuthenticatedUser:
        if not self.settings.google_oauth_client_id:
            raise AuthenticationError("Google sign-in is not configured on this server")
        if not isinstance(credential, str) or not credential.strip() or len(credential) > 12_000:
            raise AuthenticationError("Google credential is invalid")
        try:
            from google.auth.transport import requests
            from google.oauth2 import id_token

            payload = id_token.verify_oauth2_token(
                credential,
                requests.Request(),
                self.settings.google_oauth_client_id,
            )
        except Exception as error:
            raise AuthenticationError("Google credential could not be verified") from error
        subject = payload.get("sub")
        email = payload.get("email")
        if not isinstance(subject, str) or not subject or not isinstance(email, str) or not email:
            raise AuthenticationError("Google credential does not contain a usable identity")
        if payload.get("email_verified") is not True:
            raise AuthenticationError("Google account email is not verified")
        return AuthenticatedUser(
            subject=subject,
            email=email,
            name=payload.get("name") if isinstance(payload.get("name"), str) else None,
            picture=payload.get("picture") if isinstance(payload.get("picture"), str) else None,
        )

    def issue_access_token(self, user: AuthenticatedUser) -> tuple[str, int]:
        secret = self.settings.auth_signing_secret
        if not secret or len(secret) < 32:
            raise AuthenticationError("Server session signing is not configured securely")
        issued_at = int(time.time())
        expires_at = issued_at + self.settings.auth_token_ttl_seconds
        payload = {
            "sub": user.subject,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "iat": issued_at,
            "exp": expires_at,
        }
        encoded = _encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signature = _encode(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
        return f"v1.{encoded}.{signature}", expires_at

    def verify_access_token(self, token: str) -> AuthenticatedUser:
        secret = self.settings.auth_signing_secret
        if not secret:
            raise AuthenticationError("Server session signing is not configured")
        try:
            version, encoded, supplied_signature = token.split(".")
            expected_signature = _encode(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
            if version != "v1" or not hmac.compare_digest(supplied_signature, expected_signature):
                raise ValueError("invalid signature")
            payload = json.loads(_decode(encoded))
            if not isinstance(payload, dict) or int(payload["exp"]) <= int(time.time()):
                raise ValueError("expired")
            subject, email = payload.get("sub"), payload.get("email")
            if not isinstance(subject, str) or not isinstance(email, str):
                raise ValueError("invalid identity")
            return AuthenticatedUser(subject, email, payload.get("name"), payload.get("picture"))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            raise AuthenticationError("ProtEva access token is invalid or expired") from error

    def verify_bearer_header(self, authorization: str | None) -> AuthenticatedUser:
        if not authorization or not authorization.startswith("Bearer "):
            raise AuthenticationError("Sign in is required")
        return self.verify_access_token(authorization.removeprefix("Bearer ").strip())
