# CodeSense AI

CodeSense AI is an AI-powered code review assistant built with FastAPI, React, PostgreSQL, and SQLAlchemy. It combines Groq Cloud AI models with static analysis tools to provide actionable bug, security, performance, complexity, and standard-violation insights.

## Features
- AI code review and security scanning
- Static analysis with Semgrep, Bandit, Radon, Flake8, Pylint, Checkstyle, PMD, and SpotBugs
- Upload support for Python, JavaScript, TypeScript, Java, C/C++, C#, Go, Rust, and ZIP archives
- Dashboard, review workspace, upload flow, review history, chat, settings, login, and registration pages

## PostgreSQL Setup
1. Copy `.env.example` to `.env` at the repository root.
2. Update `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` to match your environment.
3. Create the PostgreSQL database if you are running outside Docker.

Example local PostgreSQL URL:
```bash
postgresql+psycopg://codesense_user:codesense_password@127.0.0.1:5432/codesense_ai
```

## Alembic Migrations
Run migrations from the `backend` directory after the database is reachable:
```bash
cd backend
alembic upgrade head
```

Create a new migration when the schema changes:
```bash
cd backend
alembic revision --autogenerate -m "describe changes"
```

## Authentication Test (PostgreSQL)
After the backend is running and migrations are applied, verify register/login/session flow:

1. Register
```bash
curl -X POST http://127.0.0.1:8000/auth/register \
	-H "Content-Type: application/json" \
	-d '{"email":"dev@example.com","full_name":"Dev User","password":"StrongPass123!"}'
```

2. Login
```bash
curl -X POST http://127.0.0.1:8000/auth/login \
	-H "Content-Type: application/json" \
	-d '{"email":"dev@example.com","password":"StrongPass123!"}'
```

3. Get current user (`/auth/me`)
```bash
curl http://127.0.0.1:8000/auth/me \
	-H "Authorization: Bearer <access_token>"
```

4. Verify protected endpoints
Use the same `Authorization: Bearer <access_token>` header with `/upload`, `/review`, `/chat`, and `/reports`.

## Running Locally

### Windows One-Command Start (Recommended)
From the repository root:
```powershell
.\start-dev.cmd
```

This opens two terminals automatically:
- Backend (FastAPI/Uvicorn)
- Frontend (Vite)

If port 8000 is blocked on your machine, the script automatically picks another free backend port and wires frontend proxy to that port.

Optional first-time/full reinstall:
```powershell
.\start-dev.cmd -InstallDeps
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker
```bash
docker compose up --build
```

## Architecture
- Frontend: Vite + React + TypeScript + Tailwind CSS + Monaco Editor
- Backend: FastAPI + SQLAlchemy + JWT auth
- Database: PostgreSQL with SQLAlchemy connection pooling and Alembic migrations
- AI integration: Groq Cloud AI API with fallback heuristic engine
