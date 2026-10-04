from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field, BeforeValidator
from typing import List, Optional, Annotated, Literal
from datetime import datetime, timezone, timedelta, date
from bson import ObjectId
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config & connections
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_DAYS = int(os.environ.get("ACCESS_TOKEN_DAYS", "30"))

OFFICE_DEFAULT = {
    "name": os.environ.get("OFFICE_NAME", "Kantor Pusat"),
    "lat": float(os.environ.get("OFFICE_LAT", "-6.2")),
    "lng": float(os.environ.get("OFFICE_LNG", "106.816666")),
    "radius_m": float(os.environ.get("OFFICE_RADIUS_M", "200")),
}
WORK_START_HOUR = int(os.environ.get("WORK_START_HOUR", "9"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers / base models
# ---------------------------------------------------------------------------
def _validate_object_id(v) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    position: Optional[str] = None
    department: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class BiometricState(BaseModel):
    enrolled: bool = False
    enrolled_at: Optional[str] = None
    device_id: Optional[str] = None


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    employee_id: str
    avatar_url: Optional[str] = None
    created_at: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


class EnrollIn(BaseModel):
    type: Literal["face", "fingerprint"]
    device_id: Optional[str] = None


class OfficeLocation(BaseModel):
    name: str
    lat: float
    lng: float
    radius_m: float


class AttendanceIn(BaseModel):
    lat: float
    lng: float
    method: Literal["face", "fingerprint"]


class AttendanceOut(BaseModel):
    id: str
    date: str
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    check_in_method: Optional[str] = None
    check_out_method: Optional[str] = None
    check_in_distance_m: Optional[float] = None
    status: str


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
def user_public(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get("name", ""),
        "position": doc.get("position"),
        "department": doc.get("department"),
        "employee_id": doc.get("employee_id", ""),
        "avatar_url": doc.get("avatar_url"),
        "created_at": doc.get("created_at").isoformat()
        if isinstance(doc.get("created_at"), datetime)
        else str(doc.get("created_at")),
    }


def attendance_public(doc) -> dict:
    def iso(x):
        if isinstance(x, datetime):
            if x.tzinfo is None:
                x = x.replace(tzinfo=timezone.utc)
            return x.astimezone(timezone.utc).isoformat()
        return x

    return {
        "id": str(doc["_id"]),
        "date": doc["date"],
        "check_in_time": iso(doc.get("check_in_time")),
        "check_out_time": iso(doc.get("check_out_time")),
        "check_in_method": doc.get("check_in_method"),
        "check_out_method": doc.get("check_out_method"),
        "check_in_distance_m": doc.get("check_in_distance_m"),
        "status": doc.get("status", "hadir"),
    }


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
def create_token(user_id: str) -> str:
    now = now_utc()
    claims = {"sub": user_id, "iat": now, "exp": now + timedelta(days=ACCESS_TOKEN_DAYS)}
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)]
):
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid atau kedaluwarsa",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        claims = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "iat", "exp"]},
        )
        user_id = claims["sub"]
    except Exception:
        raise unauthorized
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise unauthorized
    if not user:
        raise unauthorized
    return user


# ---------------------------------------------------------------------------
# Routes: health
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Absensi API ready"}


# ---------------------------------------------------------------------------
# Routes: auth
# ---------------------------------------------------------------------------
@api_router.post("/auth/register", response_model=PublicUser, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email sudah terdaftar")
    count = await db.users.count_documents({})
    employee_id = f"EMP{1001 + count}"
    doc = {
        "email": email,
        "password_hash": pwd_context.hash(body.password),
        "name": body.name.strip(),
        "position": body.position or "Karyawan",
        "department": body.department or "Umum",
        "employee_id": employee_id,
        "avatar_url": None,
        "biometrics": {
            "face": {"enrolled": False, "enrolled_at": None, "device_id": None},
            "fingerprint": {"enrolled": False, "enrolled_at": None, "device_id": None},
        },
        "created_at": now_utc(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return user_public(doc)


@api_router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    return TokenOut(access_token=create_token(str(user["_id"])))


@api_router.get("/auth/me", response_model=PublicUser)
async def me(user=Depends(current_user)):
    return user_public(user)


@api_router.put("/auth/profile", response_model=PublicUser)
async def update_profile(body: ProfileUpdate, user=Depends(current_user)):
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"_id": user["_id"]})
    return user_public(fresh)


# ---------------------------------------------------------------------------
# Routes: biometrics (max 1 face + 1 fingerprint per account)
# ---------------------------------------------------------------------------
@api_router.get("/biometrics")
async def get_biometrics(user=Depends(current_user)):
    bio = user.get("biometrics", {})
    return {
        "face": bio.get("face", {"enrolled": False, "enrolled_at": None, "device_id": None}),
        "fingerprint": bio.get(
            "fingerprint", {"enrolled": False, "enrolled_at": None, "device_id": None}
        ),
    }


@api_router.post("/biometrics/enroll")
async def enroll_biometric(body: EnrollIn, user=Depends(current_user)):
    bio = user.get("biometrics", {})
    current = bio.get(body.type, {})
    if current.get("enrolled"):
        raise HTTPException(
            status_code=409,
            detail=f"{body.type} sudah terdaftar. Hanya 1 {body.type} per akun.",
        )
    state = {
        "enrolled": True,
        "enrolled_at": now_utc().isoformat(),
        "device_id": body.device_id,
    }
    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {f"biometrics.{body.type}": state}}
    )
    return {"type": body.type, **state}


@api_router.delete("/biometrics/{btype}")
async def remove_biometric(btype: str, user=Depends(current_user)):
    if btype not in ("face", "fingerprint"):
        raise HTTPException(status_code=400, detail="Tipe biometrik tidak valid")
    state = {"enrolled": False, "enrolled_at": None, "device_id": None}
    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {f"biometrics.{btype}": state}}
    )
    return {"type": btype, **state}


# ---------------------------------------------------------------------------
# Routes: office location / geofence
# ---------------------------------------------------------------------------
async def get_office() -> dict:
    office = await db.settings.find_one({"key": "office_location"})
    if not office:
        return OFFICE_DEFAULT
    return {
        "name": office.get("name", OFFICE_DEFAULT["name"]),
        "lat": office["lat"],
        "lng": office["lng"],
        "radius_m": office["radius_m"],
    }


@api_router.get("/office-location", response_model=OfficeLocation)
async def office_location():
    return await get_office()


@api_router.put("/office-location", response_model=OfficeLocation)
async def set_office_location(body: OfficeLocation, user=Depends(current_user)):
    await db.settings.update_one(
        {"key": "office_location"},
        {"$set": {"key": "office_location", **body.dict()}},
        upsert=True,
    )
    return body


# ---------------------------------------------------------------------------
# Routes: attendance
# ---------------------------------------------------------------------------
def today_key() -> str:
    return now_utc().strftime("%Y-%m-%d")


async def _ensure_within_office(lat: float, lng: float):
    office = await get_office()
    dist = haversine_m(lat, lng, office["lat"], office["lng"])
    if dist > office["radius_m"]:
        raise HTTPException(
            status_code=400,
            detail=f"Anda berada di luar area kantor ({int(dist)}m dari titik).",
        )
    return dist


@api_router.post("/attendance/checkin", response_model=AttendanceOut)
async def check_in(body: AttendanceIn, user=Depends(current_user)):
    bio = user.get("biometrics", {}).get(body.method, {})
    if not bio.get("enrolled"):
        raise HTTPException(
            status_code=400,
            detail=f"Biometrik {body.method} belum terdaftar. Daftarkan di Setting.",
        )
    dist = await _ensure_within_office(body.lat, body.lng)
    d = today_key()
    existing = await db.attendance.find_one({"user_id": str(user["_id"]), "date": d})
    if existing and existing.get("check_in_time"):
        raise HTTPException(status_code=409, detail="Anda sudah check-in hari ini.")

    now = now_utc()
    is_late = now.hour > WORK_START_HOUR or (now.hour == WORK_START_HOUR and now.minute > 0)
    att_status = "terlambat" if is_late else "hadir"
    doc = {
        "user_id": str(user["_id"]),
        "date": d,
        "check_in_time": now,
        "check_in_method": body.method,
        "check_in_distance_m": round(dist, 1),
        "check_out_time": None,
        "check_out_method": None,
        "status": att_status,
        "created_at": now,
    }
    result = await db.attendance.insert_one(doc)
    doc["_id"] = result.inserted_id
    return attendance_public(doc)


@api_router.post("/attendance/checkout", response_model=AttendanceOut)
async def check_out(body: AttendanceIn, user=Depends(current_user)):
    bio = user.get("biometrics", {}).get(body.method, {})
    if not bio.get("enrolled"):
        raise HTTPException(
            status_code=400,
            detail=f"Biometrik {body.method} belum terdaftar. Daftarkan di Setting.",
        )
    await _ensure_within_office(body.lat, body.lng)
    d = today_key()
    existing = await db.attendance.find_one({"user_id": str(user["_id"]), "date": d})
    if not existing or not existing.get("check_in_time"):
        raise HTTPException(status_code=400, detail="Anda belum check-in hari ini.")
    if existing.get("check_out_time"):
        raise HTTPException(status_code=409, detail="Anda sudah check-out hari ini.")
    now = now_utc()
    await db.attendance.update_one(
        {"_id": existing["_id"]},
        {"$set": {"check_out_time": now, "check_out_method": body.method}},
    )
    fresh = await db.attendance.find_one({"_id": existing["_id"]})
    return attendance_public(fresh)


@api_router.get("/attendance/today")
async def attendance_today(user=Depends(current_user)):
    d = today_key()
    rec = await db.attendance.find_one({"user_id": str(user["_id"]), "date": d})
    if not rec:
        return {"date": d, "record": None}
    return {"date": d, "record": attendance_public(rec)}


@api_router.get("/attendance", response_model=List[AttendanceOut])
async def attendance_history(
    month: Optional[str] = None, user=Depends(current_user)
):
    query = {"user_id": str(user["_id"])}
    if month:  # format YYYY-MM
        query["date"] = {"$regex": f"^{month}"}
    records = await db.attendance.find(query).sort("date", -1).to_list(500)
    return [attendance_public(r) for r in records]


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.attendance.create_index([("user_id", 1), ("date", 1)])
    office = await db.settings.find_one({"key": "office_location"})
    if not office:
        await db.settings.insert_one({"key": "office_location", **OFFICE_DEFAULT})
    logger.info("Absensi API started")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
