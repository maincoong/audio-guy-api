// server.js (ESM) - Public API + Admin write endpoints + file-backed persistence
//
// Install:
//   npm i express cors
//
// Run locally:
//   node server.js
//
// Deploy on Render:
//   Start command: node server.js
//   Env:
//     PUBLIC_ORIGIN=https://joeysoundmap.com
//     ALLOW_WWW=true
//     ALLOW_LOCAL=true        (set false if you want to block localhost in production)
//     ADMIN_TOKEN=your_long_token_here   (required for POST/PUT/DELETE)
//
// Endpoints:
//   GET  /                     -> "OK"
//   GET  /health               -> JSON health + allowed origins
//   GET  /api/gear-notes       -> gear notes JSON
//   GET  /api/blog             -> blog tiles list (no body)
//   GET  /api/blog/:id         -> full post (includes body)
//   POST /api/blog             -> create post (admin token)
//   PUT  /api/blog/:id         -> update post (admin token)
//   DELETE /api/blog/:id       -> delete post (admin token)
//
// Storage:
//   - Persists to ./data/blog-posts.json on disk.
//   - On first run, seeds from BLOG_POSTS_SEED if no file exists.

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// ---------- Config ----------
const PORT = Number(process.env.PORT || 3000);

// Your site origin (exact, no trailing slash)
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN || "https://joeysoundmap.com").trim();

// Allow https://www.joeysoundmap.com as well
const ALSO_ALLOW_WWW = (process.env.ALLOW_WWW || "true").toLowerCase() === "true";

// Allow localhost testing
const ALLOW_LOCAL = (process.env.ALLOW_LOCAL || "true").toLowerCase() === "true";

// Admin token for write operations
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();

// If behind proxy (Render), helps correct IP/proto
app.set("trust proxy", 1);

// Parse JSON bodies for admin endpoints
app.use(express.json({ limit: "2mb" }));

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

function isAllowedOrigin(origin) {
  // Allow curl/postman/health checks with no Origin header
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

// ---------- CORS (applies to ALL routes, including /health) ----------
app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Preflight for any route
app.options(/.*/, cors());

// Optional: clear 403 when Origin is blocked (instead of a misleading 500)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      ok: false,
      error: "CORS origin not allowed",
      origin,
      allowedOrigins: Array.from(ALLOWED_ORIGINS),
    });
  }
  next();
});

// ---------- Simple admin auth ----------
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_TOKEN is not set on the server",
    });
  }

  const auth = String(req.headers.authorization || "");
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
}

// ---------- Data (Gear Notes) ----------
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

// ---------- Blog posts seed (FULL, UNABRIDGED) ----------
const BLOG_POSTS_SEED = [
  {
    id: 1,
    title: "Sonic Interactions between Listener and Machine",
    color: "#ffbe4f",
    tileImg: "tiles/city-sonic.png",
    tileImgAlt: "Drawing for The City and Sonic",
    meta: "Excerpt from an article published in Échelle Magazine, issue: Spolia.",
    metaLinkText: "Échelle Magazine (Spolia)",
    metaLinkHref: "",
    body: `
      <p class="blogMetaNote">
        <strong>Published context:</strong> Excerpt from an article published in Échelle Magazine, issue: <em>Spolia</em>.
      </p>

      <p>
        It’s 10pm on a Wednesday night. I set up my recording gear and make my way outside. The streets are deserted and for a while only the sound of wind howling populates the soundscape. I notice a steady drone of noise to my right, emanating from cars streaming by on a highway that I can barely see from where I stand. When I turn onto another street, I hear seagulls shrieking to my left and a snow removal truck to my right. Cars pass by; I hear engine accelerations and tires on pavement. I can’t help but notice how loud an evening stroll can be, even when no one seems to be around.
      </p>

      <p>
        I realize that this is the soundscape I encounter every day when I step outside, and it hardly matters what time of day it is, or even what time of year.
      </p>

      <p>
        I spend a lot of time contemplating the sounds that have been steadily disappearing from our aural lexicon. Even though these sounds can be preserved through recordings or replicated with synthesizers, it’s a small consolation in the face of mass extinction.
      </p>

      <p>
        These sounds can range from different species of birds and insects, to the hustle and bustle sounds of open-air markets. I feel powerless in the face of the soundscapes that are imposed onto me, the infrastructures of capitalism and the web of machines that line the sonic experience of my day-to-day life. Whether I’m outside, in the metro, or in my own apartment, it is difficult to escape the sounds of machines. It is clear, however, that these machines are not going anywhere.
      </p>

      <p>
        Before I get into it, I should probably backtrack a little. A few years ago, on a whim, I decided I would record the sonic environments around me to supplement the materials I use for my sound art. These recordings would allow me to paint different worlds. I quickly realized that beyond obtaining source material, recording itself was a form of active listening that anchored me to my surroundings. These recordings were essentially the unpolished relics of my process as a sound artist and as a person navigating space in time. What resulted was a mix between strict sonic cartography and memory preservation. The soundscapes I recorded each correspond to a particular place, one that can be located on a map; any of these recordings can be accessed with one click and woven into a unique tapestry.
      </p>

      <p>
        Spurred by the genuine joy that came from field recording, I jumped into the study of acoustic ecology. This is where the reality of our sound environments hit me. I began to reflect on what I was actually hearing.
      </p>

      <p>
        The study of acoustic ecology investigates the acoustic dynamics of soundscapes and the interactions between biophonic, geophonic, and anthropogenic sounds. Biophony, geophony, and anthrophony respectively refer to the biological sounds created by organisms (vocalizations of animals, humans, and insects), the geophysical weather elements (wind, rain), or by human-caused sounds (machines).
      </p>

      <p>
        By compiling and listening to hundreds of recordings, I identified certain trends, even striking similarities, between these various soundscapes. It doesn’t matter whether I’m at Beaver Lake on top of Mount Royal, or outside metro station, or even in front of my house. These soundscapes are saturated with anthropogenic noise, which includes construction trucks, cars, public transit, and ventilation systems, to name a few.
      </p>

      <p>
        Anthropogenic sounds are constant and unrelenting. The machines that create these sounds are difficult to relate to. Navigating the world requires sensory propagation and feedback, the process of exchange between sender and receiver.
      </p>

      <p>
        But machines do not transmit interspecies information. They do not engage in improvisation. The ones we most often hear are restricted to limited frequency ranges. These highly repetitive, uniform, and automatic sounds have a tendency to mask the sounds of birds and human voices. I found myself waiting for the moments in which the sound of bird calls would pierce through during a brief period of quietness, where no engines happened to be running. Even while attempting to pay attention to the details of the soundscapes as objectively as possible, I found it difficult to shrug off my desire to hear sounds occupying their native spaces.
      </p>

      <p>
        As much as I tried to reappropriate the sounds around me, I found that I could not easily shift my perception of the soundscapes without noise-reducing earplugs, or just listening to something entirely digitally different.
      </p>

      <p>
        There is a lot of information about how machines profoundly disrupt natural ecosystems. There is even information about how noise negatively impacts human life. Prolonged exposure to low frequencies commonly produced by machines can dull our nerve endings and diminish our capacity to perceive visual depth, and lead to hearing loss. Furthermore, noise has a disorganizing effect on the nervous system and can lead to fatigue and loss of concentration, similar to the effects of alcohol. These effects have been proven to have a negative impact on neurogenesis and memory building. It follows that machines and noise not only take up much of the acoustic space, but can also directly inhibit our brain’s ability to create new connections and relate to the spaces we navigate on a daily basis.
      </p>

      <p>
        In a talk I attended, Hildegard Westerkamp asked the multi-faceted question: “Do we change the sounds that are disruptive or accept them?” I found field recording to be one of the ways I could engage with my surroundings and appropriate city sounds. The more I delve into acoustic ecology, the more difficult it is to accept noise as the default, and the more I long for diversity in my soundscapes.
      </p>

      <p>
        Field recordings have memories engraved in them, regardless of anthropogenic saturation. I can’t ignore how the creation and regeneration of memories is inhibited by noise. Not only because it impairs neurogenesis, but also because it presents a stark lack of stimulation. Appropriating noise in the city requires some level of acceptance. Accepting these sounds is easier than imagining how to change them. But as much as I’ve tried, it is difficult to engage with the machines sounding around me, and I’m beginning to resent them.
      </p>
    `,
  },

  {
    id: 2,
    title: "Listening to Victory Square",
    color: "#2a6f76",
    tileImg: "tiles/victory-square.png",
    tileImgAlt: "Drawing for Listening to Victory Square",
    meta:
      "Proceedings of the Conference of the World Forum for Acoustic Ecology, Atlantic Centre for the Arts (FL), March 23–26, 2023. Open-access (CC BY 3.0).",
    metaLinkText: "",
    metaLinkHref: "",
    body: `
      <p class="blogMetaNote">
        <strong>Published context:</strong> Proceedings of the Conference of the World Forum for Acoustic Ecology, Atlantic Centre for the Arts (FL), March 23–26, 2023. Copyright © 2023 Joey Zaurrini. Open-access under Creative Commons Attribution License 3.0 Unported.
      </p>

      <h4>1. INTRODUCTION</h4>
      <p>
        In this paper, I will share my experiences in listening to Victory Square, a city square I lived in front of for three years. During this span of time, I recorded the square’s soundscape from my bedroom window, maintained a field recording journal, created art works in response to listening, and grappled with the reality of engaging with a vulnerable location, which was home for many, while I lived 6 stories above it. When I began this listening endeavour, I was worried about how my field recording practice could ethically co-exist with Victory Square. By maintaining a field recording journal, I was able to deepen my connection to the square, and with time, my practice began evolving in conversation with the square. I will take the reader through my creation phases and how I came to certain methodologies. In addition to sharing my work with you, it is my hope to position self-reflexive field recording as a tool that can help us think about and work with vulnerable locations that are often excluded from conversations.
      </p>

      <h4>2. FREQUENCY NICHE</h4>
      <p>
        The field of acoustic ecology became known to me while I was studying at University of Montreal. I happened upon a scientific article that referenced Bernie Krause’s categorization of sounds into biophonic, anthrophonic, and geophonic ones. I was fascinated by this and continued to search for more. Eventually, I realized there was an entire field devoted to the study of sound. Though my own journey in listening began prior to this encounter, knowing that there were other people as fascinated as I was with sound, was like opening the door to a very secret and yet beautiful place. Remarkably, what I’ve come to realize, that the interest is not just in sound itself, but in how sound can be used a means of investigating the world that we live in, and to deepen our relationship to place.
      </p>

      <p>
        My particular interest has been the social realm, and to this end Krause’s frequency niche hypothesis was inspiring. The hypothesis posits that we are in a healthy environment, the soundscape’s spectrum reflects this, and the organisms in that environment have a clear channel of communication [1]. We can apply this principle to our social environments, particularly in thinking about which voices are heard and which are suppressed, and squares are an example of places that we can investigate that are made up of many voices, including the most marginalized.
      </p>

      <h4>3. ENCOUNTER</h4>
      <p>
        The history of the square is intertwined with my encounter with it. Public city squares are constructed to, among other reasons, provide places of relief within the city, perhaps a place to think and connect. And what I proceeded to do for the next three years was nothing short of thinking, imbued with the refuge that Victory Square offered me.
      </p>

      <p>
        The land upon which Victory Square sits, located in Vancouver, British Columbia, was not always destined to be a city square [2], but when I encountered it, it was as such, and I, a student, venturing into my graduate studies at Simon Fraser University in the Contemporary Arts building, in the vicinity of what used to be known as Woodwards. Over 80 years prior to this encounter, the square would be the site of mass protests against job-loss and lack of housing and then mayor Richard McGeer would read the riot act to a crowd of thousands. This peak moment in its history was preceded by years of colonialism, a fight for resources, racism, and a growing disparity between the rich and the poor [3]. In the present day, its history reverberates within the square, very much alive, and my encounter and first impressions of it were greatly influenced by its history, infrastructure and more.
      </p>

      <p>
        My own history, and who I am also influenced my perception of the square. I am a white, Canadian-Italian male-presenting artist from Montreal. I arrived in Vancouver after spending all of my life in a French-speaking province, having grown up in a suburb where city squares did not exist; I had a private practice which involved recording sounds and writing about them, and a professional practice which involved creating sound worlds for theater, dance and performance art. When I began conducting field recordings in 2014, they were at first in order to be able to compose with. I realized that I quite liked reflecting over sound. In listening and reflecting, I could hear myself and begin to form deeper relationships with my environments. When I encountered Victory Square, I gradually became determined to work with it because my practice of field recording made it impossible not to. Living in front of it, Victory Square collided into my world, most evidenced by its soundscape continuously pouring into my apartment. Thus, my work in thinking about it began with an attunement to its aural presence.
      </p>

      <p>
        Copyright: © 2023 Joey Zaurrini. This is an open-access article distributed under the terms of the Creative Commons Attribution License 3.0 Unported, which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are credited.
      </p>

      <h4>4. IMPRESSION</h4>
      <p>
        The first thing I noticed when I rolled my suitcase down Hastings and arrived at the Charles Chang building, where I would be living, was the amount of people I identified as experiencing homelessness within the square. I felt overwhelmed with the sounds: screeching sirens, lively laughter and loud music. Later on, I would come to classify this first impression as a sign of Victory Square’s vulnerability, and by proxy its humanity.
      </p>

      <p>
        Some tangible site-specific research revealed that Victory Square is a “fragmented territory inserted between larger zones of the central city” [4]; that in 2020; 3,634 individuals were identified as experiencing homelessness in Metro Vancouver; and there is a clear negative opinion about the square that can be gleaned from a simple Google search, or Trip advisor search, in addition to speaking with people who live near the area. Notably, one of the only research projects done about the square was in the form of an MA thesis which characterized the homeless as “outcasts of wider affluent society” [5]. The consensus seemed to be that the square would be a beautiful memorial location if it was not inhabited by so many people experiencing homelessness.
      </p>

      <h4>5. A MAN DRUMS A STICK</h4>
      <p>
        Rather than remain anchored to my initial impression, which was that Victory Square was loud, I drew upon something I had heard Hildegard Westerkamp share in a lecture, where she both lamented the loss of natural sounds in the environment, but also suggested that for herself, acceptance may be necessary to move forward [6]. When I accepted that my new home was loud, I could then spend time listening to it, become inspired by the textures, and realize how many of Schafer’s sound events were woven within it [7]: ambulance sirens, traffic, lone instrumentalists, protests, vocalizations including laughing, crying, speaking and shouting.
      </p>

      <p>
        If we think about McMurray’s concept of the body as a macrocosm and the vocal tract as its microcosm [8], then Victory Square, a microcosm of the city, could be said to represent Vancouver’s vocal tract, made up of voices seeking to be heard within its confines and extending outwards into buildings like mine.
      </p>

      <p>
        I began recording the soundscape of Victory Square as heard from my bedroom window for a project as part of a multi-modal autoethnography course led by Darah Culhane and Peter Dickinson. We were asked to create a journal, exploring other ways of knowing that we would come across in our readings and shared discussions. Emphasis was placed on viewing “the body as an agent of experience and knowledge [that we can include] as part of the process of ethnographic inquiry” [9]. Having already maintained an online field recording journal previously, I used this opportunity to focus on a specific location. I proceeded to conduct 18 field recordings over the duration of the course, lasting four months. Each time I would sit and listen, I would try to focus on describing the sounds I was hearing. Sometimes I would be inspired to describe these in detail; sometimes I would take this time to reflect on my day or on my interactions in the square; sometimes memories would surface. I approached each field recording with fresh ears, with no agenda other than listening and observing what came up.
      </p>

      <p>
        In hindsight, this was an important step in building a connection to the location in which I was living. By weaving my observations, thoughts and memories into my journal while engaging with the square’s soundscape, I was creating a sense of place and a sense of home. My affinity for it is partly because this was my home for a significant part of my life, just like the people within the square itself. The only substantial difference of course was that my home-making was invisible mostly, hidden behind curtains, and deemed unobstructive to “wider affluent society”.
      </p>

      <p>
        <em>Figure 1. A painting from my field recording journal of Victory Square, entitled “A Man Drums a Stick”</em>
      </p>

      <p>
        “A man drums a stick against the edge of a hard plastic sheet. He is standing at the edge of the cement circle and he is illuminated under a row of helmet lamps. It is midnight. The sound reverberates against the looming infrastructure and seeps into dimly lit apartments. Laughter from another story beyond the edge bubbles over and disappears. Devoid of low vegetation, flat, open: Victory Square is like a cymbal waiting to be activated. I run to grab my recorder, tripping over wires strewn in my apartment. I perch it on the edge of the open window.”
      </p>

      <p>
        Above is an example of one of my journal entries. In this journal entry, I place myself within the context of recording, and demonstrate what it looked like to be in my apartment, the square being used like a cymbal referring to the multiplicity of stories taking place at once within the space including my own.
      </p>

      <h4>6. THE BEYOND</h4>
      <p>
        I was resistant to the idea of creating work within a gallery, deeply considering notions of artistic practices that take place in what Rustom Bharucha called “the beyond” [10] outside the white box galleries, into public places like streets and city squares, namely ones experiencing protracted conflict and strife; yet I was also deeply influenced by my research in how sound art in the public could be greatly harmful in these locations. I decided that I would attempt to create within the boundaries of a gallery, reconciling this conundrum of conflicting research and choosing to create in spite of not having a perfect answer.
      </p>

      <p>
        Inspired by my experiences listening to Victory Square, I created <em>Conversations With You</em>, a 4-channel composition seeking to immerse the listener in my apartment world, juxtaposing the interior with the exterior, revealing the musicality of the square, the micro details and the macro movements. I presented life unfolding, sounding in all its varied tendrils and stories. I used one of Bharucha’s principles for working in vulnerable locations to inform my composition, which is rather than hide the strife, to work with it. Omitting any recordings that revealed voices, I built the soundscape with pieces of the strife I heard from my bedroom window: in the installation, the broken glass travels from speaker to speaker, as do the sirens, church bells and radio music.
      </p>

      <h4>7. LABYRINTHS</h4>
      <p>
        In thinking about the square itself with its many paths and nooks of activity and explosions of sound, I’m reminded of Westerkamp’s octophonic composition <em>Into the Labyrinth</em>. Westerkamp ventured into different locations in India to record the sounds she composed with, while I recorded mostly from one position in my apartment. However, in both mine and Westerkamp’s case, we both underwent a long-term listening endeavour in environments that were new to us and used the recorder to connect on a deeper level with these places.
      </p>

      <p>
        Both <em>Into the Labyrinth</em> and <em>Conversations With You</em> draw from listening experiences and use narrative-focused composition techniques where sound events blend into each other, swirling and combining various events and people that we recorded in fragmented yet inter-connected strands. Here, the ephemeral nature of time becomes evident, even in the transformation from day to night, and the musicality of the street and square are emphasized through pitch-matching and juxtaposing.
      </p>

      <p>
        Through these techniques and because of the amount of time spent in these locations, we can hear the composer listening, coming to experience place, and processing experiences within the compositions themselves. Referencing her soundscape compositions, Hildegard writes about the interplay between the fine details and the soundscape as a whole: the micro and the macro. In working with Victory Square, my journaling informed my composition process, by helping me choose which of these sources I wanted to bring to the foreground, and what embellishments might work to tie the experience together in one unfolding, narrative-driven composition that honoured my experience in listening to Victory Square.
      </p>

      <h4>8. SOUNDMAPPING</h4>
      <p>
        Some of my work took place within the early COVID days, where I decided to go back to Montreal, and continue this project from afar. In this space, I began to create maps, in a way helping me remember what I had experienced. In my bedroom office across the country, I drew an eclectic onomatopoeia map of Victory Square, with every instance I could remember populating it.
      </p>

      <p>
        Rather than focus on perfect proportions, I used simple drawings, inspired by Lynda Barry’s aesthetics in allowing the drawing to become whatever it is. I also began to place myself within this map: drawing me at my kitchen, me working, sitting, having a breakdown, me looking outside, showering, falling in love, going through a grad school puberty. The act of drawing allowed me to reveal the listening experience, and to engage more of my inner-world in symbiosis with the ecosystem of Victory Square.
      </p>

      <h4>9. A VISUAL JOURNAL OF VICTORY SQUARE</h4>
      <p>
        I returned to Vancouver in October 2020, back to my studio apartment overlooking the square. Before leaving, I remembered the grassy wide area being sort of fenced off, with official signs claiming that a tulip field would be built. When I returned, it was just grass: no fence, no tulips. It sounded similar, but there was less fullness to it. I felt a sense of dislocation, having been gone for seven months.
      </p>

      <h4>10. TALES FROM THE SQUARE</h4>
      <p>
        The last work I completed about Victory Square was an online, interactive soundmap, using my field recordings, observations, drawings, and other artwork. By this time, I was back in Montreal again, my graduate housing having come to an end. I remember throwing a large canvas on the ground in my new apartment, and beginning to paint a reimagined map with simple shapes and bright colours.
      </p>

      <h4>11. CONCLUSION</h4>
      <p>
        The experience of listening to Victory Square’s soundscape gave me the opportunity to think more critically about my own positionality in recording for the first time, and I was able to create artworks that revealed both the complex beauty of the square, its strife, and my own inner world in response to its soundscape.
      </p>

      <h4>12. REFERENCES</h4>
      <p>
        [1] B. Pijanowski, L. Villanueva-Rivera, S. Dumyahn, A. Farina, B. Krause, B. Napoletano, S. Gage, and N. Pieretti, "Soundscape Ecology: The Science of Sound in the Landscape," <em>BioScience</em>, vol. 61, no. 3, 2013.<br><br>
        [2] J. Atkin, <em>Changing City</em>. Vancouver, BC: Linkman Press, 1998.<br><br>
        [3] D. Francis, <em>Becoming Vancouver: A History</em>. Madeira Park, BC, Canada: Harbour Publishing, 2021.<br><br>
        [4] T. Barnes and T. Hutton, “Situating the new economy: Contingencies of regeneration and dislocation in Vancouver’s Inner City,” <em>Urban Studies</em>, vol. 46, no. 5–6, pp. 1247–1269, 2009.<br><br>
        [5] W. R. Hall, “Spatial behaviour in Victory Square: the social geography of an inner-city park,” University of British Columbia, 1974.<br><br>
        [6] H. Westerkamp, “Lecture/demonstration by Hildegard Westerkamp”, presented at Festival Akousma 14 at Concordia University, Montreal, QC, Canada, Oct. 27, 2017.<br><br>
        [7] R. M. Schafer, <em>The Soundscape: Our Sonic Environment and the Tuning of the World</em>. Rochester, VT: Destiny Books, 1977.<br><br>
        [8] P. McMurray, "Ephemeral cartography: on mapping sound," <em>Sound Studies</em>, vol. 4, no. 2, pp. 110-142, 2018.<br><br>
        [9] K. E. Y. Low, “The sensuous city: Sensory methodologies in Urban Ethnographic Research,” <em>Ethnography</em>, vol. 16, no. 3, pp. 295–...<br><br>
        [10] R. Bharucha, “The limits of the beyond,” <em>Third Text</em>, vol. 21, no. 4, pp. 397–416, 2007.<br><br>
        [11] S. Loveless, "Tactical Soundwalking in the City: A Feminist Turn from Eye to Ear," <em>Leonardo Music Journal</em>, vol. 30, pp. 99-103, 2020.<br><br>
        [12] L. O’Keeffe, "The Sound Wars: Silencing the Working Class Soundscape of Smithfield," <em>Politiques de communication</em>, no. HS1, pp. 147-178, 2017.
      </p>
    `,
  },

  {
    id: 3,
    title: "Accessibility Thoughts",
    color: "#949f5a",
    tileImg: "tiles/accessibility.png",
    tileImgAlt: "Drawing for Accessibility Thoughts",
    meta: "Selected entries from my Accessibility Study journal (with drawings).",
    metaLinkText: "",
    metaLinkHref: "",
    body: `
      <p class="blogMetaNote">
        <strong>Published context:</strong> Selected entries from my Accessibility Study journal.
      </p>

      <div class="atEntry">
        <img src="drawings/senses.png" alt="Representation of senses" class="atImg" loading="lazy" decoding="async">
        <h4>What is Accessibility?</h4>
        <p>
          In order to create an accessible map, I had to first learn what accessibility truly meant. I tackled this from the perspective of wanting to find a way to represent sound in a way that wasn’t only for those who could physically hear, but also those who might rely on other senses to understand the world. I was inspired by talking to family who used hearing aids, by being part of sound walks where someone with mobility issues could not participate comfortably, and a documentary on Pauline Oliveros I watched at Cinema Moderna, where a deaf audience member was asked to conduct an orchestra at a public performance.
          This moment stood out because she, Pauline, simply asked, why shouldn’t a deaf person lead an orchestra? Conductors use visual representations, gestures, to get the orchestra going. This is translated by people playing instruments into music. Accessibility starts at the human level. To begin with, I took a lot of time to read over accessibility rules in the web, to understand what they were. Alongside this, I sought accessible content <b>about accessibility</b> like IBM's guide on WCAG standards. Committed to making my own learning environment accessible, I made my laptop fonts and icons larger, reorganized apartment to be easier to navigate visually, and stripped things to the bare minimum to be able to focus better. The more I did these small things to make my workspace comfortable, the happier I felt while working on this project.
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/desk.png" alt="A desk setup" class="atImg atImg--small" loading="lazy" decoding="async">
        <h4>Assistive Technology</h4>
        <p>
          One of the most powerful things I read about accessibility was that those who use assistive technology are statistically more efficient at navigating the web than those who don’t. It struck me that assistive technology and the study of accessibility were very important advancements that benefit not only those with disabilities, but also the elderly, allowing diverse users to access web content. Especially in a world where so much of our lives depend on apps, websites, and online systems, without assistive technology, this would exclude over 20% of people who have some form of disability in Canada alone.
          <em>Inclusivity</em> builds on accessibility. It is a term that means something is not only accessible, but also provides multiple ways of engaging with the same material. So if data is presented, it is not only something that can be read, but perhaps something that can be played around with, making it accessible beyond meeting web standards. I also learned, however, that meeting these standards is very important to begin with.
        </p>
        <p>
          As I continued my research, I decided to implement what I was learning in my first explicitly accessible soundmap. Funny that this first map should be a noise map because it is my position that noise renders environments inaccessible: we can't hear ourselves in noisy environments, we can't hear each other, and we can't hear the wildlife that we share this planet with. An accessible noise map, I worked on this project as one layer of Dorcherster Square's soundscape, where I hope it will help demonstrate a facet of my research. The sounds we tend not to notice in the background of our experience, like air vents and other “city sounds”. I remember seeing the top of buildings from my apartment, including 3 fans atop one. I never realized what a ventilating system looked like from a top view down. The machines that make noise started to pop out more as I worked on this project. The visual saliency of noise...
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/mouse.png" alt="A mouse as a sound representation" class="atImg atImg--tiny" loading="lazy" decoding="async">
        <h4>Making Noise Accessible</h4>
        <p>
          When I qualified noise as sound, in that I would be working with sound on the web, I sought to find some information about what other soundmaps look like, how they function. Frustratingly enough, I could only come across generic cookie-cutter Google Map soundmaps. Most of what I found were large-scale soundmaps that invited users to add their field recordings to a Google Maps based interface. To me, this lacks a certain creativity.
        </p>
        <p>
          I was studying things that didn’t necessarily spark my interest. But I thought to myself, let’s see what I can learn about accessibility anyways, even if these aren’t the maps I’d ever like to make. What I learned was that even though Google Maps has many accessibility features, the soundmaps that leverage this technology didn’t actually implement the features available. Basic issues like not being able to tab through drop pins or navigate fully with the keyboard made me realize the challenges.
        </p>
        <p>
          This dive feels like it was purely about the basics. Laying some foundation, a set of rules I carved out from these studies. But reading about this was important because it made the reality of creating without accessibility in mind more real to me, seeing these numbers, how many people are disabled in the world, and what the effects are to simply not even try to include different ways of experiencing one’s work to a public that could navigate the web better than most users given the right provisions.
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/bike.png" alt="A bicycle with winter tires" class="atImg" loading="lazy" decoding="async">
        <h4>Walking Versus Biking</h4>
        <p>
          I’ve never really biked much downtown, always heeding warning tales of the dangers of too many cars and traffic. I found that contrary to these warnings, biking downtown was pretty good. The bike lane on Maisonneuve O. was easy to hop onto. By biking to the square, I was able to access it faster and easier. Wheels in motion, I wizzed over to my destination and could easily begin recording.
        </p>
        <p>
          Walking, on the contrary, was an arduous experience. Trekking to the square on foot, bundled up in layers, I always began it in a bit of discomfort. Too much stuff, carrying it for too long. But once I got there, there was this satisfaction, that I had indeed made it and could now begin the work. In fact, because it was more difficult to get to, I was more adamant about making sure my time was well spent in the square. I made sure I could capture at least one noise source, and I strangely looked forward to walking both during the day and at night in spite of the exhaustion of constantly getting Winter clothes on. Walking versus biking came up as methods of transport that I availed myself to.
        </p>
        <p>
          Something funny that happened to me on bike, however, is that once, when I was just learning directions, instead of finding my way to Dorchester Square, I ended up in Phillips Square, following the sounds of bells. So on bike, on this wheeled affordance so to speak, we can end up in places much quicker, following sources faster.
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/winter.png" alt="A winter coat" class="atImg" loading="lazy" decoding="async">
        <h4>The Winter Clothes</h4>
        <p>
          Simple, but necessary, to make this project come to life, I needed to brave the Montreal winter to capture sound. I started with getting “combines”, a set of underclothing that was snug and comfortably warm. Then, I got long, thick socks, a waterproof baklava, and under gloves and outer gloves. Finally, I changed my tires on my bike and replaced them with winter tires. This in itself was mind-blowing because I had never had winter clothes like this before, at least not since childhood. Winter was something to bear, not something to enjoy. In essence, I mitigated an accessibility barrier, the cold, so I could experience the winter ahead.
        </p>
        <p>
          The ability to modify our surroundings, and if we can’t modify those, to modify our tools to be accessible for us, is crucial. On that note, if accessibility is about access, then isn't sharing directions to get somewhere also about accessibility? Take it further: by lending an ear, giving directions, or even a hug, we become each other’s access points, making the world more accessible. Thanks winter clothes and Sports Expert clerk.
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/rocks.png" alt="Rocks" class="atImg atImg--wide" loading="lazy" decoding="async">
        <h4>Noise Sources</h4>
        <p>
          The sources were captured through listening and in-the-moment decisions. I had a sense of what sounds might be present, like buses and the constant hum of the Avis air vent. These were the first noise sources I identified.
          One of the most surprising sounds came from a geotechnical drilling rig. It was the only one I couldn’t immediately recognize. After returning at least twice to investigate this machine, one time where the operators noticed me and said hello, I learned that this rig performs subsurface testing, retrieving soil and rock samples for engineers to assess ground conditions before construction.
          I also learned that geotechnical drilling is referred to as <em>boring</em>, and the findings are recorded in a "bore" log. The drill’s components vibrate and break into the earth to retrieve samples. This reminded me of a video I watched about emergency wound care. To stop someone from bleeding out, you have to insert your finger into the wound and open it before packing it with fabric. It made me think of what the drill rig does to the ground.
        </p>
        <p>
          Interesting how noise from machines like this is rarely questioned in public space. It is accepted as part of the background. But if someone were playing guitar in Dorchester Square, it might be seen as a disruption and be fineable according to Ville-Marie noise by-Laws.
        </p>
      </div>

      <div class="atEntry">
        <img src="drawings/path.png" alt="Paths in a square" class="atImg atImg--wide" loading="lazy" decoding="async">
        <h4>Paths in the Square</h4>
        <p>
          To find noise sources I looked for a spot where I could just stand, and then followed my ears. I started in the centre of the square, where the Boer War monument is. In this centre, it diverged into 3 paths on either side, all made of cobblestone, through the grassy area, now covered with snow, populated with some trees. I got to know this place in tiers, first some areas becoming illuminated, then others following suit.
        </p>
        <p>
          On my way to the noise sources, I started with the monuments, stepping around to them, and by the last time I visited the square, it was more obvious how the layout was configured. There are a few different kinds of square types, dominated, where the square is oriented towards one particular element, or closed, where there is a wall or gate around the entire square. Dorchester Square has a grouped layout, as it has multiple focal points.
        </p>
        <p>
          It will take time to paint a portrait of the spaces. The paths I take could likely diverge in the Summer, when I can see more people around. With it bare, it’s like I got a glimpse of the structure’s skeleton. I also made my own derelict paths, walking from one noise source to the next. Any and every path, and making recordings of walking from one point to the next could be fun to do. These criss-crossing recordings could be placed on a map to show the intersections of sound. Would be amazing to do with people holding recorders. And create some walking score!
        </p>
      </div>
    `,
  },
];

// ---------- File-backed persistence ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const BLOG_FILE = path.join(DATA_DIR, "blog-posts.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function loadBlogPostsFromDisk() {
  ensureDataDir();

  if (!fs.existsSync(BLOG_FILE)) {
    // first run: seed
    fs.writeFileSync(BLOG_FILE, JSON.stringify(BLOG_POSTS_SEED, null, 2), "utf8");
    return BLOG_POSTS_SEED.slice();
  }

  const raw = fs.readFileSync(BLOG_FILE, "utf8");
  const parsed = safeJsonParse(raw, null);

  if (!Array.isArray(parsed)) {
    // corrupted file: reset to seed
    fs.writeFileSync(BLOG_FILE, JSON.stringify(BLOG_POSTS_SEED, null, 2), "utf8");
    return BLOG_POSTS_SEED.slice();
  }

  return parsed;
}

function saveBlogPostsToDisk(posts) {
  ensureDataDir();
  fs.writeFileSync(BLOG_FILE, JSON.stringify(posts, null, 2), "utf8");
}

// In-memory posts loaded from disk
let BLOG_POSTS = loadBlogPostsFromDisk();

function rebuildIndex() {
  BLOG_BY_ID = new Map(BLOG_POSTS.map((p) => [String(p.id), p]));
}

// We use let so we can rebuild
let BLOG_BY_ID = new Map(BLOG_POSTS.map((p) => [String(p.id), p]));

// Helpers
function normalizePostInput(input, existingId = null) {
  const out = {};

  // id
  if (existingId != null) {
    out.id = Number(existingId);
  } else if (input?.id != null && String(input.id).trim() !== "") {
    out.id = Number(input.id);
  }

  out.title = String(input?.title || "").trim();
  out.color = String(input?.color || "").trim();
  out.tileImg = String(input?.tileImg || "").trim();
  out.tileImgAlt = String(input?.tileImgAlt || "").trim();
  out.meta = String(input?.meta || "").trim();
  out.metaLinkText = String(input?.metaLinkText || "").trim();
  out.metaLinkHref = String(input?.metaLinkHref || "").trim();
  out.body = String(input?.body || "");

  return out;
}

function validatePost(post) {
  if (!Number.isFinite(post.id) || post.id <= 0) return "Post id must be a positive number";
  if (!post.title) return "title is required";
  if (!post.color) return "color is required";
  if (typeof post.body !== "string") return "body must be a string";
  return null;
}

function nextId(posts) {
  const max = posts.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  return max + 1;
}

// ---------- Routes ----------
app.get("/", (_req, res) => {
  res.type("text").send("OK");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "joeysoundmap-api",
    time: new Date().toISOString(),
    publicOrigin: PUBLIC_ORIGIN,
    allowLocal: ALLOW_LOCAL,
    allowWww: ALSO_ALLOW_WWW,
    allowedOrigins: Array.from(ALLOWED_ORIGINS),
    blogPosts: BLOG_POSTS.length,
    hasAdminToken: Boolean(ADMIN_TOKEN),
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

// Blog list (tiles only, keeps payload small)
app.get("/api/blog", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const tiles = BLOG_POSTS
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      color: p.color,
      tileImg: p.tileImg || "",
      tileImgAlt: p.tileImgAlt || "",
      meta: p.meta || "",
      metaLinkText: p.metaLinkText || "",
      metaLinkHref: p.metaLinkHref || "",
    }));
  res.json(tiles);
});

// Full post
app.get("/api/blog/:id", (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: "Invalid id" });
  }

  const post = BLOG_BY_ID.get(id);
  if (!post) return res.status(404).json({ ok: false, error: "Post not found" });

  res.json(post);
});

// Create post (admin)
app.post("/api/blog", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const incoming = normalizePostInput(req.body);
  if (!incoming.id || !Number.isFinite(incoming.id)) {
    incoming.id = nextId(BLOG_POSTS);
  }

  const err = validatePost(incoming);
  if (err) return res.status(400).json({ ok: false, error: err });

  const idStr = String(incoming.id);
  if (BLOG_BY_ID.has(idStr)) {
    return res.status(409).json({ ok: false, error: "Post with this id already exists" });
  }

  BLOG_POSTS.push(incoming);
  BLOG_POSTS.sort((a, b) => Number(a.id) - Number(b.id));

  saveBlogPostsToDisk(BLOG_POSTS);
  rebuildIndex();

  res.status(201).json({ ok: true, post: incoming });
});

// Update post (admin)
app.put("/api/blog/:id", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: "Invalid id" });
  }

  const existing = BLOG_BY_ID.get(id);
  if (!existing) return res.status(404).json({ ok: false, error: "Post not found" });

  const updated = normalizePostInput(req.body, id);

  // allow partial update by falling back to existing values
  const merged = {
    ...existing,
    ...updated,
    id: Number(id),
  };

  const err = validatePost(merged);
  if (err) return res.status(400).json({ ok: false, error: err });

  BLOG_POSTS = BLOG_POSTS.map((p) => (String(p.id) === id ? merged : p));
  BLOG_POSTS.sort((a, b) => Number(a.id) - Number(b.id));

  saveBlogPostsToDisk(BLOG_POSTS);
  rebuildIndex();

  res.json({ ok: true, post: merged });
});

// Delete post (admin)
app.delete("/api/blog/:id", requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ ok: false, error: "Invalid id" });
  }

  const existing = BLOG_BY_ID.get(id);
  if (!existing) return res.status(404).json({ ok: false, error: "Post not found" });

  BLOG_POSTS = BLOG_POSTS.filter((p) => String(p.id) !== id);

  saveBlogPostsToDisk(BLOG_POSTS);
  rebuildIndex();

  res.json({ ok: true, deletedId: Number(id) });
});

// ---------- Error handling ----------
app.use((err, _req, res, _next) => {
  console.error("[SERVER ERROR]", err);
  const msg = String(err?.message || "Server error");
  res.status(500).json({ ok: false, error: msg });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  console.log(`PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`);
  console.log(`ALLOW_WWW=${ALSO_ALLOW_WWW}`);
  console.log(`ALLOW_LOCAL=${ALLOW_LOCAL}`);
  console.log(`Allowed origins:\n- ${Array.from(ALLOWED_ORIGINS).join("\n- ")}`);
  console.log(`BLOG_POSTS=${BLOG_POSTS.length}`);
  console.log(`ADMIN_TOKEN_SET=${Boolean(ADMIN_TOKEN)}`);
  console.log(`BLOG_FILE=${BLOG_FILE}`);
});
