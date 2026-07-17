const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();

/**
 * GET /items
 * Retrieve a list of items.
 * Supports optional query params: category, limit
 */
router.get("/", async (req, res) => {
  try {
    let query = db.collection("items");
    
    // Optional filtering by category
    if (req.query.category) {
      query = query.where("category", "==", req.query.category);
    }
    
    // Optional limit
    if (req.query.limit) {
      query = query.limit(parseInt(req.query.limit, 10));
    }

    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(items);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
});

/**
 * GET /items/:id
 * Retrieve a specific item by ID.
 */
router.get("/:id", async (req, res) => {
  try {
    const doc = await db.collection("items").doc(req.params.id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

/**
 * POST /items
 * Create a new item.
 */
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    
    if (!data.name || !data.category) {
      return res.status(400).json({ error: "Missing required fields: name, category" });
    }

    // Add timestamp if not provided
    if (!data.timestamp) {
      data.timestamp = admin.firestore.FieldValue.serverTimestamp();
    }

    const docRef = await db.collection("items").add(data);
    res.status(201).json({ id: docRef.id, message: "Item created successfully" });
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ error: "Failed to create item" });
  }
});

/**
 * PUT /items/:id
 * Update an existing item.
 */
router.put("/:id", async (req, res) => {
  try {
    const data = req.body;
    
    // Check if document exists
    const docRef = db.collection("items").doc(req.params.id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    await docRef.update(data);
    res.status(200).json({ id: docRef.id, message: "Item updated successfully" });
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
});

module.exports = router;
