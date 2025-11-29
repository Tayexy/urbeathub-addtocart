const express = require("express");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const dotenv = require("dotenv");
dotenv.config();

const app = express();

// ----- FIREBASE ADMIN INIT -----
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ----- PRERENDER SETUP -----
app.use(require("prerender-node").set("prerenderToken", process.env.PRERENDER_TOKEN));

// Serve the React build folder
app.use(express.static(path.join(__dirname, "build")));


// ===============================
//  🔥 OG TAG ROUTE FOR SHARE LINKS
// ===============================
app.get("/addToCart/:slugId", async (req, res) => {
  const slugId = req.params.slugId;

  // extract Firestore ID: last element after splitting by "-"
  const parts = slugId.split("-");
  const songId = parts[parts.length - 1];

  try {
    const songRef = db.collection("beats").doc(songId);
    const songSnap = await songRef.get();
    const song = songSnap.exists ? songSnap.data() : null;

    // Read actual React build index.html
    const indexHtml = fs.readFileSync(
      path.join(__dirname, "build", "index.html"),
      "utf8"
    );

    // If beat not found → still load React + safe OG tags
    if (!song) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />

            <meta property="og:title" content="Beat Not Found" />
            <meta property="og:description" content="This beat may have been removed." />
            <meta property="og:image" content="https://urbeathub.com/default_og.png" />
          </head>
          <body>
            ${indexHtml}
          </body>
        </html>
      `);
    }

    // OG TAG PAGE + React App
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />

          <meta property="og:title" content="${song.title}" />
          <meta property="og:description" content="Buy & download ${song.title} on UrBeatHub" />
          <meta property="og:image" content="${song.coverUrl}" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </head>

        <body>
          ${indexHtml}
        </body>
      </html>
    `);
  } catch (err) {
    console.error("OG Route Error:", err);
    return res.status(500).send("Internal Server Error");
  }
});


// =======================================
//  🔥 FIXED FALLBACK (Express v5 compatible)
// =======================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});


// ----- START SERVER -----
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
