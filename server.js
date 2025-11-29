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

// Prerender middleware for SEO / social bots
if (process.env.PRERENDER_TOKEN) {
  prerender.set("prerenderToken", process.env.PRERENDER_TOKEN);
  app.use(prerender);
}

// Serve React static build
app.use(express.static(path.join(__dirname, "build")));

// Dynamic OG Route for beats
app.get("/addToCart/:slugId", async (req, res) => {
  const slugId = req.params.slugId;

  // Extract Firestore ID from slug
  const parts = slugId.split("-");
  const songId = parts[parts.length - 1];

  try {
    const songRef = db.collection("beats").doc(songId);
    const songSnap = await songRef.get();
    const song = songSnap.exists ? songSnap.data() : null;

    // Default OG if beat not found
    const ogTitle = song ? song.title : "Beat Not Found";
    const ogDescription = song
      ? `Buy & download ${song.title}`
      : "This beat no longer exists.";
    const ogImage = song
      ? song.coverUrl
      : "https://urbeathub.com/default_og.png";
    const ogUrl = `https://urbeathub.com/addToCart/${slugId}`;

    // Send dynamic OG HTML but include React root
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${ogTitle} | UrbeatHub</title>

          <!-- Open Graph -->
          <meta property="og:title" content="${ogTitle}" />
          <meta property="og:description" content="${ogDescription}" />
          <meta property="og:image" content="${ogImage}" />
          <meta property="og:url" content="${ogUrl}" />
          <meta property="og:type" content="music.song" />

          <!-- Twitter -->
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${ogTitle}" />
          <meta name="twitter:description" content="${ogDescription}" />
          <meta name="twitter:image" content="${ogImage}" />
        </head>
        <body>
          <div id="root"></div>
          <script src="/static/js/bundle.js"></script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Error fetching song:", err);
    return res.status(500).send("Internal Server Error");
  }
});

// SPA fallback: all other routes serve React index.html
app.get(/^(?!\/addToCart\/).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
