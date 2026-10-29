# Sports Complex assistant

A small HTML, CSS, and JavaScript chat app for cricket, football, and swimming information, schedules, and session bookings. Ask Gemini about sports rules, terms, dimensions, and yard-to-meter measurements; the booking flow checks and saves selected slots in your browser.

## Run locally

1. In PowerShell, from this project folder, create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Open `.env` and replace `your_google_ai_studio_api_key_here` with your Google AI Studio API key. Keep the key in `.env` and do not paste it into chat, browser code, or a public repository.
3. Start the app:

   ```powershell
   npm start
   ```

4. Open <http://localhost:3000>.

The app sends chat text to the local `/api/chat` endpoint. The Node.js server reads `GEMINI_API_KEY` from `.env`, calls Gemini using the Google GenAI SDK, and returns the reply to the browser. The key is not sent to the browser. The default model is `gemini-3.5-flash`; if it is busy or unavailable, the server automatically tries `gemini-3.5-flash-lite` and `gemini-3.6-flash`. Set `GEMINI_MODEL` in `.env` to choose another primary model available to your API key.

Without a configured API key, the schedule and booking UI still loads, but AI chat requests show a setup error. Bookings are stored in this browser only; this demo does not create reservations with a real sports facility.
