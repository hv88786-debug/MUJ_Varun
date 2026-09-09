"""Production entry point: Flask API plus the Telegram polling worker."""

from app import app

if __name__ == "__main__":
    import os
    # The Telegram worker runs in a background thread; the Flask debug
    # reloader would start a second copy and create duplicate bot polling.
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)