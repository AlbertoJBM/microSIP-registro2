const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function setup() {
console.log('Configurando entorno de testing para MicroSIP Dashboard...\n');

// 1. Crear base de datos de prueba
const microSipDir = path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'MicroSIP');
const testDbPath = path.join(microSipDir, 'call_log.db');

if (!fs.existsSync(microSipDir)) {
    fs.mkdirSync(microSipDir, { recursive: true });
    console.log(`✅ Directorio MicroSIP creado: ${microSipDir}`);
}

// Backup de la base de datos existente
if (fs.existsSync(testDbPath)) {
    const backupPath = testDbPath + '.backup_' + Date.now();
    fs.copyFileSync(testDbPath, backupPath);
    console.log(`✅ Backup creado: ${backupPath}`);
}

// Abrir la base existente o crear una nueva sin borrar registros
const SQL = await initSqlJs();
const db = fs.existsSync(testDbPath)
    ? new SQL.Database(fs.readFileSync(testDbPath))
    : new SQL.Database();

db.exec(`
    CREATE TABLE IF NOT EXISTS call_log (
        id INTEGER PRIMARY KEY,
        callId TEXT UNIQUE,
        number TEXT,
        name TEXT,
        type INTEGER,
        time INTEGER,
        duration INTEGER,
        info TEXT
    );
`);

console.log('✅ Tabla call_log creada');

// 2. Insertar datos de prueba
const now = Math.floor(Date.now() / 1000);
const testData = [
    ['test-call-001', '98275', 'Cliente 1', 1, now - 3600, 180, 'Chamada encerrada'],
    ['test-call-002', '98419', 'Cliente 2', 2, now - 3000, 240, 'Chamada encerrada'],
    ['test-call-003', '6513', 'Cliente 3', 1, now - 2400, 300, 'Chamada encerrada'],
    ['test-call-004', '10301', 'Cliente 4', 3, now - 1800, 0, 'Chamada perdida'],
    ['test-call-005', '8914', 'Cliente 5', 1, now - 1200, 120, 'Chamada encerrada'],
    ['test-call-006', '10501', 'Cliente 6', 2, now - 600, 360, 'Chamada encerrada'],
    ['test-call-007', '7901', 'Cliente 7', 1, now - 86400, 90, 'Chamada encerrada'],
    ['test-call-008', '618', 'Cliente 8', 2, now - 82800, 150, 'Chamada encerrada'],
    ['test-call-009', '6701', 'Cliente 9', 1, now - 79200, 210, 'Chamada encerrada'],
    ['test-call-010', '98275', 'Cliente 1', 3, now - 75600, 0, 'Chamada perdida'],
];

testData.forEach(item => {
    db.run(`
        INSERT OR IGNORE INTO call_log (callId, number, name, type, time, duration, info)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, item);
});
console.log(`✅ ${testData.length} registros de prueba insertados`);

// Verificar datos
const count = db.exec('SELECT COUNT(*) FROM call_log')[0].values[0][0];
console.log(`Total de registros en la base: ${count}`);

fs.writeFileSync(testDbPath, Buffer.from(db.export()));
db.close();

console.log('\nConfiguracion completada!');
console.log('\nSiguientes pasos:');
console.log('1. npm run install-all (instalar dependencias)');
console.log('2. npm run build-all (compilar TypeScript)');
console.log('3. npm run start-server (Terminal 1)');
console.log('4. npm run start-agent (Terminal 2)');
}

setup().catch((error) => {
    console.error('Error durante la configuracion:', error.message);
    process.exitCode = 1;
});
