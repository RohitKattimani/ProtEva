from __future__ import annotations

import time

import pytest

from proteva_api.auth import AuthService, AuthenticationError, AuthenticatedUser
from proteva_api.settings import Settings


def settings() -> Settings:
    return Settings(
        google_oauth_client_id="1234567890-example.apps.googleusercontent.com",
        auth_signing_secret="x" * 48,
        auth_token_ttl_seconds=600,
    )


def test_access_token_round_trip_and_tamper_rejection():
    service = AuthService(settings())
    token, expires_at = service.issue_access_token(AuthenticatedUser("subject-1", "researcher@example.com", "Researcher"))
    assert expires_at > int(time.time())
    assert service.verify_bearer_header(f"Bearer {token}").email == "researcher@example.com"
    with pytest.raises(AuthenticationError):
        service.verify_access_token(token + "x")


def test_google_credential_is_verified_against_configured_audience(monkeypatch):
    captured = {}
    def verify(credential, request, audience):
        captured.update({"credential": credential, "audience": audience})
        return {"sub": "google-subject", "email": "researcher@example.com", "email_verified": True, "name": "Researcher"}

    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", verify)
    user = AuthService(settings()).verify_google_credential("google-id-token")
    assert user.subject == "google-subject"
    assert captured == {"credential": "google-id-token", "audience": "1234567890-example.apps.googleusercontent.com"}


def test_unverified_or_invalid_google_identity_is_rejected(monkeypatch):
    monkeypatch.setattr(
        "google.oauth2.id_token.verify_oauth2_token",
        lambda *_: {"sub": "google-subject", "email": "researcher@example.com", "email_verified": False},
    )
    with pytest.raises(AuthenticationError, match="not verified"):
        AuthService(settings()).verify_google_credential("google-id-token")


def test_insecure_server_signing_secret_is_rejected():
    service = AuthService(Settings(google_oauth_client_id="client", auth_signing_secret="short"))
    with pytest.raises(AuthenticationError, match="configured securely"):
        service.issue_access_token(AuthenticatedUser("subject", "researcher@example.com"))
