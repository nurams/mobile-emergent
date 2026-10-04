import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://attendance-hub-1493.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seed_login():
    """Login the seeded Budi account; create if missing."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "budi@example.com", "password": "rahasia123"})
    if r.status_code != 200:
        s.post(f"{BASE_URL}/api/auth/register", json={
            "email": "budi@example.com", "password": "rahasia123",
            "name": "Budi Santoso", "position": "Staff IT", "department": "Teknologi"
        })
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "budi@example.com", "password": "rahasia123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]
