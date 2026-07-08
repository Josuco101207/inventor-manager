const cron = require('node-cron');
const dbTools = require('./dbTools');
const { collection, getDocs, query, where, onSnapshot } = require('firebase/firestore');

async function getAllWhatsAppUsers(db) {
  const usersSnapshot = await getDocs(collection(db, 'whatsapp_users'));
  const phones = [];
  usersSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.phone) phones.push(data.phone);
  });
  return phones;
}

function initAlertService(whatsappClient) {
  const db = dbTools.getDb();
  if (!db) {
    console.log('[AlertService] Error: No se pudo obtener la BD de Firebase.');
    return;
  }

  // 1. Ejecutar todos los días a las 9:00 AM (Recordatorio individual original)
  cron.schedule('0 9 * * *', async () => {
    console.log('[AlertService] Iniciando revisión diaria de tablets prestadas (9:00 AM)...');
    
    if (!whatsappClient) return;

    try {
      const itemsQ = query(
        collection(db, 'items'),
        where('category', '==', 'Herramientas'),
        where('status', '==', 'Prestado')
      );
      
      const itemsSnapshot = await getDocs(itemsQ);
      
      const tabletsPrestadas = [];
      itemsSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const itemName = (data.name || '').toLowerCase();
        
        if (itemName.includes('tablet')) {
          tabletsPrestadas.push({ id: docSnap.id, ...data });
        }
      });
      
      if (tabletsPrestadas.length === 0) return;
      
      const usersSnapshot = await getDocs(collection(db, 'whatsapp_users'));
      const whatsappUsers = {};
      usersSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.name && data.phone) {
          whatsappUsers[data.name.toLowerCase().trim()] = data.phone;
        }
      });
      
      for (const tablet of tabletsPrestadas) {
        if (!tablet.borrowedBy) continue;
        
        const borrowerName = tablet.borrowedBy.toLowerCase().trim();
        const borrowerPhone = whatsappUsers[borrowerName];
        
        if (borrowerPhone) {
          const loanDate = tablet.loanDate ? tablet.loanDate.toDate().toLocaleDateString() : 'una fecha anterior';
          const message = `⚠️ *RECORDATORIO DE INVENTARIO*\n\nHola, se detectó que tienes asignada la herramienta *${tablet.name}* desde el *${loanDate}*.\n\nPor favor, recuerda devolverla al almacén si ya terminaste de utilizarla. ¡Gracias!`;
          
          try {
            await whatsappClient.sendMessage(`${borrowerPhone}@c.us`, message);
            console.log(`[AlertService] Alerta 9AM enviada a ${tablet.borrowedBy}.`);
          } catch (error) {
            console.error(`[AlertService] Error WhatsApp 9AM:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error('[AlertService] Error en cron 9AM:', error);
    }
  });

  // 2. Ejecutar todos los días a las 6:00 PM (Aviso a todos si no se ha regresado)
  cron.schedule('0 18 * * *', async () => {
    console.log('[AlertService] Revisión de tablets a las 6:00 PM...');
    if (!whatsappClient) return;

    try {
      const itemsQ = query(
        collection(db, 'items'),
        where('category', '==', 'Herramientas'),
        where('status', '==', 'Prestado')
      );
      
      const itemsSnapshot = await getDocs(itemsQ);
      const tabletsPrestadas = [];
      itemsSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        if ((data.name || '').toLowerCase().includes('tablet')) {
          tabletsPrestadas.push(data);
        }
      });

      if (tabletsPrestadas.length === 0) return; // Todo en orden

      const allPhones = await getAllWhatsAppUsers(db);
      
      for (const tablet of tabletsPrestadas) {
        const borrower = tablet.borrowedBy || 'Alguien';
        const msg = `🚨 *ALERTA DE INVENTARIO (6:00 PM)*\n\nLa herramienta *${tablet.name}* NO ha sido regresada al almacén a tiempo.\nActualmente prestada a: *${borrower}*.`;
        
        for (const phone of allPhones) {
          try {
            await whatsappClient.sendMessage(`${phone}@c.us`, msg);
          } catch (err) {
            console.error(`[AlertService] Error enviando alerta 6PM a ${phone}`);
          }
        }
      }
    } catch(err) {
      console.error('[AlertService] Error en cron 6PM:', err);
    }
  });

  // 3. Listener en tiempo real para avisar cuando se regresa una tablet
  const startupTime = new Date();
  const movementsQ = query(
    collection(db, 'movements'),
    where('date', '>=', startupTime)
  );

  onSnapshot(movementsQ, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const action = (data.action || '').toLowerCase();
        const itemName = (data.itemName || '').toLowerCase();
        
        // El frontend guarda la acción como "Devolución"
        if (action === 'devolución' && itemName.includes('tablet')) {
          const returnTime = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
          const msg = `✅ *TABLET DEVUELTA*\n\nLa herramienta *${data.itemName}* ha sido regresada al almacén exitosamente.\n\n🕒 *Hora:* ${returnTime}\n👤 *Recibió/Registró:* ${data.userName || 'Usuario'}`;
          
          try {
            const allPhones = await getAllWhatsAppUsers(db);
            for (const phone of allPhones) {
               await whatsappClient.sendMessage(`${phone}@c.us`, msg);
            }
          } catch(err) {
            console.error('[AlertService] Error notificando devolución:', err);
          }
        }
      }
    });
  }, (error) => {
    console.error('[AlertService] Error en onSnapshot de devoluciones:', error);
  });

  console.log('✅ Servicio de Alertas (Cron y Devoluciones) inicializado');
}

module.exports = {
  initAlertService
};
