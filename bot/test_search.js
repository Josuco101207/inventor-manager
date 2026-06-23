require('dotenv').config();
const dbTools = require('./dbTools');
const Fuse = require('fuse.js');

setTimeout(async () => {
    await dbTools.loginToFirebase();
    const { getFirestore, collection, getDocs } = require('firebase/firestore');
    const snap = await getDocs(collection(dbTools.getDb(), 'items'));
    const items = [];
    snap.forEach(docSnap => {
        const data = docSnap.data();
        items.push({
            name: data.name,
            combinedText: `${data.name || ''} ${data.category || ''} ${data.subcategory || ''} ${data.grupo || ''} ${data.item_number || ''}`
        });
    });
    
    const fuse = new Fuse(items, {keys: ['combinedText'], threshold: 0.6, ignoreLocation: true, useExtendedSearch: false, includeScore: true});
    console.log('Top 10 for protector de tubo amarillo:');
    const res = fuse.search('protector de tubo amarillo').slice(0, 10);
    res.forEach(r => console.log(r.score.toFixed(3), r.item.name));
    process.exit(0);
}, 3000);
