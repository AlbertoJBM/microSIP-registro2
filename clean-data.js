const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function cleanData() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'server', 'data', 'central_logs.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ No se encontró la base de datos');
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // 1. Eliminar registros con type inválido
  console.log('🔄 Limpiando registros con type inválido...');
  db.run(`DELETE FROM call_logs WHERE type NOT IN (0, 1, 2)`);
  
  // 2. Corregir type_description
  db.run(`
    UPDATE call_logs 
    SET type_description = CASE 
      WHEN type = 0 THEN 'Saliente'
      WHEN type = 1 THEN 'Entrante Atendida'
      WHEN type = 2 THEN 'Entrante Não Atendida'
      ELSE type_description
    END
  `);
  
  // 3. Corregir category
  db.run(`
    UPDATE call_logs 
    SET category = CASE 
      WHEN type = 0 AND duration > 0 THEN 'SALIENTE_ATENDIDA'
      WHEN type = 0 AND duration = 0 THEN 'SALIENTE_NAO_ATENDIDA'
      WHEN type = 1 THEN 'ENTRANTE_ATENDIDA'
      WHEN type = 2 THEN 'ENTRANTE_NAO_ATENDIDA'
      ELSE 'OUTRO'
    END
  `);
  
  // 4. Guardar
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  
  console.log('✅ Limpieza completada');
}

cleanData().catch(console.error);
