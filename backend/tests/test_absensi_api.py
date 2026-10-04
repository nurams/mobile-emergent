"""End-to-end backend tests for absensi (attendance) API.
Covers: health, auth (register/login/me), biometrics (max 1 per type),
office location, geofence check-in/out, duplicate guards, history filter.
"""
import time
import uuid
import pytest
import requests
from datetime import datetime


# ---------- Health ----------
def test_root_health(api, base_url):
    r = api.get(f"{base_url}/api/")
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Auth ----------
class TestAuth:
    def _unique_email(self):
        return f"TEST_{uuid.uuid4().hex[:10]}@example.com"

    def test_register_login_me_flow(self, api, base_url):
        email = self._unique_email()
        payload = {"email": email, "password": "rahasia123", "name": "TEST User",
                   "position": "QA", "department": "Teknologi"}
        r = api.post(f"{base_url}/api/auth/register", json=payload)
        assert r.status_code == 201, r.text
        u = r.json()
        assert u["email"] == email.lower()
        assert u["employee_id"].startswith("EMP")
        assert u["name"] == "TEST User"

        # duplicate -> 409
        r2 = api.post(f"{base_url}/api/auth/register", json=payload)
        assert r2.status_code == 409

        # login
        r3 = api.post(f"{base_url}/api/auth/login", json={"email": email, "password": "rahasia123"})
        assert r3.status_code == 200
        token = r3.json()["access_token"]
        assert token

        # wrong password -> 401
        r4 = api.post(f"{base_url}/api/auth/login", json={"email": email, "password": "wrong"})
        assert r4.status_code == 401

        # me w/o token -> 401
        r5 = api.get(f"{base_url}/api/auth/me")
        assert r5.status_code == 401

        # me with invalid token -> 401
        r6 = api.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer bogus"})
        assert r6.status_code == 401

        # me with valid token -> 200
        r7 = api.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r7.status_code == 200
        assert r7.json()["email"] == email.lower()


# ---------- Office location ----------
def test_office_location(api, base_url):
    r = api.get(f"{base_url}/api/office-location")
    assert r.status_code == 200
    data = r.json()
    for k in ("name", "lat", "lng", "radius_m"):
        assert k in data
    assert isinstance(data["lat"], (int, float))
    assert data["radius_m"] > 0


# ---------- Fresh user helper ----------
@pytest.fixture
def fresh_user(api, base_url):
    email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
    api.post(f"{base_url}/api/auth/register", json={
        "email": email, "password": "rahasia123", "name": "TEST Fresh",
    })
    r = api.post(f"{base_url}/api/auth/login", json={"email": email, "password": "rahasia123"})
    token = r.json()["access_token"]
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


# ---------- Biometrics ----------
class TestBiometrics:
    def test_default_states_false(self, api, base_url, fresh_user):
        r = api.get(f"{base_url}/api/biometrics", headers=fresh_user["headers"])
        assert r.status_code == 200
        data = r.json()
        assert data["face"]["enrolled"] is False
        assert data["fingerprint"]["enrolled"] is False

    def test_enroll_and_duplicate_block(self, api, base_url, fresh_user):
        # enroll face
        r = api.post(f"{base_url}/api/biometrics/enroll",
                     json={"type": "face", "device_id": "web-test"},
                     headers=fresh_user["headers"])
        assert r.status_code == 200
        assert r.json()["enrolled"] is True

        # verify GET reflects
        r2 = api.get(f"{base_url}/api/biometrics", headers=fresh_user["headers"])
        assert r2.json()["face"]["enrolled"] is True
        assert r2.json()["fingerprint"]["enrolled"] is False

        # duplicate same type -> 409
        r3 = api.post(f"{base_url}/api/biometrics/enroll",
                      json={"type": "face"}, headers=fresh_user["headers"])
        assert r3.status_code == 409

        # enroll fingerprint ok
        r4 = api.post(f"{base_url}/api/biometrics/enroll",
                      json={"type": "fingerprint"}, headers=fresh_user["headers"])
        assert r4.status_code == 200

        # duplicate fingerprint -> 409
        r5 = api.post(f"{base_url}/api/biometrics/enroll",
                      json={"type": "fingerprint"}, headers=fresh_user["headers"])
        assert r5.status_code == 409

    def test_delete_biometric_resets(self, api, base_url, fresh_user):
        api.post(f"{base_url}/api/biometrics/enroll",
                 json={"type": "face"}, headers=fresh_user["headers"])
        r = api.delete(f"{base_url}/api/biometrics/face", headers=fresh_user["headers"])
        assert r.status_code == 200
        assert r.json()["enrolled"] is False

        # verify
        r2 = api.get(f"{base_url}/api/biometrics", headers=fresh_user["headers"])
        assert r2.json()["face"]["enrolled"] is False

        # invalid type
        r3 = api.delete(f"{base_url}/api/biometrics/retina", headers=fresh_user["headers"])
        assert r3.status_code == 400


# ---------- Attendance (check-in/out + geofence + duplicates) ----------
class TestAttendance:
    OFFICE_LAT = -6.2
    OFFICE_LNG = 106.816666
    FAR_LAT = -6.5
    FAR_LNG = 107.0

    def _enroll_face(self, api, base_url, headers):
        api.post(f"{base_url}/api/biometrics/enroll", json={"type": "face"}, headers=headers)

    def test_checkin_requires_biometric(self, api, base_url, fresh_user):
        r = api.post(f"{base_url}/api/attendance/checkin",
                     json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                     headers=fresh_user["headers"])
        assert r.status_code == 400
        assert "belum terdaftar" in r.json()["detail"].lower()

    def test_checkin_outside_radius(self, api, base_url, fresh_user):
        self._enroll_face(api, base_url, fresh_user["headers"])
        r = api.post(f"{base_url}/api/attendance/checkin",
                     json={"lat": self.FAR_LAT, "lng": self.FAR_LNG, "method": "face"},
                     headers=fresh_user["headers"])
        assert r.status_code == 400
        assert "luar area" in r.json()["detail"].lower()

    def test_full_flow_checkin_checkout_duplicates(self, api, base_url, fresh_user):
        headers = fresh_user["headers"]
        self._enroll_face(api, base_url, headers)

        # today empty
        r0 = api.get(f"{base_url}/api/attendance/today", headers=headers)
        assert r0.status_code == 200
        assert r0.json()["record"] is None

        # checkout before checkin -> 400
        r_pre = api.post(f"{base_url}/api/attendance/checkout",
                        json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                        headers=headers)
        assert r_pre.status_code == 400

        # checkin
        r1 = api.post(f"{base_url}/api/attendance/checkin",
                     json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                     headers=headers)
        assert r1.status_code == 200, r1.text
        rec = r1.json()
        assert rec["check_in_time"]
        assert rec["check_in_method"] == "face"
        assert rec["check_in_distance_m"] is not None and rec["check_in_distance_m"] < 50

        # today reflects (compare only up to seconds; mongo trims microseconds + tz drops)
        r2 = api.get(f"{base_url}/api/attendance/today", headers=headers)
        assert r2.json()["record"]["check_in_time"][:19] == rec["check_in_time"][:19]

        # duplicate checkin -> 409
        r3 = api.post(f"{base_url}/api/attendance/checkin",
                     json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                     headers=headers)
        assert r3.status_code == 409

        # checkout
        r4 = api.post(f"{base_url}/api/attendance/checkout",
                     json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                     headers=headers)
        assert r4.status_code == 200
        assert r4.json()["check_out_time"]

        # duplicate checkout -> 409
        r5 = api.post(f"{base_url}/api/attendance/checkout",
                     json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                     headers=headers)
        assert r5.status_code == 409

    def test_history_filter_by_month(self, api, base_url, fresh_user):
        headers = fresh_user["headers"]
        self._enroll_face(api, base_url, headers)
        api.post(f"{base_url}/api/attendance/checkin",
                 json={"lat": self.OFFICE_LAT, "lng": self.OFFICE_LNG, "method": "face"},
                 headers=headers)

        this_month = datetime.utcnow().strftime("%Y-%m")
        r = api.get(f"{base_url}/api/attendance?month={this_month}", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Sorted desc by date
        dates = [row["date"] for row in data]
        assert dates == sorted(dates, reverse=True)

        # Different month -> empty
        r2 = api.get(f"{base_url}/api/attendance?month=1999-01", headers=headers)
        assert r2.status_code == 200
        assert r2.json() == []


# ---------- Seeded user compatibility ----------
def test_seeded_budi_login(seed_login, base_url):
    assert seed_login
