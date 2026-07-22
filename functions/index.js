const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Express App
const app = express();
const allowedOrigins = [
  'https://inventor-manager-a0b4d.web.app',
  'https://inventor-manager-a0b4d.firebaseapp.com',
  'http://localhost:5173'
];

// Security middlewares
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Rate Limiting: 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde." }
});

app.use(apiLimiter);

// Middleware for authentication
const authMiddleware = require("./middleware/auth");
app.use(authMiddleware);

// Routes
const itemsRouter = require("./routes/items");
const movementsRouter = require("./routes/movements");
const aiRouter = require("./routes/ai");

app.use("/items", itemsRouter);
app.use("/movements", movementsRouter);
app.use("/ai", aiRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "API is running" });
});

const geminiKey = defineSecret("GEMINI_KEY");

// Export the Express app as a Cloud Function (v2)
exports.server = onRequest({ secrets: [geminiKey] }, app);
