const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Express App
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Middleware for authentication
const authMiddleware = require("./middleware/auth");
app.use(authMiddleware);

// Routes
const itemsRouter = require("./routes/items");
const movementsRouter = require("./routes/movements");

app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "API is running" });
});

// Export the Express app as a Cloud Function
exports.api = functions.https.onRequest(app);
