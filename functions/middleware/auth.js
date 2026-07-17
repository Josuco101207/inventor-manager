const admin = require("firebase-admin");

/**
 * Middleware to authenticate API requests using an API Key.
 * Expects the API Key to be sent in the 'x-api-key' header.
 * Validates the key against the 'api_keys' collection in Firestore.
 */
const authMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized: Missing API Key in x-api-key header' });
  }

  try {
    const db = admin.firestore();
    const keysSnapshot = await db.collection('api_keys').where('key', '==', apiKey).limit(1).get();

    if (keysSnapshot.empty) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }

    const keyData = keysSnapshot.docs[0].data();
    
    // Check if key is active
    if (keyData.active === false) {
      return res.status(403).json({ error: 'Forbidden: API Key is disabled' });
    }

    // Attach key metadata to the request for downstream use (e.g., auditing)
    req.apiUser = {
      id: keysSnapshot.docs[0].id,
      name: keyData.name || 'Unknown App',
      permissions: keyData.permissions || []
    };

    next();
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ error: 'Internal Server Error during authentication' });
  }
};

module.exports = authMiddleware;
