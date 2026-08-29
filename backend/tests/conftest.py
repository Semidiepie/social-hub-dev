import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def alex_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "alex@postmeplex.com", "password": "Test123!"})
    assert r.status_code == 200, f"alex login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def maria_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "maria@postmeplex.com", "password": "Test123!"})
    assert r.status_code == 200, f"maria login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def alex_user(api_client, alex_token):
    r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {alex_token}"})
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def maria_user(api_client, maria_token):
    r = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {maria_token}"})
    assert r.status_code == 200
    return r.json()


def has_objectid(obj):
    """Recursive check for _id leakage."""
    if isinstance(obj, dict):
        if "_id" in obj:
            return True
        return any(has_objectid(v) for v in obj.values())
    if isinstance(obj, list):
        return any(has_objectid(v) for v in obj)
    return False
