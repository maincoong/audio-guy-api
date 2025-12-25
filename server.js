// server.js (ESM)
// npm i express cors
// node server.js

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- CORS --------------------
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://joeymakesweb.com",
  "https://www.joeymakesweb.com",
  "https://joeysoundmap.com",
  "https://www.joeysoundmap.com",

]);

app.use(cors({
  origin: (origin, cb) => {
    // allow curl/postman/health checks with no origin
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));

// -------------------- Notes by mode --------------------
// Modes exposed to visitors: workshop, sound_design
// If mode is missing or unknown, default to workshop.
const NOTES = {
  workshop: {
    mkh8040_pair: "Chosen for low self-noise and detail in quiet parks and night recording.",
    mixpre3_ii: "My main recorder for critical work. Fast gain staging, reliable for long takes.",
    geofon: "For surface resonance and small vibrations. Useful when the environment is telling its story quietly.",
    roland_cs10em: "Binaural perspective for embodied listening and quick documentation.",
    schertler_dynuni: "Used selectively in workshops to introduce vibration and material sound.",
    zoomh6: "A dependable backup and a flexible option when I need extra inputs quickly.",
    zoomh4n_x6: "Workshop workhorse. Simple enough for students, consistent across kits.",
    zoomh4npro: "A slightly cleaner handheld option when I want a familiar workflow with a bit more headroom.",
    gutmann_windscreens: "Essential in winter and shoulder seasons. Keeps handheld recordings usable outdoors.",
    rode_ws8_x4: "Quick wind protection for handheld kits. Easy to teach, easy to deploy.",
    rode_spreader: "For stable stereo spacing when I am building a fast rig in the field.",
    smallrig_handle: "Makes handheld rigs calmer and quieter in the hand, especially during long sessions."
  },

  sound_design: {
    mkh8040_pair: "Used when I want a clean, detailed stereo image that holds up to editing and layering.",
    mixpre3_ii: "My main recorder for sound design capture. Clean preamps and stable gain for long sessions.",
    geofon: "For material resonance and hidden vibration. Great for building textured layers from contact sound.",
    roland_cs10em: "Binaural capture for intimate perspective and movement. Useful for spatial ideas and detail.",
    schertler_dynuni: "Used for sound design when I want physical contact with a surface. It reveals resonance, texture, and material response.",
    zoomh6: "Good for fast sketch captures and multi-input setups when I need flexibility quickly.",
    zoomh4n_x6: "Useful for quick capture sketches and rough spatial ideas.",
    zoomh4npro: "A familiar handheld workflow when I want a little more headroom for stronger sources.",
    gutmann_windscreens: "Keeps outdoor takes usable when I am chasing texture in wind and weather.",
    rode_ws8_x4: "Quick wind protection for handheld takes when I need speed over a full rig.",
    rode_spreader: "Keeps stereo spacing consistent when building repeatable source recordings.",
    smallrig_handle: "Reduces handling noise when I am moving with a handheld rig."
  }
};

app.get("/api/gear-notes", (req, res) => {
  const mode = req.query.mode === "sound_design" ? "sound_design" : "workshop";
  res.setHeader("Cache-Control", "no-store");
  res.json(NOTES[mode] || {});
});

// -------------------- Health --------------------
app.get("/", (req, res) => {
  res.type("text").send("OK");
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
