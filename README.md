# TicketRush

TicketRush is an online concert ticketing system for browsing events, managing venues, reserving seats, processing simulated payments, and issuing digital tickets with QR codes.

## Stack

- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy + Alembic
- Database: PostgreSQL in production, SQLite for local development
- Authentication: JWT bearer tokens with bcrypt password hashing
- Deployment targets: Vercel frontend, Render backend, Neon PostgreSQL

## Project Structure

- `frontend/` - React customer and admin web app
- `backend/` - FastAPI API, database models, migrations, seed script, tests
- `backend/alembic/versions/` - database migrations
- `backend/uploads/` - local development uploads only

## Local Setup

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python scripts\seed.py
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

For local development, set `frontend/.env` to the backend URL you are running, for example:

```env
VITE_API_URL=http://127.0.0.1:8001
```

## Environment Variables

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_MINUTES`
- `CORS_ORIGINS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SEED_SAMPLE_DATA`

Frontend:

- `VITE_API_URL`

Do not commit real `.env` files or production secrets.

## Database

Production should use a Neon PostgreSQL connection string in SQLAlchemy format:

```text
postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Run migrations:

```powershell
cd backend
.\.venv\Scripts\python -m alembic upgrade head
```

Seed required demo data:

```powershell
cd backend
.\.venv\Scripts\python scripts\seed.py
```

Set the administrator account through `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Deployment

### Backend on Render

Use `backend/` as the service root.

- Build command: `pip install -r requirements.txt && alembic upgrade head && python scripts/seed.py`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

Set the backend environment variables in Render. `CORS_ORIGINS` must include the deployed Vercel frontend URL and approved local development origins only.

### Frontend on Vercel

Use `frontend/` as the project root.

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://your-render-service.onrender.com`

`frontend/vercel.json` rewrites all routes to `index.html` so React routes work after refresh.

### Uploaded Images

The local `backend/uploads/` folder is suitable for development only. Render's normal filesystem is not permanent across redeploys. For production, configure persistent image storage before relying on uploaded posters, banners, venue images, or profile photos.

## Tests

Backend:

```powershell
cd backend
.\.venv\Scripts\python -m pytest
```

Frontend:

```powershell
cd frontend
npm run build
```

## Security Notes

- Keep secrets in platform environment variables.
- Never commit `.env`, database files, uploaded production files, or build artifacts.
- Use a strong production `JWT_SECRET`.
- Set a secure production administrator password.
- Keep `CORS_ORIGINS` restricted to the deployed frontend and approved local origins.

## Troubleshooting

- If the frontend shows "Failed to fetch," confirm `VITE_API_URL` points to the running backend.
- If admin login fails after changing credentials, restart the backend so seed repair can apply the configured administrator account.
- If images show fallback posters, confirm uploaded image URLs point to the deployed backend or persistent image host.
- If direct React routes show 404 on Vercel, confirm `frontend/vercel.json` is included.
