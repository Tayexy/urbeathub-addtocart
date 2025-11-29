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

// Serve React build folder
app.use(express.static(path.join(__dirname, "build")));


// ⭐⭐⭐ Dynamic OG tag with SLUG + ID support
app.get("/addToCart/:slugId", async (req, res) => {
  const slugId = req.params.slugId;

  // Extract Firestore ID from slug (last part after last dash)
  const parts = slugId.split("-");
  const songId = parts[parts.length - 1];

  console.log("Extracted Song ID:", songId);

  try {
    const songRef = db.collection("beats").doc(songId);
    const songSnap = await songRef.get();
    const song = songSnap.exists ? songSnap.data() : null;

    if (!song) {
      return res.send(`
        <html>
          <head>
            <meta property="og:title" content="Beat Not Found" />
            <meta property="og:description" content="This beat no longer exists." />
            <meta property="og:image" content="https://urbeathub.com/default_og.png" />
          </head>
        </html>
      `);
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${song.title} | UrbeatHub</title>

          <!-- Open Graph -->
          <meta property="og:title" content="${song.title}" />
          <meta property="og:description" content="Buy & download ${song.title}" />
          <meta property="og:image" content="${song.coverUrl}" />
          <meta property="og:url" content="https://urbeathub.com/addToCart/${slugId}" />
          <meta property="og:type" content="music.song" />

          <!-- Twitter -->
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${song.title}" />
          <meta name="twitter:description" content="Buy & download ${song.title}" />
          <meta name="twitter:image" content="${song.coverUrl}" />
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


// Fallback — send React SPA
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
