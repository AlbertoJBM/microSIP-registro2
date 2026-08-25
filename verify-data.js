const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function verifyData() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'server', 'data', 'central_logs.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ No se encontró la base de datos');
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Verificar estadísticas actuales
  const statsResult = db.exec(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) as salientes,
      SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) as entrantes_atendidas,
      SUM(CASE WHEN type = 2 THEN 1 ELSE 0 END) as entrantes_nao_atendidas,
      SUM(CASE WHEN type = 1 AND duration > 0 THEN 1 ELSE 0 END) as entrantes_com_duracao,
      SUM(CASE WHEN type = 2 AND duration = 0 THEN 1 ELSE 0 END) as nao_atendidas_sem_duracao
    FROM call_logs
  `);
  
  console.log('📊 Estadísticas de la base de datos:');
  if (statsResult.length > 0) {
    const row = statsResult[0].values[0];
    console.log(`  Total: ${row[0]}`);
    console.log(`  Salientes (type 0): ${row[1]}`);
    console.log(`  Entrantes Atendidas (type 1): ${row[2]}`);
    console.log(`  Entrantes Não Atendidas (type 2): ${row[3]}`);
    console.log(`  Entrantes con duración: ${row[4]}`);
    console.log(`  Não atendidas sin duración: ${row[5]}`);
  }
  
  // Ver algunos registros problemáticos
  const samplesResult = db.exec(`
    SELECT id, type, duration, category, type_description
    FROM call_logs
    ORDER BY id DESC
    LIMIT 10
  `);
  
  console.log('\n📋 Últimos 10 registros:');
  if (samplesResult.length > 0) {
    console.log('Columns:', samplesResult[0].columns.join(' | '));
    samplesResult[0].values.forEach(row => {
      console.log(row.join(' | '));
    });
  }
  
  db.close();
}

verifyData().catch(console.error);
