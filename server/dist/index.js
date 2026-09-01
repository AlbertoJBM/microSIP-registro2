"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const sql_js_1 = __importDefault(require("sql.js"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
let db = null;
const dbPath = path.join(__dirname, '../data', 'central_logs.db');
const storeLocationsPath = path.join(__dirname, '../data', 'store-locations.json');
let storeLocations = {};
try {
    if (fs.existsSync(storeLocationsPath)) {
        storeLocations = JSON.parse(fs.readFileSync(storeLocationsPath, 'utf8'));
    }
}
catch (error) {
    console.warn('Não foi possível carregar o catálogo de localidades:', error);
}
function getStoreLocation(loja, phoneNumber) {
    const normalizedNumber = String(phoneNumber || '').replace(/\D/g, '');
    const numberPrefix = normalizedNumber.length > 2
        ? normalizedNumber.slice(0, -2)
        : '';
    return storeLocations[String(loja || '')] || storeLocations[numberPrefix] || null;
}
// Mapeo de sectores
const SECTOR_MAP = {
    '00': 'Recepção',
    '01': 'Frente de Caixa',
    '04': 'Gerência',
    '13': 'Estoque',
    '14': 'RM',
    '18': 'Prevenção',
    '19': 'Prevenção',
    '20': 'RH',
    '50': 'E-commerce',
    '80': 'Televendas',
    '81': 'Televendas'
};
function parseNumber(number) {
    if (!number || number.length < 3) {
        return { loja: 'Desconhecida', sector: 'Desconhecido', sectorName: 'Desconhecido' };
    }
    const numStr = number.toString();
    const sectorCode = numStr.slice(-2);
    const lojaPart = numStr.slice(0, -2);
    let loja = lojaPart;
    if (lojaPart.length > 3) {
        loja = 'Desconhecida';
    }
    else if (lojaPart === '99') {
        loja = 'CD';
    }
    else if (lojaPart === '984') {
        loja = 'CD & CD2';
    }
    else if (lojaPart === '981') {
        loja = 'ADM 95';
    }
    else if (lojaPart === '982') {
        loja = 'ADM 96';
    }
    let sector = sectorCode;
    let sectorName = SECTOR_MAP[sectorCode] || 'Setor Desconhecido';
    if (['00', '01', '04'].includes(sectorCode)) {
        sector = 'FRENTE_CAIXA';
        sectorName = 'Frente de Caixa';
    }
    else if (['80', '81'].includes(sectorCode)) {
        sector = 'TELEVENDAS';
        sectorName = 'Televendas';
    }
    else if (['18', '19'].includes(sectorCode)) {
        sector = 'PREVENCAO';
        sectorName = 'Prevenção';
    }
    else if (!SECTOR_MAP[sectorCode]) {
        sector = 'DESCONHECIDO';
    }
    return {
        loja: loja || 'Desconhecida',
        sector,
        sectorName: sectorName
    };
}
async function initDatabase() {
    const SQL = await (0, sql_js_1.default)();
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(fileBuffer);
    }
    else {
        db = new SQL.Database();
    }
    db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      machine_name TEXT,
      os_user TEXT,
      profile_path TEXT,
      last_seen DATETIME,
      last_sync_id INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      callId TEXT UNIQUE,
      agent_username TEXT NOT NULL,
      agent_full_name TEXT NOT NULL,
      number TEXT,
      name TEXT,
      type INTEGER,
      type_description TEXT,
      time INTEGER,
      formatted_time DATETIME,
      duration INTEGER,
      info TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_username, original_id)
    );
  `);
    try {
        db.run(`ALTER TABLE call_logs ADD COLUMN category TEXT;`);
    }
    catch (error) { }
    try {
        db.run(`ALTER TABLE call_logs ADD COLUMN loja TEXT;`);
    }
    catch (error) { }
    migrateExistingData();
    saveDatabase();
}
function migrateExistingData() {
    try {
        console.log('🔄 Corrigiendo clasificación de registros existentes...');
        // Corregir type_description
        db.run(`
      UPDATE call_logs 
      SET type_description = CASE 
        WHEN type = 0 THEN 'Saliente'
        WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 'Entrante Atendida'
        WHEN type = 1 AND CAST(duration AS INTEGER) = 0 THEN 'Entrante Não Atendida'
        WHEN type = 2 THEN 'Entrante Não Atendida'
        ELSE type_description
      END
      WHERE type IN (0, 1, 2)
    `);
        // Corregir category
        db.run(`
      UPDATE call_logs 
      SET category = CASE 
        WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 'SALIENTE_ATENDIDA'
        WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 'SALIENTE_NAO_ATENDIDA'
        WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 'ENTRANTE_ATENDIDA'
        WHEN (type = 1 AND CAST(duration AS INTEGER) = 0) OR type = 2 THEN 'ENTRANTE_NAO_ATENDIDA'
        ELSE 'OUTRO'
      END
      WHERE type IN (0, 1, 2)
    `);
        saveDatabase();
        console.log('✅ Migración completada');
    }
    catch (error) {
        console.error('❌ Error en migración:', error);
    }
}
function saveDatabase() {
    if (db) {
        const data = db.export();
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dbPath, Buffer.from(data));
    }
}
function sqlValue(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}
function buildCallsFilter(queryParams) {
    const { startDate, endDate, loja, sector } = queryParams;
    const rawUsers = queryParams.user ?? queryParams.users;
    const users = (Array.isArray(rawUsers) ? rawUsers : rawUsers ? [rawUsers] : [])
        .map(String)
        .filter(Boolean);
    const conditions = ["number NOT LIKE '*%'", "number != '*'", 'number IS NOT NULL'];
    const lojaPrefixes = {
        'CD & CD2': '984',
        'ADM 95': '981',
        'ADM 96': '982',
        CD: '99'
    };
    if (startDate)
        conditions.push(`formatted_time >= ${sqlValue(`${startDate} 00:00:00`)}`);
    if (endDate)
        conditions.push(`formatted_time < date(${sqlValue(endDate)}, '+1 day')`);
    if (users.length === 1) {
        conditions.push(`agent_username = ${sqlValue(users[0])}`);
    }
    else if (users.length > 1) {
        conditions.push(`agent_username IN (${users.map(sqlValue).join(', ')})`);
    }
    if (loja) {
        const lojaPrefix = lojaPrefixes[String(loja)] || String(loja);
        conditions.push(`number LIKE ${sqlValue(`${lojaPrefix}%`)}`);
    }
    if (sector) {
        const sectorCodes = {
            FRENTE_CAIXA: ['00', '01', '04'],
            TELEVENDAS: ['80', '81'],
            PREVENCAO: ['18', '19']
        };
        if (String(sector) === 'DESCONHECIDO') {
            const knownCodes = Object.keys(SECTOR_MAP);
            conditions.push(`NOT (${knownCodes.map(code => `number LIKE ${sqlValue(`%${code}`)}`).join(' OR ')})`);
        }
        else {
            const codes = sectorCodes[String(sector)] || [String(sector)];
            conditions.push(`(${codes.map(code => `number LIKE ${sqlValue(`%${code}`)}`).join(' OR ')})`);
        }
    }
    return conditions.join(' AND ');
}
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.static(path.join(__dirname, '../public')));
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Recibir logs batch
app.post('/api/logs/batch', (req, res) => {
    const { agentInfo, changes, lastSyncId } = req.body;
    if (!agentInfo || !Array.isArray(changes)) {
        return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    try {
        if (!db)
            return res.status(500).json({ success: false, error: 'No database' });
        const stmt = db.prepare(`
      INSERT OR IGNORE INTO call_logs 
        (original_id, callId, agent_username, agent_full_name, 
         number, name, type, type_description, time, 
         formatted_time, duration, info, category, loja)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        let stored = 0;
        changes.forEach((log) => {
            const typeNum = Number(log.type);
            const durationNum = Number(log.duration);
            let typeDescription = '';
            switch (typeNum) {
                case 0:
                    typeDescription = 'Saliente';
                    break;
                case 1:
                    typeDescription = durationNum > 0 ? 'Entrante Atendida' : 'Entrante Não Atendida';
                    break;
                case 2:
                    typeDescription = 'Entrante Não Atendida';
                    break;
                default: typeDescription = log.type_description || 'Desconhecido';
            }
            let category = 'OUTRO';
            if (typeNum === 0 && durationNum > 0)
                category = 'SALIENTE_ATENDIDA';
            else if (typeNum === 0 && durationNum === 0)
                category = 'SALIENTE_NAO_ATENDIDA';
            else if (typeNum === 1 && durationNum > 0)
                category = 'ENTRANTE_ATENDIDA';
            else if ((typeNum === 1 && durationNum === 0) || typeNum === 2)
                category = 'ENTRANTE_NAO_ATENDIDA';
            const parsed = parseNumber(log.number || '');
            const loja = parsed.loja;
            stmt.run([
                log.id,
                log.callId,
                agentInfo.username,
                agentInfo.fullName,
                log.number || '',
                log.name || '',
                typeNum,
                typeDescription,
                log.time || 0,
                log.formatted_time || '',
                durationNum,
                log.info || '',
                category,
                loja
            ]);
            if (db.getRowsModified() > 0)
                stored++;
        });
        stmt.free();
        db.run(`
      INSERT OR REPLACE INTO agents 
        (username, full_name, machine_name, os_user, profile_path, last_seen, last_sync_id)
      VALUES 
        (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `, [
            agentInfo.username,
            agentInfo.fullName,
            agentInfo.machineName || '',
            agentInfo.osUser || '',
            agentInfo.profilePath || '',
            lastSyncId || changes[changes.length - 1]?.id || 0
        ]);
        saveDatabase();
        console.log(`📊 Stored ${stored} logs from ${agentInfo.fullName}`);
        io.emit('new-logs', { agentInfo, count: stored });
        res.json({ success: true, stored });
    }
    catch (error) {
        console.error('Failed to store logs:', error);
        res.status(500).json({ success: false, error: 'Storage failed' });
    }
});
// Obtener estadísticas
app.get('/api/stats', (req, res) => {
    try {
        if (!db)
            return res.json({ overall: { total_calls: 0, entrantes_atendidas: 0, entrantes_nao_atendidas: 0, salientes_atendidas: 0, salientes_nao_atendidas: 0, avg_duration: 0 }, agents: [], hourlyCalls: [] });
        const filter = buildCallsFilter(req.query);
        const overallResult = db.exec(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as entrantes_atendidas,
        SUM(CASE WHEN (type = 2) OR (type = 1 AND CAST(duration AS INTEGER) = 0) THEN 1 ELSE 0 END) as entrantes_nao_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as salientes_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 1 ELSE 0 END) as salientes_nao_atendidas,
        ROUND(AVG(CASE WHEN CAST(duration AS INTEGER) > 0 THEN CAST(duration AS INTEGER) ELSE NULL END), 2) as avg_duration
      FROM call_logs
      WHERE ${filter}
    `);
        const agentsResult = db.exec(`
      SELECT 
        agent_username,
        agent_full_name,
        COUNT(*) as total_calls,
        SUM(CASE WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as entrantes_atendidas,
        SUM(CASE WHEN (type = 2) OR (type = 1 AND CAST(duration AS INTEGER) = 0) THEN 1 ELSE 0 END) as entrantes_nao_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as salientes_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 1 ELSE 0 END) as salientes_nao_atendidas,
        ROUND(AVG(CASE WHEN CAST(duration AS INTEGER) > 0 THEN CAST(duration AS INTEGER) ELSE NULL END), 2) as avg_duration
      FROM call_logs
      WHERE ${filter}
      GROUP BY agent_username, agent_full_name
      ORDER BY total_calls DESC
    `);
        const overall = overallResult.length > 0 ? overallResult[0].values[0] : [0, 0, 0, 0, 0, 0];
        const agents = agentsResult.length > 0 ?
            agentsResult[0].values.map((row) => ({
                agent_username: row[0],
                agent_full_name: row[1],
                total_calls: row[2] || 0,
                entrantes_atendidas: row[3] || 0,
                entrantes_nao_atendidas: row[4] || 0,
                salientes_atendidas: row[5] || 0,
                salientes_nao_atendidas: row[6] || 0,
                avg_duration: row[7] || 0
            })) : [];
        res.json({
            overall: {
                total_calls: overall[0] || 0,
                entrantes_atendidas: overall[1] || 0,
                entrantes_nao_atendidas: overall[2] || 0,
                salientes_atendidas: overall[3] || 0,
                salientes_nao_atendidas: overall[4] || 0,
                avg_duration: overall[5] || 0
            },
            agents
        });
    }
    catch (error) {
        console.error('Failed to get stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});
// Stats by loja
app.get('/api/stats/by-loja', (req, res) => {
    try {
        if (!db)
            return res.json([]);
        const filter = buildCallsFilter(req.query);
        const result = db.exec(`
      SELECT 
        loja,
        COUNT(*) as total_calls,
        SUM(CASE WHEN type = 1 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as entrantes_atendidas,
        SUM(CASE WHEN (type = 2) OR (type = 1 AND CAST(duration AS INTEGER) = 0) THEN 1 ELSE 0 END) as entrantes_nao_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) > 0 THEN 1 ELSE 0 END) as salientes_atendidas,
        SUM(CASE WHEN type = 0 AND CAST(duration AS INTEGER) = 0 THEN 1 ELSE 0 END) as salientes_nao_atendidas
      FROM call_logs
      WHERE ${filter} AND loja IS NOT NULL AND loja != 'Desconhecida'
      GROUP BY loja
      ORDER BY total_calls DESC
    `);
        const lojas = result.length > 0 ?
            result[0].values.map((row) => {
                const location = getStoreLocation(row[0], '');
                return {
                    loja: row[0],
                    cidade: location?.cidade || '',
                    bairro: location?.bairro || '',
                    total_calls: row[1] || 0,
                    entrantes_atendidas: row[2] || 0,
                    entrantes_nao_atendidas: row[3] || 0,
                    salientes_atendidas: row[4] || 0,
                    salientes_nao_atendidas: row[5] || 0
                };
            }) : [];
        res.json(lojas);
    }
    catch (error) {
        console.error('Failed to get loja stats:', error);
        res.status(500).json({ error: 'Failed to get loja stats' });
    }
});
// Filters
app.get('/api/filters', (req, res) => {
    try {
        if (!db)
            return res.json({ users: [], lojas: [], sectors: [] });
        const usersResult = db.exec(`SELECT DISTINCT agent_username, agent_full_name FROM call_logs ORDER BY agent_full_name`);
        const users = usersResult.length > 0 ? usersResult[0].values.map((row) => ({
            username: row[0],
            full_name: row[1]
        })) : [];
        const lojasResult = db.exec(`SELECT DISTINCT loja FROM call_logs WHERE loja IS NOT NULL AND loja != '' AND loja != 'Desconhecida' ORDER BY loja`);
        const lojas = lojasResult.length > 0 ? lojasResult[0].values.map((row) => row[0]) : [];
        res.json({
            users,
            lojas,
            sectors: Object.entries(SECTOR_MAP).map(([code, name]) => ({ code, name }))
        });
    }
    catch (error) {
        res.json({ users: [], lojas: [], sectors: [] });
    }
});
// Calls list
app.get('/api/calls', (req, res) => {
    try {
        if (!db)
            return res.json([]);
        // Reutiliza exatamente os mesmos filtros das estatísticas, inclusive
        // data, múltiplos agentes, loja e setor.
        const filter = buildCallsFilter(req.query);
        const result = db.exec(`SELECT * FROM call_logs WHERE ${filter} ORDER BY formatted_time DESC`);
        const calls = result.length > 0 ? result[0].values.map((row) => {
            const parsedNumber = parseNumber(row[5]);
            const location = getStoreLocation(row[15] || parsedNumber.loja, row[5]);
            return {
                id: row[0],
                original_id: row[1],
                callId: row[2],
                agent_username: row[3],
                agent_full_name: row[4],
                number: row[5],
                name: row[6],
                type: row[7],
                type_description: row[8],
                time: row[9],
                formatted_time: row[10],
                duration: row[11],
                info: row[12],
                synced_at: row[13],
                category: row[14] || '',
                loja: row[15] || parsedNumber.loja || 'Desconhecida',
                sector: parsedNumber.sector || '',
                sector_name: parsedNumber.sectorName || '',
                location_city: location?.cidade || '',
                location_neighborhood: location?.bairro || ''
            };
        }) : [];
        res.json(calls);
    }
    catch (error) {
        res.json([]);
    }
});
// Agents list
app.get('/api/agents', (req, res) => {
    try {
        if (!db)
            return res.json([]);
        const result = db.exec('SELECT * FROM agents ORDER BY full_name');
        const agents = result.length > 0 ?
            result[0].values.map((row) => ({
                username: row[1],
                full_name: row[2],
                machine_name: row[3],
                os_user: row[4],
                profile_path: row[5],
                last_seen: row[6],
                last_sync_id: row[7]
            })) : [];
        res.json(agents);
    }
    catch (error) {
        res.json([]);
    }
});
// Sync status
app.get('/api/sync/status/:username', (req, res) => {
    try {
        if (!db)
            return res.json({ lastSyncId: 0 });
        const result = db.exec(`SELECT last_sync_id FROM agents WHERE username = '${req.params.username}'`);
        const lastSyncId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
        res.json({ lastSyncId });
    }
    catch (error) {
        res.json({ lastSyncId: 0 });
    }
});
// Socket.io
io.on('connection', (socket) => {
    const agentInfo = socket.handshake.auth?.agentInfo;
    if (agentInfo?.username) {
        console.log(`🔌 Agent connected: ${agentInfo.fullName} (${agentInfo.username})`);
        socket.on('disconnect', () => {
            console.log(`❌ Agent disconnected: ${agentInfo.fullName}`);
        });
        socket.on('logs-synced', (data) => {
            console.log(`📊 ${data.agentInfo.fullName} synced ${data.count} logs`);
            io.emit('new-logs', data);
        });
    }
});
const PORT = 3001;
initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('='.repeat(60));
        console.log(`🚀 Servidor en http://0.0.0.0:${PORT}`);
        console.log(`📊 Accede desde: http://10.25.96.58:${PORT}`);
        console.log('='.repeat(60));
    });
});
//# sourceMappingURL=index.js.map