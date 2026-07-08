require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function test() {
    const itemsSnap = await db.collection('items').get();
    const itemsDict = {};
    itemsSnap.forEach(d => {
        itemsDict[d.id] = d.data().name || 'Desconocido';
    });
    console.log("Items en dict:", Object.keys(itemsDict).length);

    const movsQ = db.collection('movements').orderBy('timestamp', 'desc').limit(5);
    const movsSnap = await movsQ.get();
    
    let history = [];
    movsSnap.forEach(docSnap => {
        const data = docSnap.data();
        history.push({
            id: docSnap.id,
            rawItemName: data.itemName,
            rawItem: data.item,
            articulo: data.itemName || itemsDict[data.item] || 'Artículo Desconocido',
            accion: data.action,
            cantidad: data.qty
        });
    });
    console.log(JSON.stringify(history, null, 2));
    process.exit(0);
}
test().catch(console.error);
