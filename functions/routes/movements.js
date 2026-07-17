const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();

/**
 * GET /movements
 * Retrieve a list of movements.
 * Supports optional query params: item (itemId), limit
 */
router.get("/", async (req, res) => {
  try {
    let query = db.collection("movements").orderBy("timestamp", "desc");
    
    // Optional filtering by item ID
    if (req.query.item) {
      // If querying by item, we need a composite index on item + timestamp desc
      // Assuming it's already created, or we can just filter without order and let it be.
      query = db.collection("movements").where("item", "==", req.query.item).orderBy("timestamp", "desc");
    }
    
    // Optional limit
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    query = query.limit(limit);

    const snapshot = await query.get();
    const movements = [];
    
    snapshot.forEach(doc => {
      movements.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(movements);
  } catch (error) {
    console.error("Error fetching movements:", error);
    res.status(500).json({ error: "Failed to fetch movements" });
  }
});

/**
 * POST /movements
 * Create a new movement.
 */
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    
    if (!data.action || !data.item || data.qty === undefined || data.category === undefined) {
      return res.status(400).json({ error: "Missing required fields: action, item, qty, category" });
    }
    
    if (typeof data.qty !== "number" || data.qty < 0) {
      return res.status(400).json({ error: "Invalid qty: must be a non-negative number" });
    }

    // Add metadata
    data.timestamp = admin.firestore.FieldValue.serverTimestamp();
    data.apiSource = req.apiUser ? req.apiUser.name : "API";
    
    const docRef = await db.collection("movements").add(data);
    res.status(201).json({ id: docRef.id, message: "Movement created successfully" });
  } catch (error) {
    console.error("Error creating movement:", error);
    res.status(500).json({ error: "Failed to create movement" });
  }
});

module.exports = router;
