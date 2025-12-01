from fastapi import FastAPI, Request, HTTPException, Response, Depends, Cookie
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid, json, os, random, string

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

# For local dev, allow any 127.0.0.1:55xx origin (Live Server) and localhost:55xx
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost):55\d{2}",  # covers 5500, 5501, etc.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)
WEEK_MS = 7 * 24 * 60 * 60 * 1000


def save_state(hid, data):
    with open(f"{DATA_DIR}/{hid}.json", "w") as f:
        json.dump(data, f)

def load_state(hid):
    try:
        with open(f"{DATA_DIR}/{hid}.json") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(404, "Household not found")


def generate_join_code():
    return "".join(random.choices(string.digits, k=6))


@app.post("/households")
def create_household(response: Response):
    hid = uuid.uuid4().hex
    join_code = generate_join_code()
    data = {
        "id": hid,
        "join_code": join_code,
        "state": {
            "roommates": [],
            "chores": [],
            "startEpoch": None,
            "doneByWeek": {},
        },
    }
    save_state(hid, data)

    # 🔑 NEW: set auth cookie when creating a household
    response.set_cookie(
        key="tidyup_auth",
        value=hid,
        httponly=True,
        secure=False,  # keep False for local dev; True in production with HTTPS
        samesite="Lax",
    )

    return {"id": hid, "join_code": join_code, "state": data["state"]}

@app.post("/join")
def join_household(request: Request, response: Response, code: str):
    # find the household that matches the join code
    for file in os.listdir(DATA_DIR):
        full = json.load(open(os.path.join(DATA_DIR, file)))
        if full["join_code"] == code:
            # issue cookie
            response.set_cookie(
                key="tidyup_auth",
                value=full["id"],
                httponly=True,
                secure=False,  # change to True in production (HTTPS)
                samesite="Lax",
            )
            return {"ok": True, "id": full["id"]}
    raise HTTPException(403, "Invalid join code")


def require_auth(hid: str, tidyup_auth: str | None = Cookie(None)):
    if tidyup_auth != hid:
        raise HTTPException(403, "Not authorized")
@app.get("/households/{hid}")
def get_household_meta(hid: str):
    data = load_state(hid)
    return {
        "id": hid,
        "join_code": data["join_code"],
    }

@app.get("/households/{hid}/state")
def get_state(hid: str):
    data = load_state(hid)
    return data["state"]


@app.get("/households/{hid}/state")
def get_state(hid: str):
    data = load_state(hid)
    return data["state"]


@app.post("/households/{hid}/state")
async def set_state(hid: str, req: Request, tidyup_auth: str | None = Cookie(None)):
    require_auth(hid, tidyup_auth)
    body = await req.json()
    data = load_state(hid)
    data["state"] = body
    save_state(hid, data)
    return {"ok": True}


@app.post("/households/{hid}/rotate-now")
def rotate_now(hid: str, tidyup_auth: str | None = Cookie(None)):
    require_auth(hid, tidyup_auth)
    data = load_state(hid)
    data["state"]["startEpoch"] -= WEEK_MS
    save_state(hid, data)
    return {"ok": True, "startEpoch": data["state"]["startEpoch"]}


@app.get("/")
def root():
    return {"message": "TidyUp backend with join codes is running!"}
