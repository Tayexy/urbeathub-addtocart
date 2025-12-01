const express = require("express");
const path = require("path");
const prerender = require("prerender-node");
const admin = require("firebase-admin");
const fs = require("fs");

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

/* -------------------------------------------------------------------------- */
/*               1️⃣ ENABLE PRERENDER ONLY WHEN TOKEN EXISTS                  */
/* -------------------------------------------------------------------------- */
if (process.env.PRERENDER_TOKEN) {
  prerender.set("prerenderToken", process.env.PRERENDER_TOKEN);
  prerender.set("protocol", "https"); // Important for Render
  app.use(prerender);
}

/* -------------------------------------------------------------------------- */
/*               2️⃣ SERVE STATIC BUILD (React app)                           */
/* -------------------------------------------------------------------------- */
const BUILD_DIR = path.join(__dirname, "build");
app.use(express.static(BUILD_DIR, { maxAge: "1y", index: false }));

function loadIndexHtml() {
  const indexPath = path.join(BUILD_DIR, "index.html");
  try {
    return fs.readFileSync(indexPath, "utf8");
  } catch (e) {
    console.error("Could not read build/index.html");
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*               3️⃣ DYNAMIC OG TAG INJECTION FOR SOCIAL BOTS                  */
/* -------------------------------------------------------------------------- */
app.get("/addToCart/:slug", async (req, res) => {
  const slug = req.params.slug;

  const parts = slug.split("-");
  const songId = parts[parts.length - 1];

  const baseHtml = loadIndexHtml();
  if (!baseHtml) return res.status(500).send("index missing");

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

    const injectedHtml = baseHtml.replace(
      "</head>",
      `
        <title>${title} | UrbeatHub</title>

        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:url" content="${url}" />
        <meta property="og:type" content="music.song" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${title}" />
        <meta name="twitter:description" content="${description}" />
        <meta name="twitter:image" content="${image}" />

      </head>`
    );

    res.setHeader("Cache-Control", "no-store");
    return res.send(injectedHtml);

  } catch (err) {
    console.error(err);
    res.status(500).send("OG injection error");
  }
});

/* -------------------------------------------------------------------------- */
/*                        4️⃣ SPA FALLBACK FOR REACT                           */
/* -------------------------------------------------------------------------- */
app.get(/.*/, (req, res) => {
  const html = loadIndexHtml();
  if (!html) return res.status(500).send("index missing");

  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

/* -------------------------------------------------------------------------- */
/*                        5️⃣ START SERVER                                    */
/* -------------------------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
