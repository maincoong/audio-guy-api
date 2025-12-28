// server.js (ESM) — Public API for joeysoundmap.com + local dev support
// ✅ Fixes your CORS issue for /health AND /api (CORS applies to all routes)
// ✅ Allows local testing (localhost/127.0.0.1) while still safe in production
//
// Install:
//   npm i express cors
//
// Run locally:
//   node server.js
//   (then your site can fetch http://localhost:3000/api/gear-notes)
//
// Deploy on Render:
//   Start command: node server.js
//   Environment variables (recommended):
//     PUBLIC_ORIGIN=https://joeysoundmap.com
//     ALLOW_WWW=true
//     ALLOW_LOCAL=false   (or true if you really want)
//   Render will provide PORT automatically.
//
// Endpoints:
//   GET /               -> "OK"
//   GET /health         -> JSON health + allowed origins
//   GET /api/gear-notes?mode=workshop|sound_design

import express from "express";
import cors from "cors";

const app = express();

// ---------- Config ----------
const PORT = Number(process.env.PORT || 3000);

// Your site origin (exact, no trailing slash)
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://joeysoundmap.com").trim();

// Allow https://www.joeysoundmap.com as well
const ALSO_ALLOW_WWW = (process.env.ALLOW_WWW || "true").toLowerCase() === "true";

// Allow localhost testing
const ALLOW_LOCAL = (process.env.ALLOW_LOCAL || "true").toLowerCase() === "true";

// If behind proxy (Render), helps correct IP/proto
app.set("trust proxy", 1);

// ---------- Allowed origins ----------
const ALLOWED_ORIGINS = new Set();

// Always allow your public origin
ALLOWED_ORIGINS.add(PUBLIC_ORIGIN);

// Optionally allow www variant automatically
if (
  ALSO_ALLOW_WWW &&
  PUBLIC_ORIGIN.includes("://") &&
  !PUBLIC_ORIGIN.includes("://www.")
) {
  ALLOWED_ORIGINS.add(PUBLIC_ORIGIN.replace("://", "://www."));
}

// Local dev origins (only if enabled)
if (ALLOW_LOCAL) {
  [
    "http://localhost:5170",
    "http://127.0.0.1:5170",
    "http://localhost:5151",
    "http://127.0.0.1:5151",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].forEach((o) => ALLOWED_ORIGINS.add(o));
}

// ---------- CORS (applies to ALL routes, including /health) ----------
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow curl/postman/health checks with no Origin header
      if (!origin) return cb(null, true);

      // Exact match allow-list
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);

      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: false,
    methods: ["GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

// Preflight for any route
app.options("*", cors());

// ---------- Data ----------
const NOTES = {
  workshop: {
    mkh8040_pair: "Chosen for low self-noise and detail in quiet parks and night recording.",
    mixpre3_ii: "My main recorder for critical work. Fast gain staging, reliable for long takes.",
    geofon: "For surface resonance and small vibrations. Useful when the environment is telling its story quietly.",
    roland_cs10em: "Binaural perspective for embodied listening and quick documentation.",
    schertler_dynuni: "Used selectively in workshops to introduce vibration and material sound.",
    zoomh6: "A dependable backup and a flexible option when I need extra inputs quickly.",
    zoomh4n_x6: "Workshop workhorses. Simple enough for students, consistent across kits.",
    zoomh4npro: "A slightly cleaner handheld option when I want a familiar workflow with a bit more headroom.",
    gutmann_windscreens: "Essential in winter and shoulder seasons. Keeps handheld recordings usable outdoors.",
    rode_ws8_x4: "Quick wind protection for handheld kits. Easy to teach, easy to deploy.",
    rode_spreader: "For stable stereo spacing when I am building a fast rig in the field.",
    smallrig_handle: "Makes handheld rigs calmer and quieter in the hand, especially during long sessions.",
  },
  sound_design: {
    mkh8040_pair: "Used when I want a clean, detailed stereo image that holds up to editing and layering.",
    mixpre3_ii: "My main recorder for sound design capture. Clean preamps and stable gain for long sessions.",
    geofon: "For material resonance and hidden vibration. Great for building textured layers from contact sound.",
    roland_cs10em: "Binaural capture for intimate perspective and movement. Useful for spatial ideas and detail.",
    schertler_dynuni:
      "Used for sound design when I want physical contact with a surface. It reveals resonance, texture, and material response.",
    zoomh6: "Good for fast sketch captures and multi-input setups when I need flexibility quickly.",
    zoomh4n_x6: "Useful for quick capture sketches and rough spatial ideas.",
    zoomh4npro: "A familiar handheld workflow when I want a little more headroom for stronger sources.",
    gutmann_windscreens: "Keeps outdoor takes usable when I am chasing texture in wind and weather.",
    rode_ws8_x4: "Quick wind protection for handheld takes when I need speed over a full rig.",
    rode_spreader: "Keeps stereo spacing consistent when building repeatable source recordings.",
    smallrig_handle: "Reduces handling noise when I am moving with a handheld rig.",
  },
};

const THEME = {
  workshop: { topBanner: "#6f9560" },
  sound_design: { topBanner: "#ff6f69" },
};

const READING = {
  workshop: [
    { title: "Listening prompts for group sessions", kind: "note" },
    { title: "Field kit etiquette: wind, handling, attention", kind: "note" },
  ],
  sound_design: [
    { title: "On notation as listening technology", kind: "score note" },
    { title: "Graphic scores and spatial form studies", kind: "score note" },
    { title: "Texture, residue, and memory in location sound", kind: "studio note" },
    { title: "Draft: how a place ‘writes’ the score", kind: "research note" },
    { title: "Reading: composition as fieldwork (selected essays)", kind: "reading" },
  ],
};

const SCORE_THOUGHT = {
  workshop: "Listening is a practice you can learn and share.",
  sound_design: "Scores are research: they hold form, attention, and memory.",
};

// ---------- Routes ----------
app.get("/", (_, res) => {
  res.type("text").send("OK");
});

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    service: "gear-notes-api",
    time: new Date().toISOString(),
    publicOrigin: PUBLIC_ORIGIN,
    allowLocal: ALLOW_LOCAL,
    allowWww: ALSO_ALLOW_WWW,
    allowedOrigins: Array.from(ALLOWED_ORIGINS),
  });
});

app.get("/api/gear-notes", (req, res) => {
  const mode = req.query.mode === "sound_design" ? "sound_design" : "workshop";

  res.setHeader("Cache-Control", "no-store");
  res.json({
    mode,
    theme: THEME[mode] || THEME.workshop,
    notes: NOTES[mode] || {},
    reading: READING[mode] || [],
    scoreThought: SCORE_THOUGHT[mode] || "",
  });
});

// ---------- Error handling ----------
app.use((err, req, res, next) => {
  const msg = String(err?.message || "Server error");
  res.status(500).json({ ok: false, error: msg });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  console.log(`PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`);
  console.log(`ALLOW_WWW=${ALSO_ALLOW_WWW}`);
  console.log(`ALLOW_LOCAL=${ALLOW_LOCAL}`);
});
