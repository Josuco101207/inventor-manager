const express = require("express");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const router = express.Router();
const db = getFirestore();

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
    const { action, item, qty, category, notes } = req.body;
    
    const validActions = ['Entrada', 'Salida', 'Préstamo', 'Devolución', 'Falla/Manto', 'Auditoría', 'Alta', 'Edición', 'Eliminación', 'Anulación', 'Asignación', 'Transferencia', 'Movimiento de Sección'];

    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: "Invalid or missing action" });
    }
    if (!item || typeof item !== 'string' || item.length > 100) {
      return res.status(400).json({ error: "Invalid or missing item ID" });
    }
    if (qty === undefined || typeof qty !== 'number' || qty < 0 || qty > 10000) {
      return res.status(400).json({ error: "Invalid qty: must be a number between 0 and 10000" });
    }
    if (category === undefined || typeof category !== 'string' || category.length > 50) {
      return res.status(400).json({ error: "Invalid or missing category" });
    }

    const safeData = {
      action,
      item,
      qty,
      category,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      apiSource: req.apiUser ? req.apiUser.name : "API"
    };

    if (notes && typeof notes === 'string') {
      safeData.notes = notes.substring(0, 500); // Max 500 chars
    }
    
    const docRef = await db.collection("movements").add(safeData);
    res.status(201).json({ id: docRef.id, message: "Movement created successfully" });
  } catch (error) {
    console.error("Error creating movement:", error);
    res.status(500).json({ error: "Failed to create movement" });
  }
});

module.exports = router;
