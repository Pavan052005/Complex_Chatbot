require("dotenv").config();

const http = require("node:http");
const path = require("node:path");
const { GoogleGenAI } = require("@google/genai");

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 12;
const publicFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
]);

const schedule = [
  { sport: "Cricket", venue: "Outdoor pitch", hours: "7:00 AM–8:00 PM", sessions: ["7:00 AM", "9:00 AM", "11:00 AM", "2:00 PM", "4:00 PM", "6:00 PM"] },
  { sport: "Football", venue: "Football field", hours: "6:00 AM–9:00 PM", sessions: ["6:00 AM", "8:00 AM", "10:00 AM", "1:00 PM", "4:00 PM", "7:00 PM"] },
  { sport: "Swimming", venue: "Indoor pool", hours: "6:00 AM–10:00 PM", sessions: ["6:00 AM", "8:00 AM", "10:00 AM", "12:00 PM", "3:00 PM", "6:00 PM"] },
];

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function validateChatRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a JSON object.";
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return "A non-empty message is required.";
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return `Messages must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }
  if (body.history !== undefined && !Array.isArray(body.history)) {
    return "Conversation history must be a list.";
  }
  if ((body.history || []).length > MAX_HISTORY_ITEMS) {
    return `Conversation history can contain at most ${MAX_HISTORY_ITEMS} messages.`;
  }
  for (const item of body.history || []) {
    if (
      !item ||
      !["user", "model"].includes(item.role) ||
      !Array.isArray(item.parts) ||
      item.parts.length !== 1 ||
      typeof item.parts[0]?.text !== "string" ||
      item.parts[0].text.length > MAX_MESSAGE_LENGTH
    ) {
      return "Conversation history contains an invalid message.";
    }
  }
  if (body.bookings !== undefined && !Array.isArray(body.bookings)) {
    return "Bookings must be a list.";
  }
  return null;
}

async function handleChat(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: error.message });
    return;
  }

  const validationError = validateChatRequest(body);
  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    sendJson(response, 503, {
      error: "Gemini is not configured. Add GEMINI_API_KEY to your local .env file and restart the server.",
    });
    return;
  }

  const bookingSummary = Array.isArray(body.bookings)
    ? body.bookings
        .filter((booking) => booking && typeof booking.sportId === "string" && typeof booking.date === "string" && typeof booking.time === "string")
        .map((booking) => `${booking.sportId} on ${booking.date} at ${booking.time}`)
    : [];
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      timeout: 15000,
      retries: { strategy: "none" },
    },
  });
  const contents = [
    ...(body.history || []),
    {
      role: "user",
      parts: [{
        text: [
          body.message.trim(),
          `Sports Complex schedule: ${JSON.stringify(schedule)}.`,
          `The user's current bookings: ${bookingSummary.length ? bookingSummary.join("; ") : "none"}.`,
        ].join("\n"),
      }],
    },
  ];

  const models = [...new Set([MODEL, ...FALLBACK_MODELS])];
  let lastError;
  for (const [index, model] of models.entries()) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction:
            "You are the friendly Sports Complex assistant. Answer general questions about cricket, football, and swimming, including rules, terminology, equipment, scoring, skills, field and pool dimensions, and conversions between yards and meters. Give clear, useful explanations and include units for measurements; distinguish standard sizes from variations between leagues, venues, and competition rules. For reference, 1 yard is exactly 0.9144 meters, a 25-yard pool is 22.86 meters long, and an Olympic-size pool is 50 meters long (not 50 yards). You may also help with the schedules and bookings provided in the conversation. Treat the supplied schedule as the only source for this complex's session times. Never invent this venue's availability, prices, policies, or facilities. The app confirms a reservation only after the user selects a date and available time in the booking buttons; do not claim a session is booked until the app confirms it. If unsure about a sports fact, say so and avoid guessing. For questions outside these sports, politely explain what topics you can help with. Be concise and welcoming.",
        },
      });
      const reply = result.text?.trim();
      if (!reply) {
        lastError = new Error("Gemini returned an empty response.");
      } else {
        if (model !== MODEL) {
          console.info(`Gemini replied using fallback model ${model}.`);
        }
        sendJson(response, 200, { reply, model });
        return;
      }
    } catch (error) {
      lastError = error;
      if ([400, 401, 403].includes(Number(error?.status))) break;
    }

    if (index < models.length - 1) {
      console.warn(`Gemini model ${model} failed; trying fallback model ${models[index + 1]}.`);
    }
  }

  console.error("Gemini API request failed for all configured models.", lastError);
  const status = Number(lastError?.status);
  if ([429, 503, 504].includes(status)) {
    sendJson(response, 503, {
      error: "Gemini is temporarily busy across the available models. Please try again in a moment.",
    });
  } else if ([401, 403].includes(status)) {
    sendJson(response, 502, {
      error: "Gemini rejected the API key or does not allow access to the configured models. Check your key and model access.",
    });
  } else if (lastError?.message === "Gemini returned an empty response.") {
    sendJson(response, 502, { error: "Gemini returned an empty response. Please try again." });
  } else {
    sendJson(response, 502, {
      error: "Gemini could not answer using the available models. Check your internet connection and try again.",
    });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/chat") {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Use POST for the chat API." });
      return;
    }
    await handleChat(request, response);
    return;
  }
  if (url.pathname === "/api/health") {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: "Use GET for the health check." });
      return;
    }
    sendJson(response, 200, { status: "ok", configured: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
    return;
  }

  const publicFile = publicFiles.get(url.pathname);
  if (request.method !== "GET" || !publicFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, publicFile.file);
  try {
    const fs = require("node:fs");
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": publicFile.type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  } catch (error) {
    console.error(`Could not serve ${publicFile.file}.`, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Could not load the application.");
  }
});

server.listen(PORT, () => {
  console.log(`Sports Complex is running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Gemini is not configured. Add GEMINI_API_KEY to .env to enable AI chat.");
  }
});
