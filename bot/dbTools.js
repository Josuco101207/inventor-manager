const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const Fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const firebaseConfig = {
  apiKey: "AIzaSyDWOFFslHI0eSqyUf_tb1D1VlzMZmNemmM",
  authDomain: "inventor-manager-a0b4d.firebaseapp.com",
  projectId: "inventor-manager-a0b4d",
  storageBucket: "inventor-manager-a0b4d.firebasestorage.app",
  messagingSenderId: "213399034117",
  appId: "1:213399034117:web:3e30a5421c516b05fe7f6c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function loginToFirebase() {
  const email = process.env.APP_EMAIL;
  const password = process.env.APP_PASSWORD;

  if (!email || !password) {
    console.error("======================================================");
    console.error("ERROR CRÍTICO: Falta APP_EMAIL o APP_PASSWORD en el archivo .env");
    console.error("El bot necesita iniciar sesión en tu app para tener permisos.");
    console.error("======================================================");
    process.exit(1);
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ Sesión iniciada en Firebase Auth.");
    
    // Check if the user document exists, if not, create it as admin
    const { getDoc, setDoc } = require('firebase/firestore');
    const userDocRef = doc(db, 'users', cred.user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (!userDocSnap.exists()) {
      console.log("Creando perfil de administrador para el bot en la base de datos...");
      await setDoc(userDocRef, {
        name: 'Bot Whatsapp',
        email: email,
        role: 'admin',
        createdAt: serverTimestamp()
      });
      console.log("✅ Perfil de administrador creado.");
    }
    
    console.log("✅ El bot tiene permisos de administrador.");
  } catch (error) {
    console.error("❌ Error al iniciar sesión en Firebase:", error.message);
    process.exit(1);
  }
}

async function isAuthorizedUser(phoneNumber) {
  try {
    const whitelistQ = query(collection(db, 'whatsapp_users'), where('phone', '==', phoneNumber));
    const whitelistSnapshot = await getDocs(whitelistQ);
    
    if (!whitelistSnapshot.empty) return true;

    // Check personnel or users if needed, but whitelist is safer
    return false;
  } catch (error) {
    console.error("Error verificando usuario:", error);
    return false;
  }
}

async function searchItems({ keyword }) {
  try {
    const snapshot = await getDocs(collection(db, 'items'));
    let results = [];
    const lowerKeyword = keyword ? keyword.toLowerCase() : '';

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      results.push({
        id: docSnap.id,
        name: data.name || '',
        category: data.category || '',
        subcategory: data.subcategory || '',
        grupo: data.grupo || '',
        item_number: data.item_number || '',
        quantity: data.qty || 0,
        location: data.location || 'N/A',
        combinedText: `${data.name || ''} ${data.category || ''} ${data.subcategory || ''} ${data.grupo || ''} ${data.item_number || ''}`
      });
    });

    if (!lowerKeyword) {
      return JSON.stringify(results.map(r => {
        delete r.combinedText;
        return r;
      }));
    }

    const fuse = new Fuse(results, {
      keys: ['combinedText'],
      threshold: 0.6, // 0.6 permite coincidencias mucho más flexibles (ej. "protector" encuentra "PROTECTOR DE TUBO")
      ignoreLocation: true,
      useExtendedSearch: true,
      includeScore: true
    });

    let searchResults = fuse.search(lowerKeyword);
    if (searchResults.length > 0) {
      const bestScore = searchResults[0].score;
      searchResults = searchResults.filter(r => r.score <= bestScore + 0.15);
    }
    
    results = searchResults.map(result => {
      const item = result.item;
      delete item.combinedText;
      return item;
    });

    // Limitar a los 50 mejores resultados para no saturar el mensaje de WhatsApp
    results = results.slice(0, 50);

    if (results.length === 0) {
      return "No se encontraron artículos con esa descripción o categoría. Por favor verifica si el nombre está bien escrito o si la categoría existe.";
    }

    return JSON.stringify(results);
  } catch (error) {
    console.error("Error en searchItems:", error);
    return "Ocurrió un error al buscar.";
  }
}

async function getInventorySummary() {
  try {
    const snapshot = await getDocs(collection(db, 'items'));
    let totalItems = snapshot.size;
    let totalStock = 0;
    
    snapshot.forEach(docSnap => {
      const q = docSnap.data().qty;
      if (typeof q === 'number') totalStock += q;
    });

    return `Inventario: ${totalItems} productos diferentes, sumando ${totalStock} unidades físicas totales.`;
  } catch (error) {
    return "Error obteniendo resumen.";
  }
}

async function registerMovement({ itemName, quantity, type, userPhone }) {
  try {
    const itemsSnapshot = await getDocs(collection(db, 'items'));
    
    let targetItem = null;
    let targetDocId = null;

    let allItems = [];
    itemsSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      allItems.push({
        id: docSnap.id,
        ...data,
        combinedText: `${data.name || ''} ${data.category || ''} ${data.subcategory || ''} ${data.grupo || ''} ${data.item_number || ''}`
      });
    });

    const fuse = new Fuse(allItems, {
      keys: ['combinedText'],
      threshold: 0.6,
      ignoreLocation: true,
      useExtendedSearch: true,
      includeScore: true
    });

    let searchResults = fuse.search(itemName);
    if (searchResults.length > 0) {
      const bestScore = searchResults[0].score;
      searchResults = searchResults.filter(r => r.score <= bestScore + 0.15);
    }
    
    if (searchResults.length === 0) {
      return `No encontré ningún artículo parecido a "${itemName}". Revisa la ortografía.`;
    }

    targetItem = searchResults[0].item;
    targetDocId = targetItem.id;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return "La cantidad debe ser positiva.";

    if (type === 'Salida' && targetItem.qty < qty) {
      return `Stock insuficiente. Quieres sacar ${qty} pero solo hay ${targetItem.qty}.`;
    }

    let userName = "Usuario WhatsApp";
    const userQ = query(collection(db, 'whatsapp_users'), where('phone', '==', userPhone));
    const userSnap = await getDocs(userQ);
    if (!userSnap.empty) {
      userName = userSnap.docs[0].data().name || userName;
    }

    const newQuantity = type === 'Entrada' ? targetItem.qty + qty : targetItem.qty - qty;
    
    // Update Item
    await updateDoc(doc(db, 'items', targetDocId), {
      qty: newQuantity,
      updatedAt: serverTimestamp()
    });

    // Create Movement
    await addDoc(collection(db, 'movements'), {
      item: targetDocId, // Using 'item' as requested by rules
      itemName: targetItem.name,
      action: type,      // Using 'action' ('Entrada' o 'Salida') as requested by rules
      qty: qty,          // Using 'qty' as requested by rules
      previousQuantity: targetItem.qty,
      newQuantity: newQuantity,
      timestamp: serverTimestamp(),
      personnel: userName,
      user: userName,
      category: targetItem.category, // Required by rules
      source: 'WhatsApp'
    });

    return `¡Éxito! Registrada ${type.toLowerCase()} de ${qty} "${targetItem.name}". Nuevo stock: ${newQuantity}.`;
  } catch (error) {
    console.error("Error en registerMovement:", error);
    return "Ocurrió un error al registrar el movimiento. Verifica que tu usuario tenga permisos de Administrador o Almacenista en la app.";
  }
}

async function autorizarNumero(phoneNumber) {
  try {
    const userQ = query(collection(db, 'whatsapp_users'), where('phone', '==', phoneNumber));
    const snap = await getDocs(userQ);
    if (!snap.empty) return true; // Ya existe

    await addDoc(collection(db, 'whatsapp_users'), {
      phone: phoneNumber,
      name: 'Usuario Auto-Registrado',
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error al registrar número:", error);
    return false;
  }
}

async function analyzeMovements(question) {
  try {
    const { orderBy, limit } = require('firebase/firestore');
    const movsQ = query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(150));
    const movsSnap = await getDocs(movsQ);
    
    let history = [];
    movsSnap.forEach(docSnap => {
      const data = docSnap.data();
      history.push({
        articulo: data.itemName,
        accion: data.action,
        cantidad: data.qty,
        fecha: data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Desconocida',
        usuario: data.user || data.personnel
      });
    });

    if (history.length === 0) return "No hay movimientos registrados en el historial para analizar.";
    
    return JSON.stringify(history);
  } catch (error) {
    console.error("Error analizando movimientos:", error);
    return "Ocurrió un error al extraer el historial para el análisis.";
  }
}

async function generateExport(format) {
  try {
    // 1. Obtener datos
    const itemsSnap = await getDocs(collection(db, 'items'));
    let items = [];
    itemsSnap.forEach(d => items.push(d.data()));

    const filePath = path.join(__dirname, `inventario_${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`);

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Inventario');
      
      worksheet.columns = [
        { header: 'Nombre', key: 'name', width: 30 },
        { header: 'Categoría', key: 'category', width: 20 },
        { header: 'Cantidad', key: 'qty', width: 10 },
        { header: 'Ubicación', key: 'location', width: 20 }
      ];

      items.forEach(item => {
        worksheet.addRow({
          name: item.name || '',
          category: item.category || '',
          qty: item.qty || 0,
          location: item.location || ''
        });
      });

      await workbook.xlsx.writeFile(filePath);
      return filePath;

    } else {
      // PDF
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(18).text('Reporte de Inventario', { align: 'center' });
        doc.moveDown();

        const table = {
          title: "Existencias Actuales",
          headers: ["Nombre", "Categoría", "Cantidad", "Ubicación"],
          rows: items.map(item => [
            item.name || '',
            item.category || '',
            String(item.qty || 0),
            item.location || ''
          ])
        };

        doc.table(table, {
          prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
          prepareRow: (row, indexColumn, indexRow, rectRow) => doc.font("Helvetica").fontSize(10)
        });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
      });
    }

  } catch (error) {
    console.error("Error al exportar:", error);
    return null;
  }
}

module.exports = {
  loginToFirebase,
  isAuthorizedUser,
  autorizarNumero,
  searchItems,
  getInventorySummary,
  registerMovement,
  analyzeMovements,
  generateExport,
  getDb: () => db
};
