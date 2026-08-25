const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function reMigrate() {
  console.log('🔄 Iniciando re-migración de datos...');
  
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'server', 'data', 'central_logs.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ No se encontró la base de datos central');
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // 1. Ver datos actuales
  const beforeResult = db.exec(`
    SELECT type, COUNT(*) as count 
    FROM call_logs 
    GROUP BY type
  `);
  
  console.log('📊 Antes de la migración:');
  if (beforeResult.length > 0) {
    beforeResult[0].values.forEach(row => {
      console.log(`  type ${row[0]}: ${row[1]} registros`);
    });
  }
  
  // 2. Actualizar type_description según type
  console.log('\n🔄 Actualizando type_description...');
  db.run(`
    UPDATE call_logs 
    SET type_description = CASE 
      WHEN type = 0 THEN 'Saliente'
      WHEN type = 1 THEN 'Entrante Atendida'
      WHEN type = 2 THEN 'Entrante Não Atendida'
      ELSE type_description
    END
    WHERE type IN (0, 1, 2)
  `);
  
  // 3. Actualizar category según type
  console.log('🔄 Actualizando category...');
  db.run(`
    UPDATE call_logs 
    SET category = CASE 
      WHEN type = 0 AND duration > 0 THEN 'SALIENTE_ATENDIDA'
      WHEN type = 0 AND duration = 0 THEN 'SALIENTE_NAO_ATENDIDA'
      WHEN type = 1 THEN 'ENTRANTE_ATENDIDA'
      WHEN type = 2 THEN 'ENTRANTE_NAO_ATENDIDA'
      ELSE category
    END
    WHERE type IN (0, 1, 2)
  `);
  
  // 4. Verificar después de la migración
  const afterResult = db.exec(`
    SELECT 
      type,
      COUNT(*) as total,
      SUM(CASE WHEN category = 'ENTRANTE_ATENDIDA' THEN 1 ELSE 0 END) as entrante_atendida,
      SUM(CASE WHEN category = 'ENTRANTE_NAO_ATENDIDA' THEN 1 ELSE 0 END) as entrante_nao_atendida,
      SUM(CASE WHEN category = 'SALIENTE_ATENDIDA' THEN 1 ELSE 0 END) as saliente_atendida,
      SUM(CASE WHEN category = 'SALIENTE_NAO_ATENDIDA' THEN 1 ELSE 0 END) as saliente_nao_atendida
    FROM call_logs 
    GROUP BY type
  `);
  
  console.log('\n📊 Después de la migración:');
  if (afterResult.length > 0) {
    afterResult[0].values.forEach(row => {
      console.log(`  type ${row[0]}: ${row[1]} registros`);
      console.log(`    - Entrante Atendida: ${row[2]}`);
      console.log(`    - Entrante Não Atendida: ${row[3]}`);
      console.log(`    - Saliente Atendida: ${row[4]}`);
      console.log(`    - Saliente Não Atendida: ${row[5]}`);
    });
  }
  
  // 5. Guardar cambios
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  
  console.log('\n✅ Re-migración completada!');
}

reMigrate().catch(console.error);
