const express = require("express");
const path = require("path");
const prerender = require("prerender-node");
const admin = require("firebase-admin");
const fs = require("fs");

// Load Firebase service account key from Render secret
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

// Prerender middleware
if (process.env.PRERENDER_TOKEN) {
  prerender.set("prerenderToken", process.env.PRERENDER_TOKEN);
  app.use(prerender);
}

// Serve React build
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath));


// ⭐⭐⭐ Dynamic OG tag handler
app.get("/addToCart/:slugId", async (req, res) => {
  const slugId = req.params.slugId;

  // Get Firestore ID (last part of slug)
  const parts = slugId.split("-");
  const songId = parts[parts.length - 1];

  try {
    const snap = await db.collection("beats").doc(songId).get();
    const song = snap.exists ? snap.data() : null;

    // Load React index.html
    let indexHTML = fs.readFileSync(path.join(buildPath, "index.html"), "utf8");

    if (!song) {
      indexHTML = indexHTML.replace("<head>", `
        <head>
          <meta property="og:title" content="Beat Not Found" />
          <meta property="og:description" content="This beat no longer exists." />
          <meta property="og:image" content="https://urbeathub.com/default_og.png" />
      `);
      return res.send(indexHTML);
    }

    // Inject OG tags into <head>
    indexHTML = indexHTML.replace("<head>", `
      <head>
        <meta property="og:title" content="${song.title}" />
        <meta property="og:description" content="Buy & download ${song.title}" />
        <meta property="og:image" content="${song.coverUrl}" />
        <meta property="og:url" content="https://urbeathub.com/addToCart/${slugId}" />
        <meta property="og:type" content="music.song" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${song.title}" />
        <meta name="twitter:description" content="Buy & download ${song.title}" />
        <meta name="twitter:image" content="${song.coverUrl}" />
    `);

    return res.send(indexHTML);

  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});


// Fallback — load React SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
