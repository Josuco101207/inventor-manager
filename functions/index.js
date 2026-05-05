import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

export const changeUserPasswordByAdmin = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para usar esta función.");
    }

    const { uid, newPassword } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "UID inválido.");
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      throw new HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
    }

    const db = getFirestore();
    const requesterDoc = await db.collection("users").doc(request.auth.uid).get();
    const requesterRole = requesterDoc.exists ? requesterDoc.data()?.role : null;
    if (requesterRole !== "admin") {
      throw new HttpsError("permission-denied", "Solo un administrador puede cambiar contraseñas.");
    }

    await getAuth().updateUser(uid, { password: newPassword });

    await db.collection("movements").add({
      action: "Admin Password Reset",
      item: "Cuenta de usuario",
      itemId: uid,
      qty: 1,
      user: requesterDoc.data()?.email || request.auth.token.email || "admin",
      details: `Contraseña actualizada por admin para UID ${uid}`,
      category: "Seguridad",
      timestamp: new Date(),
    });

    return { ok: true };
  }
);
