import { db } from '../src/firebase/config.js';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

const personnelList = [
  {"employeeId": "1", "name": "ARTEAGA MACIAS JUAN MANUEL"},
  {"employeeId": "2", "name": "CRUZ PEREZ VICTOR MANUEL"},
  {"employeeId": "6", "name": "JUAREZ AZUARA MIREYA"},
  {"employeeId": "12", "name": "VALLE LLAMAS JUAN MARTIN"},
  {"employeeId": "18", "name": "SERNA BASULTO MONICA"},
  {"employeeId": "20", "name": "VALLE ZERMEÑO JUAN JOSE"},
  {"employeeId": "21", "name": "JUAREZ DEL MURO JOSE ARTEMIO"},
  {"employeeId": "23", "name": "GUTIERREZ LIZARDI JORGE"},
  {"employeeId": "26", "name": "FLORES GARCIA FERNANDO"},
  {"employeeId": "43", "name": "SANTOS REYES BERTOLDO"},
  {"employeeId": "50", "name": "SEPULVEDA RAYGOZA RICARDO CESAR"},
  {"employeeId": "55", "name": "GARCIA RUELAS HECTOR RAFAEL"},
  {"employeeId": "76", "name": "LOMELI ZENTEÑO JUAN CARLOS"},
  {"employeeId": "84", "name": "SANDOVAL ARELLANO LUIS HUMBERTO"},
  {"employeeId": "99", "name": "SUAREZ TOVAR GILBERTO MIGUEL"},
  {"employeeId": "101", "name": "AVALOS CRUZ OFELIA EDELMIRA"},
  {"employeeId": "102", "name": "SALCIDO MAYORGA GABRIELA SOFIA"},
  {"employeeId": "104", "name": "AVALOS CRUZ MIGUEL JAVIER"},
  {"employeeId": "110", "name": "ANTONIO MARTINEZ JOSE RODOLFO"},
  {"employeeId": "130", "name": "VELAZQUEZ ALCARAZ JOSE ALFREDO"},
  {"employeeId": "132", "name": "MARTINEZ GOMEZ OSCAR ALBERTO"},
  {"employeeId": "133", "name": "CARDENAS NAVARRO LEONARDO"},
  {"employeeId": "141", "name": "RAMIREZ LOPEZ MIGUEL ANGEL"},
  {"employeeId": "151", "name": "NUÑEZ LANDEROS JORGE"},
  {"employeeId": "159", "name": "SALAZAR CRUZ JOSE BLAS"},
  {"employeeId": "167", "name": "CAMACHO FRANCO MONICA GUADALUPE"},
  {"employeeId": "168", "name": "MARTINEZ MURILLO ESTEBAN"},
  {"employeeId": "171", "name": "GOMEZ GOMEZ HUGO EFRAIN"},
  {"employeeId": "172", "name": "BELMONTES LOZA TERESA"},
  {"employeeId": "173", "name": "RAMOS MORENO MONSSERRAT DE LA LUZ"},
  {"employeeId": "175", "name": "ANCHEYTA ESCANDON MAURICIO"},
  {"employeeId": "179", "name": "RAMOS MEDINA CARLOS ALBERTO"},
  {"employeeId": "182", "name": "RAMOS VALENCIA ANTONIO"},
  {"employeeId": "185", "name": "RIOS VIVANCO FORTUNATO"},
  {"employeeId": "186", "name": "CANDELARIO CASTILLO JOSE ANGEL"},
  {"employeeId": "187", "name": "RODRIGUEZ RODRIGUEZ RODRIGO"},
  {"employeeId": "191", "name": "VALLE ZERMEÑO LUIS ANGEL"},
  {"employeeId": "196", "name": "OJEDA DE JESUS FRANCISCO JAVIER"},
  {"employeeId": "199", "name": "HERNANDEZ GARCIA MIGUEL ANGEL"},
  {"employeeId": "209", "name": "RUVALCABA RAMIREZ CESAR AUGUSTO"},
  {"employeeId": "220", "name": "PUENTE MARTINEZ BRANDON"},
  {"employeeId": "221", "name": "RODRIGUEZ ZAMUDIO HECTOR ADRIAN"},
  {"employeeId": "222", "name": "CORONA AMARO NORMA ISABEL"},
  {"employeeId": "232", "name": "DE LA TORRE MEDINA GUILLERMO"},
  {"employeeId": "233", "name": "BAUTISTA RAMIREZ AQUILEO"},
  {"employeeId": "236", "name": "ROMERO SERRANO JOSE FERNANDO"},
  {"employeeId": "247", "name": "ZUÑIGA RICO JOAQUIN DE LA CRUZ"},
  {"employeeId": "249", "name": "NAVARRO RODRIGUEZ FABIOLA"},
  {"employeeId": "251", "name": "GONZALEZ RUIZ CRISTOPHER"},
  {"employeeId": "255", "name": "GONZALEZ REYES IVAN ORLANDO"},
  {"employeeId": "260", "name": "GOMEZ GOMEZ IRMA DEL CARMEN"},
  {"employeeId": "262", "name": "AGUILAR FLORES HECTOR MIGUEL"},
  {"employeeId": "264", "name": "LAZO SANCHEZ ANAYELI"},
  {"employeeId": "266", "name": "PUEBLA GONZALEZ OMAR ALEJANDRO"},
  {"employeeId": "268", "name": "AUGUSTIN ROSEMITE"},
  {"employeeId": "281", "name": "CASTILLO CARRANZA NATALI YAZMIN"},
  {"employeeId": "282", "name": "RUIZ RAMIREZ NORMA LETICIA"},
  {"employeeId": "284", "name": "ARREDONDO RAMIREZ ROMELIA GUADALUPE"},
  {"employeeId": "285", "name": "PIERRE MORENO DAVID MAXIMILIANO"},
  {"employeeId": "291", "name": "SEVILLA LOZANO ERNESTO"},
  {"employeeId": "297", "name": "ALVAREZ DEL REAL JUAN JOSE"},
  {"employeeId": "298", "name": "GRAJEDA IBARRA JORGE"},
  {"employeeId": "307", "name": "DIEGO MATIAS CARLOS ALBERTO"},
  {"employeeId": "308", "name": "CAJERO ALVAREZ JORGE ADRIAN"},
  {"employeeId": "312", "name": "CARDENAS MERCADO ADRIAN"},
  {"employeeId": "313", "name": "PLASCENICA RENTERIA OMAR ALEJANDRO"},
  {"employeeId": "316", "name": "OROZCO RAZO RAMON ALBERTO"},
  {"employeeId": "320", "name": "SUAREZ CONTRERAS JONATHAN MIGUEL"},
  {"employeeId": "324", "name": "PRIETO DAVID LUIS OCTAVIO"},
  {"employeeId": "325", "name": "MOSCOSO AMEZCUA SOFIA"},
  {"employeeId": "326", "name": "MOLINA SAMANIEGA MA DE LA LUZ"},
  {"employeeId": "327", "name": "GARCIA ROSALES MARIA GABRIELA"},
  {"employeeId": "328", "name": "ROBLEDO CORONA ENYA YUCARI"},
  {"employeeId": "329", "name": "REYES GUZMAN SANDRA BERENICE"},
  {"employeeId": "330", "name": "MURILLO NAVARRO SALVADOR"},
  {"employeeId": "331", "name": "TORRES ROCHIN ALEXA"},
  {"employeeId": "332", "name": "GRIMALDO TELLEZ NELY PAOLA"},
  {"employeeId": "333", "name": "ALMEDA GONZALEZ MARIA GUADALUPE"},
  {"employeeId": "334", "name": "MUÑOZ VILLALPANDO BLANCA ESTHELA"},
  {"employeeId": "336", "name": "ALVARADO GARCIA ISABEL"},
  {"employeeId": "337", "name": "MARIN NAVARRO BRYAN JORGE"},
  {"employeeId": "338", "name": "RODRIGUEZ CONTRERAS MARIA DEL CARMEN"},
  {"employeeId": "339", "name": "ANCHEYTA ESCANDON ALEJANDRO"},
  {"employeeId": "340", "name": "GOMEZ SANCHEZ WILBER LEONARDO"},
  {"employeeId": "341", "name": "ZAMORA DE ALBA GABRIELA"},
  {"employeeId": "342", "name": "AVALOS VALDESPINO AUDELIO"},
  {"employeeId": "343", "name": "PEREZ GUZMAN JAIME FERNANDO"},
  {"employeeId": "344", "name": "CARDENAS CASTAÑEDA JORGE ERNESTO"},
  {"employeeId": "345", "name": "CORTES SUAREZ JUAN MANUEL"},
  {"employeeId": "346", "name": "FLORES FLORES MARIA FERNANDA"},
  {"employeeId": "10005", "name": "ESPINOZA RAMIREZ MIGUEL"},
  {"employeeId": "10020", "name": "JESUS ARMANDO GARCIA CERDA"},
  {"employeeId": "10028", "name": "MARTINES PEDROZA JULIO YAHIR"}
];

async function seedPersonnel() {
  try {
    const personnelRef = collection(db, 'personnel');
    const batch = writeBatch(db);

    console.log(`Starting to seed ${personnelList.length} employees...`);

    personnelList.forEach((person) => {
      const newDocRef = doc(personnelRef);
      batch.set(newDocRef, {
        ...person,
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();
    console.log('Successfully seeded personnel data!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding personnel data:', error);
    process.exit(1);
  }
}

seedPersonnel();
