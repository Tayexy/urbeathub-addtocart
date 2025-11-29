const express = require("express");
const path = require("path");
const prerender = require("prerender-node");
const admin = require("firebase-admin");
const fs = require("fs");

// ----- Load Firebase service account key -----
let serviceAccount;
try {
  serviceAccount = JSON.parse(
    fs.readFileSync("/etc/secrets/serviceAccountKey.json", "utf8")
  );
} catch (err) {
  console.error("Failed to read service account key:", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 5000;

// ----- Prerender middleware -----
if (process.env.PRERENDER_TOKEN) {
  prerender.set("prerenderToken", process.env.PRERENDER_TOKEN);
  app.use(prerender);
}

// ----- Serve React build assets -----
const BUILD_DIR = path.join(__dirname, "build");
app.use(express.static(BUILD_DIR, { maxAge: "1y", index: false }));

// Helper to load index.html
function loadIndexHtml() {
  const indexPath = path.join(BUILD_DIR, "index.html");
  try {
    return fs.readFileSync(indexPath, "utf8");
  } catch (e) {
    console.error("Failed to read build/index.html. Did you run `npm run build`?", e);
    return null;
  }
}

// ----- Dynamic OG tags route (matches App.js: /addToCart/:slug) -----
app.get("/addToCart/:slug", async (req, res) => {
  const slug = req.params.slug;

  // Extract Firestore ID (last part after dash)
  const parts = slug.split("-");
  const songId = parts[parts.length - 1];

  console.log("Extracted Song ID:", songId);

  const baseHtml = loadIndexHtml();
  if (!baseHtml) {
    return res.status(500).send("Server HTML not available");
  }

  try {
    const songRef = db.collection("beats").doc(songId);
    const songSnap = await songRef.get();
    const song = songSnap.exists ? songSnap.data() : null;

    const title = song?.title || "Beat Not Found";
    const description = song
      ? `Buy & download ${song.title}`
      : "This beat no longer exists.";
    const image = song?.coverUrl || "https://urbeathub.com/default_og.png";
    const url = `https://urbeathub.com/addToCart/${slug}`;

    // Inject tags before </head>
    const injectedHtml = baseHtml.replace(
      "</head>",
      `
      <title>${title} | UrbeatHub</title>

      <!-- Open Graph -->
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${image}" />
      <meta property="og:url" content="${url}" />
      <meta property="og:type" content="music.song" />

      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${image}" />

      </head>`
    );

    res.setHeader("Cache-Control", "no-store");
    return res.send(injectedHtml);
  } catch (err) {
    console.error("Error fetching song:", err);
    return res.status(500).send("Internal Server Error");
  }
});

// ----- SPA fallback (regex safe for Express 5+) -----
app.get(/.*/, (req, res) => {
  const baseHtml = loadIndexHtml();
  if (!baseHtml) {
    return res.status(500).send("Server HTML not available");
  }
  res.setHeader("Cache-Control", "no-store");
  res.send(baseHtml);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
