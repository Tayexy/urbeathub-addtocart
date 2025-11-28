const express = require("express");
const path = require("path");
const prerender = require("prerender-node");
const admin = require("firebase-admin");

// Load Firebase service account JSON from Render secret file
// SERVICE_ACCOUNT_KEY contains the full JSON string
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 5000;

// Prerender token from Render environment variables
prerender.set("prerenderToken", process.env.PRERENDER_TOKEN);
app.use(prerender);

// Serve React build folder
app.use(express.static(path.join(__dirname, "build")));

// ⭐ Dynamic OG Page for Add To Cart
app.get("/addToCart/:songId", async (req, res) => {
  const songId = req.params.songId;

  try {
    const songRef = db.collection("beats").doc(songId);
    const songSnap = await songRef.get();
    const song = songSnap.exists ? songSnap.data() : null;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${song?.title || "Add to Cart"} | UrbeatHub</title>

          <!-- Open Graph Meta -->
          <meta property="og:title" content="${song?.title || "Add to Cart"}" />
          <meta property="og:description" content="Buy & download ${song?.title || "this beat"}" />
          <meta property="og:image" content="${song?.coverUrl || "https://urbeathub.com/default_og.png"}" />
          <meta property="og:url" content="https://urbeathub.com/addToCart/${songId}" />
          <meta property="og:type" content="music.song" />

          <!-- Twitter Cards -->
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="${song?.title || "Add to Cart"}" />
          <meta name="twitter:description" content="Buy & download ${song?.title || "this beat"}" />
          <meta name="twitter:image" content="${song?.coverUrl || "https://urbeathub.com/default_og.png"}" />
        </head>
        <body>
          <div id="root"></div>
          <script src="/static/js/bundle.js"></script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("🔥 Error loading beat:", err);
    res.status(500).send("Internal Server Error");
  }
});

// React app fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
