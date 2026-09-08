# Deploying VARUN — Frontend on Vercel, Backend on Render

Deploy the backend first — the frontend needs its URL.

## 1. Backend → Render

1. Push this repo to GitHub (if not already).
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect your repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --workers 1 --threads 4 --timeout 120`
     (already in `backend/Procfile`, Render picks it up automatically —
     you can leave the Start Command field blank if it detects the Procfile)
4. **Environment** tab → add every variable from `backend/.env` (Render
   does not read your local `.env` file — you must paste them in manually):
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `GROQ_API_KEY`, `FIREBASE_BASE`, `PREDICT_EVERY`, `GROQ_MODEL`
   - `FRONTEND_URL` — leave blank for now, come back and fill this in
     after step 2 gives you the Vercel URL, then **redeploy**.
   - (`TWILIO_*` — leave blank, still a stub)
5. Deploy. Once live, note the URL Render gives you, e.g.
   `https://varun-backend.onrender.com`. Test it:
   ```bash
   curl https://varun-backend.onrender.com/health
   ```

   **Free-tier note:** Render's free web services spin down after 15 min
   of no traffic and take ~30-50s to wake up on the next request — the
   frontend's "Backend Online" indicator will show offline until it wakes.

## 2. Frontend → Vercel

1. On [vercel.com](https://vercel.com) → **Add New** → **Project** →
   import the same repo.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - Build/output settings can stay default (`npm run build`, `dist`)
3. **Environment Variables** → add:
   - `VITE_BACKEND_URL` = `https://varun-backend.onrender.com` (your
     Render URL from step 1 — no trailing slash)
   - `VITE_FIREBASE_BASE` = `https://varun-735df-default-rtdb.firebaseio.com`
     (optional — only needed if you want it configurable per environment;
     the app falls back to this same value if unset)
4. Deploy. Vercel gives you a URL, e.g. `https://varun.vercel.app`.

## 3. Close the loop: tell the backend about the frontend

Go back to Render → your service → **Environment** → set:
```
FRONTEND_URL=https://varun.vercel.app
```
then **Manual Deploy → Deploy latest commit** (or it redeploys automatically
on env var save, depending on your Render plan). This restricts CORS to
your real frontend instead of allowing all origins.

## 4. Verify end-to-end

- Open the Vercel URL → header should show **Backend Online** (green)
  within ~10s (longer on Render free tier if it was asleep).
- Click **Simulate Emergency Alert** → check your Telegram chat gets the
  message.
- Open `https://your-vercel-url/asha/index.html` on your phone → fill a
  report → confirm it shows up on the dashboard's ASHA Worker Reports page
  (reads straight from Firebase, no backend involved for this part).
- If you set `GROQ_API_KEY`/`FIREBASE_BASE`, check Render's logs for
  `[predict] SAFE/WARNING/...` lines appearing every `PREDICT_EVERY`
  seconds — confirms the AI prediction loop is running.

## Notes / gotchas

- **`--workers 1`** in the Procfile is intentional: the Groq/Firebase
  prediction loop runs once per worker process. More workers would mean
  duplicate predictions and duplicate auto-alerts on the same Render
  instance.
- Both `.env` files (`backend/.env`, and any `frontend/.env` you create
  locally) are for **local dev only** — Vercel and Render each need the
  same values re-entered in their own dashboards, since they don't read
  your repo's `.env` file.
- Rotate `GROQ_API_KEY` and `TELEGRAM_BOT_TOKEN` before/after this
  submission if this repo or its history is ever made public — both were
  shared in plain text during development.
