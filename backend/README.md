# Varun Backend — Local Setup

## 1. Install & run

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID at minimum
# (leave TWILIO_* blank until you're ready to implement that part)

flask --app app run --port 5000
# or: python app.py
```

The server listens on `http://127.0.0.1:5000`.

## 2. Point the frontend at it

The frontend (`src/AquaGuard.jsx`) reads the backend URL from
`import.meta.env.VITE_BACKEND_URL`, falling back to
`http://127.0.0.1:5000` if unset. To make this explicit, create a `.env`
file at the **frontend** project root (`varun-frontend/.env`, not the
backend one):

```
VITE_BACKEND_URL=http://127.0.0.1:5000
```

Vite only exposes env vars prefixed `VITE_` to client code, and only
picks up `.env` changes on restart — stop and re-run `npm run dev` after
adding/editing it.

## 3. Verify /health

```bash
curl http://127.0.0.1:5000/health
```

Expected: `{"status": "ok", "timestamp": "..."}` with HTTP 200. In the
frontend UI, the "Backend Online" indicator in the header should turn
green within ~10s of the backend being reachable.

## 4. Verify /simulate-alert

```bash
curl -X POST http://127.0.0.1:5000/simulate-alert \
  -H "Content-Type: application/json" \
  -d '{"severity":"critical","village":"Jharia","concern":"High TDS & turbidity","action":"Immediate inspection required"}'
```

**With `.env` filled in correctly**, you should get back:
```json
{
  "contacts": 6,
  "severity": "critical",
  "village": "Jharia",
  "twilio_sent": false,
  "twilio_error": "Twilio not configured — TWILIO_ACCOUNT_SID/AUTH_TOKEN missing (stub, not yet implemented)",
  "telegram_configured": true,
  "telegram_sent": true,
  "telegram_error": null
}
```
...and a real message should land in your Telegram chat within a second or two.

**If `telegram_sent` is `false`**, check `telegram_error` in the
response — it'll tell you directly (missing env vars, bad token, bot not
a member of the target chat/group, wrong chat ID, etc). Common early
mistake: forgetting to actually add the bot to the group chat before
grabbing its `chat_id` from `getUpdates`.

Then trigger the same flow from the actual UI (the "Simulate Emergency
Alert" button on the Alert System page) and confirm the per-authority
Telegram badges go to "Sent".

## What I need from you to finish this

- **Confirm `.env` is filled in** with a real `TELEGRAM_BOT_TOKEN` and
  `TELEGRAM_CHAT_ID` (you already have the token from BotFather — I still
  don't have the `CHAT_ID` from you).
- **Twilio credentials**, whenever you're ready to move that off the stub
  — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and the sender numbers for
  WhatsApp and SMS.
