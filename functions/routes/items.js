const express = require("express");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const router = express.Router();
const db = getFirestore();

const sanitizeItemData = (data) => {
  const allowed = {};
  if (typeof data.name === 'string') allowed.name = data.name;
  if (typeof data.category === 'string') allowed.category = data.category;
  if (typeof data.qty === 'number') allowed.qty = data.qty;
  if (typeof data.threshold === 'number') allowed.threshold = data.threshold;
  if (typeof data.unit === 'string') allowed.unit = data.unit;
  if (typeof data.status === 'string') allowed.status = data.status;
  if (typeof data.codigo === 'string') allowed.codigo = data.codigo;
  if (typeof data.location === 'string') allowed.location = data.location;
  if (typeof data.price === 'number') allowed.price = data.price;
  if (typeof data.supplier === 'string') allowed.supplier = data.supplier;
  
  if (data.stockByLocation && typeof data.stockByLocation === 'object') {
    allowed.stockByLocation = data.stockByLocation; // Podría validarse más profundo si es necesario
  }
  
  return allowed;
};

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
    
    // Optional limit - Restrict to max 500
    let limitValue = req.query.limit ? parseInt(req.query.limit, 10) : 500;
    if (isNaN(limitValue) || limitValue > 500) limitValue = 500;
    query = query.limit(limitValue);

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
    const { name, category, description } = req.body;
    
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: "Invalid or missing name (must be 2-100 characters)" });
    }
    if (!category || typeof category !== 'string' || category.length > 50) {
      return res.status(400).json({ error: "Invalid or missing category" });
    }

    const safeData = {
      name: name.trim(),
      category: category.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (description && typeof description === 'string') {
      safeData.description = description.substring(0, 500); // Max 500 chars
    }

    const docRef = await db.collection("items").add(safeData);
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
    const { name, category, description } = req.body;
    const safeData = {};

    if (name) {
      if (typeof name !== 'string' || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: "Invalid name (must be 2-100 characters)" });
      }
      safeData.name = name.trim();
    }
    
    if (category) {
      if (typeof category !== 'string' || category.length > 50) {
        return res.status(400).json({ error: "Invalid category" });
      }
      safeData.category = category.trim();
    }
    
    if (description && typeof description === 'string') {
      safeData.description = description.substring(0, 500);
    }
    
    // Check if document exists
    const docRef = db.collection("items").doc(req.params.id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    // Ensure there's something to update
    if (Object.keys(safeData).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }
    
    safeData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await docRef.update(safeData);
    res.status(200).json({ id: docRef.id, message: "Item updated successfully" });
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
});

module.exports = router;
