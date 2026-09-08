# VARUN - Water Quality and Disease Risk Monitoring

VARUN is a real-time water quality monitoring system for field workers and district health teams. It combines Firebase sensor data, AI disease-risk prediction, ASHA worker reports, alerts, and a dashboard.

## Project Structure

```text
backend/       Flask API and Groq prediction worker
frontend/      React + Vite dashboard and ASHA portal
DEPLOYMENT.md  Render and Vercel deployment guide
```

## Data Flow

```text
Firebase /water.json
        |
        v
Backend sensor analysis -> Groq LLaMA prediction
        |
        v
Firebase /ai_prediction.json and /history.json
        |
        v
AquaGuard dashboard

ASHA Portal -> Firebase /asha_reports.json
ASHA Alerts -> Firebase /asha_alerts.json
```

The active Firebase database is:

```text
https://varun-735df-default-rtdb.firebaseio.com
```

Important Firebase paths:

- `/water.json` - live TDS, turbidity, pH, salinity, temperature, and drinkable state
- `/ai_prediction.json` - latest disease-risk prediction
- `/history.json` - prediction history
- `/asha_reports.json` - ASHA field reports
- `/asha_alerts.json` - ASHA alerts
- `/alerts.json` - dashboard alerts

## Local Setup

### Backend on Windows PowerShell

```powershell
Set-Location backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill `backend/.env` with the required values:

```env
FIREBASE_BASE=https://varun-735df-default-rtdb.firebaseio.com
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
PREDICT_EVERY=60
SENSOR_SMOOTH_ALPHA=0.35
PREDICT_SMOOTH_ALPHA=0.4
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

Start the backend:

```powershell
python app.py
```

Verify it:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/health
```

### Frontend

Open a second PowerShell terminal:

```powershell
Set-Location frontend
npm install
Copy-Item .env.example .env
npm run dev
```

The Vite development server normally runs at:

```text
http://localhost:5173
```

The deployed ASHA portal opens at:

```text
https://muj-varun.vercel.app/asha/
```

The main dashboard remains available at:

```text
https://muj-varun.vercel.app/
```

For local frontend configuration, `frontend/.env` should contain:

```env
VITE_BACKEND_URL=http://localhost:5000
VITE_FIREBASE_BASE=https://varun-735df-default-rtdb.firebaseio.com
```

## AI Prediction

The backend reads live values from `/water.json`, performs BIS-based threshold analysis, and sends the sensor context to Groq. The result is written to `/ai_prediction.json`.

If Groq returns invalid JSON or is temporarily unavailable, the backend uses a sensor-based fallback prediction so unsafe water still gets disease-risk values. Sensor and prediction values are smoothed to avoid sudden fluctuations.

Run one prediction cycle manually:

```powershell
Set-Location backend
python -c "import predict; print(predict.run_prediction_once())"
```

## ASHA Portal

ASHA workers can submit:

- Disease case reports
- Severity levels and notes
- Manual alerts
- Automatic alerts for critical reports

Reports and alerts are saved directly to Firebase and loaded again from:

```text
/asha_reports.json
/asha_alerts.json
```

The ASHA portal is available in the frontend route configured by the app, and the static portal entry is also present under `frontend/public/asha/`.

## Build Checks

Frontend:

```powershell
Set-Location frontend
npm run build
```

Backend:

```powershell
Set-Location backend
python -m py_compile app.py predict.py
```

## Deploy

### Render backend

Create a Render Web Service with:

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --workers 1 --threads 4 --timeout 120`

Add the backend environment variables from `backend/.env` in the Render dashboard. Do not commit `.env` files.

### Vercel frontend

Import the repository as a Vercel project with:

- Root Directory: `frontend`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Set these Vercel variables:

```env
VITE_BACKEND_URL=https://your-render-service.onrender.com
VITE_FIREBASE_BASE=https://varun-735df-default-rtdb.firebaseio.com
```

After Vercel provides its URL, set this Render variable and redeploy:

```env
FRONTEND_URL=https://your-project.vercel.app
```

For the complete deployment steps, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Security Notes

- Never commit `backend/.env` or `frontend/.env`.
- Keep Groq, Telegram, and other service credentials in Render/Vercel environment settings.
- Use one Render worker for the backend because the prediction loop runs in the background.
- Rotate credentials if they are ever exposed publicly.
