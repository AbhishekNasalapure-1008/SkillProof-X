# SkillProof X

**Don’t just claim a skill. Prove it with evidence.**

An electrician-focused prototype for Track 4 — UnlockED, Localized Vocational Skill Verification. A worker records a practical demonstration, SkillTrace maps evidence to five competencies, and a human acting as an assessor decides which skills appear on a shareable Digital Skill Passport.

## Run the app

Use Node.js 22 or newer and Python 3.11 or newer. The following commands work from this project directory in Windows PowerShell.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm.cmd ci
npm.cmd run dev
```

Open [the local workspace](http://127.0.0.1:5173/). The launcher starts Vite on port 5173 and FastAPI on port 8000. It uses the project virtual environment when present. Stop both with Ctrl+C. For this configured workspace, dependencies are already installed and `npm.cmd run dev` is sufficient.

On macOS or Linux, create the environment with `python3 -m venv .venv`, install requirements with `.venv/bin/python -m pip install -r requirements.txt`, and run `npm ci` followed by `npm run dev`. The optional `PYTHON` environment variable selects a different interpreter.

## Try the complete workflow

1. Select **Get started**, open the sample worker profile for Arjun Kumar, and choose **Start assessment**.
2. Drag in an MP4, WebM, or MOV file, browse for one, or choose **Try the illustrated sample clip**. The upload limit is 100 MB and 10 minutes. Real demonstrations belong on a de-energized training board under qualified supervision.
3. Preview the recording and choose **Analyse video**. SkillTrace shows tool identification, wire preparation, connection procedure, safety precautions, and final testing. Select a timestamp or a timeline marker to seek the original video. Expand a finding for limitations and improvements.
4. Choose **Submit for expert review** and then **Open assessor review**. The sample assessor is Meera Shah. Watch the footage, approve or reject each competency, and record feedback. **Request resubmission** sends feedback to the worker and lets them upload a replacement.
5. To issue a passport, make five individual decisions, approve at least one skill, and confirm the human review. The server enforces these rules and creates the credential in one database transaction. Each passport contains only the approved competencies from that assessment.
6. Copy the verification link, scan the QR code, or use **Print or save PDF**. An employer can also open **Verify credential** and enter the credential ID.

All seven screens are accessible from the sidebar. The worker dashboard shows all attempts, review feedback, and verified skills across issued passports. Each attempt and each passport retains its own history.

## AI and demo modes

| Mode | Evidence source | What appears in the workspace |
| --- | --- | --- |
| Demo | Fixed examples scaled to the recording’s duration | Explicit **Demo analysis** notice, sample findings and timestamps, and a playable original recording |
| Live AI | Up to 12 JPEG frames extracted locally with OpenCV, each paired with its timestamp | Gemini findings validated against the five competencies, four allowed statuses, and the sampled timestamps |

The bundled 12-second clip illustrates the workflow using a workshop photograph. Its sample findings are independent of the picture. Selecting the built-in clip always runs Demo Mode.

To enable live analysis of a personal upload, copy the example configuration, edit the copy, and restart the server.

```powershell
Copy-Item .env.example .env
```

Set `GEMINI_API_KEY` in `.env`. The default model is `gemini-flash-latest`. Set `GEMINI_MODEL` to a model available to your account that supports image input and structured output through `generateContent`. Environment variables take precedence over the file. The key stays on the backend. The live analysis button sends the sampled frames to Google. The original video remains on the local server. [Gemini image input](https://ai.google.dev/gemini-api/docs/image-understanding) · [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Each finding contains `competency`, `description`, `timestamp` in seconds or null, `status`, `limitations`, and `improvement`. A provider failure or unusable answer leaves the uploaded video available for retry. The worker can explicitly choose labelled sample findings after a failure.

## Architecture and persistence

| Location | Responsibility |
| --- | --- |
| `src/` | React, Vite, Tailwind CSS, Lucide icons, locally bundled Inter, role navigation, evidence player, reviewer controls, and QR rendering via qrcode.react |
| `backend/main.py` | FastAPI routes for upload, video byte ranges, workflow transitions, issuance, and credential lookup |
| `backend/analysis.py` | Video validation, OpenCV frame sampling, Gemini REST request, response validation, and sample evidence |
| `data/skillproof.sqlite3` | Persistent assessments, decisions, feedback, and issued credentials |
| `data/media/` | Uploaded recordings under generated filenames |
| Browser local storage | In-progress assessor decisions, feedback drafts, and sidebar preference |
| `tests/` | Isolated API and real-browser workflow tests |

Override `SKILLPROOF_DATA_DIR` to use another storage directory. Back up the entire data directory to retain both recordings and their records. Browser refreshes and server restarts preserve submitted assessments and credentials. Draft decisions stay with the browser where they were entered.

The overview image is an original built-in ImageGen asset at [public/images/electrician-workshop.webp](public/images/electrician-workshop.webp). Its prompt called for a documentary-style 4:3 photograph of a South Asian electrician in navy workwear and clear safety glasses, working at an isolated training panel in warm workshop light, without lettering or interface overlays. The bundled sample clip uses that image.

## Verification links and network access

The QR code encodes the running app’s origin plus `/#/verify/<credential-id>`. Looking up that ID queries SQLite on the same server. A fresh browser session can verify a credential without access to the worker’s browser storage.

A loopback address points to the device that opens it. For a phone demonstration on a trusted local network, start the app with the following command in place of the default development command.

```powershell
npm.cmd run dev -- --host 0.0.0.0
```

Open the app on the host computer using its reachable LAN IP and port 5173, then open the passport there to generate a QR code with that address. The phone needs access to that host and port. Vite proxies the API to loopback. Authentication is outside this prototype, so anyone with access to the app can open the assessor role.

## Build and test

```powershell
npm.cmd run build
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_backend.py -v
npm.cmd run test:e2e
```

If using an existing Python installation instead of the project environment, substitute `python` for the virtual-environment executable. The browser test uses installed Chrome, Chromium, or Edge. Set `CHROME_PATH` if the executable is in a different location. Build first because the test runs against the production bundle.

- Five Python tests cover upload validation and file cleanup, issuance rules, repeat requests, actual JPEG extraction with a mocked provider, failure recovery, and rejection of malformed findings.
- The Playwright workflow runs in its own temporary database. It uploads a real WebM, checks timestamp seeking, requests a replacement, resumes a review after refresh, approves two skills, rejects three, and checks the issued passport.
- It decodes the QR image, renders a print PDF, restarts the server, verifies the credential in a fresh browser, checks an unknown ID, and inspects all seven screens at mobile width. Set `SKILLPROOF_SCREENSHOTS=1` to save screenshots under `tests/output/`.
- The build, five backend tests, and browser workflow passed on this Windows machine. Live Gemini inference remains unverified because this environment had no provider key.

For a single-process local preview of the production build, run `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8080` after building and open [the built app](http://127.0.0.1:8080/).

## Prototype limits and 24-hour hackathon scope

- **Credentials and identity.** Worker and assessor identities are sample profiles. Human review occurs through the assessor interface. Credentials demonstrate the workflow and carry no government-recognized certification. Add role-based sign-in, assessor onboarding, revocation, and audit history before real issuance.
- **AI coverage.** Sparse still frames can miss motion, speech, continuity, meter readings, and steps between samples. Validate live results against real recordings with qualified assessors and tune the rubric and sampling strategy.
- **Language and trades.** The current interface and rubric target electricians in English. Add localized recording prompts and assessor-reviewed plumber and mason rubrics.
- **Storage and sharing.** The registry and media live on one machine. Add managed storage, access controls, consent and retention settings, and a stable verification origin for public use.
- **Video compatibility.** Playback depends on the browser’s codecs and a container with a readable duration. A conventional H.264 MP4 or VP8 WebM is suitable for demonstrations.
