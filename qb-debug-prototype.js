// qb-debug-prototype.js

require("dotenv").config({ path: ".env.local" });

const express = require("express");

const app = express();
const PORT = process.env.PORT || 4001;

app.use(express.json());

function isAllowedQuickBooksUrl(urlString) {
  try {
    const url = new URL(urlString);

    const allowedHosts = [
      "quickbooks.api.intuit.com",
      "sandbox-quickbooks.api.intuit.com",
      "api.intuit.com",
    ];

    return allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

app.get("/", (_req, res) => {
  res.json({
    message: "QB Debug Prototype is running.",
    usage: "GET /api/qb/debug-get?targetUrl=https://YOUR-INTUIT-ENDPOINT",
  });
});

app.get("/api/qb/debug-get", async (req, res) => {
  try {
    const accessToken = process.env.QBO_ACCESS_TOKEN;
    const targetUrl = req.query.targetUrl;

    if (!accessToken) {
      return res.status(400).json({
        error: "Missing QBO_ACCESS_TOKEN in your .env.local file.",
      });
    }

    if (!targetUrl || typeof targetUrl !== "string") {
      return res.status(400).json({
        error: "Missing targetUrl query parameter.",
      });
    }

    if (!isAllowedQuickBooksUrl(targetUrl)) {
      return res.status(400).json({
        error:
          "targetUrl must point to an allowed Intuit/QuickBooks API hostname.",
      });
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const rawText = await response.text();

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText;
    }

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      targetUrl,
      body: parsedBody,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Debug GET failed.",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`QB Debug Prototype running at http://localhost:${PORT}`);
});