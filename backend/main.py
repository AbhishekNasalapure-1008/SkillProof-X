import json
import os
import sqlite3
import threading
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .analysis import COMPETENCIES, inspect_video, live_findings, sample_findings


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DATA = Path(os.getenv("SKILLPROOF_DATA_DIR", str(ROOT / "data")))
MEDIA = DATA / "media"
WORKER = {"name": "Arjun Kumar", "profession": "Electrician"}
ASSESSOR = {"name": "Meera Shah", "role": "Electrical training assessor", "profile": "Sample assessor profile"}
TYPES = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}
MAX_SIZE = 100 * 1024 * 1024
jobs = set()
jobs_lock = threading.Lock()


@contextmanager
def db(write=False):
    connection = sqlite3.connect(DATA / "skillproof.sqlite3", timeout=15)
    try:
        if write:
            connection.execute("BEGIN IMMEDIATE")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


@asynccontextmanager
async def lifespan(_app):
    MEDIA.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, doc TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, assessment TEXT UNIQUE NOT NULL, doc TEXT NOT NULL);
        """)
    yield


app = FastAPI(title="SkillProof X", lifespan=lifespan)


def now():
    return datetime.now(timezone.utc).isoformat()


def assessment(conn, identifier):
    row = conn.execute("SELECT doc FROM assessments WHERE id = ?", (identifier,)).fetchone()
    if row is None:
        raise HTTPException(404, "Assessment could not be found in this workspace.")
    return json.loads(row[0])


def save(conn, doc):
    conn.execute("UPDATE assessments SET doc=? WHERE id=?", (json.dumps(doc), doc["id"]))
    return doc


def require_status(doc, status):
    if doc["status"] != status:
        raise HTTPException(409, "This assessment has changed. Refresh the workspace to see its current status.")


def media_path(doc):
    return MEDIA / (doc["id"] + Path(doc["filename"]).suffix.lower())


@app.get("/api/workspace")
def workspace():
    with db() as conn:
        return {
            "worker": WORKER, "assessor": ASSESSOR, "competencies": COMPETENCIES,
            "live": bool(os.getenv("GEMINI_API_KEY", "").strip()),
            "assessments": [json.loads(r[0]) for r in conn.execute("SELECT doc FROM assessments ORDER BY rowid DESC")],
            "credentials": [json.loads(r[0]) for r in conn.execute("SELECT doc FROM credentials ORDER BY rowid DESC")],
        }


@app.post("/api/assessments", status_code=201)
async def upload(request: Request, filename: str = Query(min_length=1, max_length=240), replaces: str | None = None, sample: bool = False):
    filename = Path(filename.replace(chr(92), "/")).name
    suffix = Path(filename).suffix.lower()
    if suffix not in TYPES:
        raise HTTPException(415, "Choose an MP4, WebM or MOV video.")
    identifier = uuid.uuid4().hex
    path = MEDIA / (identifier + suffix)
    total = 0
    completed = False
    try:
        with path.open("xb") as stream:
            async for chunk in request.stream():
                total += len(chunk)
                if total > MAX_SIZE:
                    raise HTTPException(413, "The video exceeds the 100 MB limit.")
                stream.write(chunk)
        if not total:
            raise HTTPException(422, "The selected video is empty.")
        duration = await run_in_threadpool(inspect_video, path)
        doc = dict(id=identifier, filename=filename, duration=duration, size=total, created=now(), status="uploaded",
                   mode=None, findings=[], frames=[], decisions={}, feedback="", credentialId=None, replaces=replaces, sampleClip=sample)
        with db(write=True) as conn:
            if replaces:
                previous = assessment(conn, replaces)
                require_status(previous, "resubmission")
                previous["status"] = "replaced"
                save(conn, previous)
            conn.execute("INSERT INTO assessments VALUES (?,?)", (identifier, json.dumps(doc)))
        completed = True
        return doc
    finally:
        if not completed:
            path.unlink(missing_ok=True)


@app.get("/api/assessments/{identifier}/video")
def video(identifier: str):
    with db() as conn:
        doc = assessment(conn, identifier)
    path = media_path(doc)
    if not path.is_file():
        raise HTTPException(404, "Video file is missing from local storage.")
    return FileResponse(path, media_type=TYPES[path.suffix])


@app.post("/api/assessments/{identifier}/analyse")
def analyse(identifier: str, demo: bool = False):
    with db() as conn:
        doc = assessment(conn, identifier)
    if doc["findings"]:
        return doc
    require_status(doc, "uploaded")
    with jobs_lock:
        if identifier in jobs:
            raise HTTPException(409, "Analysis is already running for this video.")
        jobs.add(identifier)
    try:
        if not demo and not doc.get("sampleClip"):
            findings, frames = live_findings(media_path(doc), doc["duration"])
            mode = "live"
        else:
            findings, frames, mode = sample_findings(doc["duration"]), [], "demo"
        with db(write=True) as conn:
            doc = assessment(conn, identifier)
            if doc["findings"]:
                return doc
            doc.update(status="analysed", mode=mode, findings=findings, frames=frames)
            return save(conn, doc)
    finally:
        with jobs_lock:
            jobs.discard(identifier)


@app.post("/api/assessments/{identifier}/submit")
def submit(identifier: str):
    with db(write=True) as conn:
        doc = assessment(conn, identifier)
        if doc["status"] == "pending":
            return doc
        require_status(doc, "analysed")
        doc["status"] = "pending"
        return save(conn, doc)


class Review(BaseModel):
    action: Literal["issue", "resubmit"]
    decisions: dict[str, Literal["approved", "rejected"]]
    feedback: str = Field(default="", max_length=2000)
    confirmed: bool = False


@app.post("/api/assessments/{identifier}/review")
def review(identifier: str, body: Review):
    with db(write=True) as conn:
        doc = assessment(conn, identifier)
        require_status(doc, "pending")
        if set(body.decisions) - set(COMPETENCIES):
            raise HTTPException(422, "Unrecognized competency.")
        feedback = body.feedback.strip()
        if body.action == "resubmit":
            if not feedback:
                raise HTTPException(422, "Explain what the worker needs to record again.")
            doc["status"] = "resubmission"
        else:
            approved = [name for name in COMPETENCIES if body.decisions.get(name) == "approved"]
            if not body.confirmed or set(body.decisions) != set(COMPETENCIES) or not approved:
                raise HTTPException(422, "Review all five competencies, approve at least one, and confirm your review.")
            cred_id = "SPX-" + uuid.uuid4().hex[:12].upper()
            issued = now()
            credential = dict(id=cred_id, assessmentId=identifier, worker=WORKER, assessor=ASSESSOR, issued=issued,
                              competencies=approved, status="Valid", demonstration=True, evidenceMode=doc["mode"])
            conn.execute("INSERT INTO credentials VALUES (?,?,?)", (cred_id, identifier, json.dumps(credential)))
            doc.update(status="issued", credentialId=cred_id)
        doc.update(feedback=feedback, decisions=body.decisions, reviewed=now())
        return save(conn, doc)


@app.get("/api/verify/{identifier}")
def verify(identifier: str):
    with db() as conn:
        row = conn.execute("SELECT doc FROM credentials WHERE id=?", (identifier.strip().upper(),)).fetchone()
        if not row:
            raise HTTPException(404, "No credential with this ID was issued in this workspace.")
        return json.loads(row[0])


if (ROOT / "dist" / "index.html").is_file():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
