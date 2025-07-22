# 🧪 Winston AI Scraper – Dev Setup Guide

### ✅ Prerequisites
- Node.js installed
- Live Server extension in VS Code

---

### 🔧 1. Start the Backend

```bash
node api/scrape.js
```

---

### 🖥️ 2. Serve the Frontend
- Open `public/index.html` with Live Server (right-click in VS Code > "Open with Live Server")
- Or use any static server to serve the `public` directory

---

### 🌐 3. Open the App
- Go to [http://localhost:5500/public/index.html](http://localhost:5500/public/index.html) (or your Live Server port)

---

### ⚠️ Common Gotchas
- **CORS/Network errors:** Do NOT open `index.html` with `file://` — always use a local server.
- **Ports:** Backend must run on `http://localhost:3000`. Frontend can be on any port (e.g., 5500 for Live Server).
- **Button mismatch:** Ensure the Download CSV button has `id="download-btn"` and matches the event listener in `main.js`.
- **Backend not running:** If you see connection errors or alerts, make sure `node api/scrape.js` is running. 