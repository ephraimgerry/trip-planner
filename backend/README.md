# Trip Planner — Backend (modulith)

Express + SQLite (better-sqlite3). Modular monolith: `core/` kernel + `modules/{auth,places,trips}`.

## Run
```bash
cd backend
cp .env.example .env
npm install
npm run seed     # imports ../frontend/data.js catalog into SQLite
npm start        # http://localhost:4177  (GET /health)
```

## Notes
- **Security is prepared but OFF.** `modules/auth/auth.middleware.js:requireAuth` injects a dev
  user. Turn on JWT verification there to enforce auth across every protected route.
- **DB:** SQLite now; the repository layer isolates SQL so Postgres is a drop-in for prod.
- See `../PLAN.md` for the full architecture and roadmap.
