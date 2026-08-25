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
const chokidar_1 = __importDefault(require("chokidar"));
const axios_1 = __importDefault(require("axios"));
const socket_io_client_1 = require("socket.io-client");
const sql_js_1 = __importDefault(require("sql.js"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class MicroSIPAgent {
    constructor() {
        this.lastSyncId = 0;
        this.isSyncing = false;
        this.watcher = null;
        this.syncInterval = null;
        const userProfile = os.homedir();
        const username = path.basename(userProfile);
        this.agentInfo = {
            username: username,
            fullName: this.formatFullName(username),
            machineName: os.hostname(),
            osUser: os.userInfo().username,
            profilePath: userProfile
        };
        this.dbPath = path.join(userProfile, 'AppData', 'Roaming', 'MicroSIP', 'call_log.db');
        console.log('='.repeat(50));
        console.log(`👤 Agente: ${this.agentInfo.fullName} (${this.agentInfo.username})`);
        console.log(`💻 Máquina: ${this.agentInfo.machineName}`);
        console.log(`📁 Base de datos: ${this.dbPath}`);
        console.log('='.repeat(50));
        this.serverUrl = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
        this.socket = (0, socket_io_client_1.io)(this.serverUrl, {
            auth: { agentInfo: this.agentInfo },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });
        this.socket.on('connect', () => {
            console.log('✅ Conectado al servidor');
            this.syncInitialData();
        });
        this.socket.on('disconnect', (reason) => {
            console.log(`❌ Desconectado del servidor: ${reason}`);
        });
        this.socket.on('connect_error', (error) => {
            console.error(`Error de conexión: ${error.message}`);
        });
        this.setupWatcher();
        this.syncInterval = setInterval(() => this.syncChanges(), 10000);
    }
    formatFullName(username) {
        if (username.includes('.') || username.includes('-') || username.includes('_')) {
            return username
                .split(/[.\-_]/)
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(' ');
        }
        return username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
    }
    setupWatcher() {
        if (!fs.existsSync(this.dbPath)) {
            console.error(`❌ Archivo no encontrado: ${this.dbPath}`);
            console.log('💡 Ejecuta "npm run setup" para crear la base de datos de prueba');
            return;
        }
        console.log(`👀 Monitoreando cambios en: ${this.dbPath}`);
        this.watcher = chokidar_1.default.watch(this.dbPath, {
            persistent: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 500
            }
        });
        this.watcher.on('change', () => {
            console.log('📝 Cambio detectado en la base de datos');
            setTimeout(() => this.syncChanges(), 3000);
        });
        this.watcher.on('error', (error) => {
            console.error('Error en watcher:', error);
        });
    }
    async syncInitialData() {
        try {
            const response = await axios_1.default.get(`${this.serverUrl}/api/sync/status/${encodeURIComponent(this.agentInfo.username)}`);
            this.lastSyncId = response.data.lastSyncId || 0;
            console.log(`📊 Último ID sincronizado: ${this.lastSyncId}`);
            await this.syncChanges();
        }
        catch (error) {
            console.error('Error en sincronización inicial:', error.message);
        }
    }
    async syncChanges() {
        if (this.isSyncing)
            return;
        this.isSyncing = true;
        try {
            let changes;
            do {
                changes = await this.readChanges();
                if (changes.length === 0)
                    break;
                console.log(`📤 Enviando ${changes.length} registros...`);
                const response = await axios_1.default.post(`${this.serverUrl}/api/logs/batch`, {
                    agentInfo: this.agentInfo,
                    changes: changes,
                    lastSyncId: changes[changes.length - 1].id
                });
                if (response.data.success) {
                    this.lastSyncId = changes[changes.length - 1].id;
                    console.log(`✅ ${response.data.stored} registros sincronizados`);
                }
                else {
                    break;
                }
            } while (changes.length === 1000);
        }
        catch (error) {
            console.error('Error en sincronización:', error.message);
        }
        finally {
            this.isSyncing = false;
        }
    }
    async readChanges() {
        if (!fs.existsSync(this.dbPath))
            return [];
        let tempPath = null;
        try {
            // === OPCIÓN 1: Copiar archivo a temporal para lectura consistente ===
            tempPath = path.join(os.tmpdir(), `microsip_temp_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
            fs.copyFileSync(this.dbPath, tempPath);
            // Esperar un poco para asegurar que la copia se completó
            await new Promise(resolve => setTimeout(resolve, 500));
            const SQL = await (0, sql_js_1.default)({
                locateFile: (file) => process.pkg
                    ? path.join(path.dirname(process.execPath), file)
                    : path.join(__dirname, '../node_modules/sql.js/dist', file)
            });
            const fileBuffer = fs.readFileSync(tempPath);
            const db = new SQL.Database(fileBuffer);
            // === OPCIÓN 3: Filtrar solo llamadas finalizadas ===
            // Solo leer registros que ya tienen duración calculada (info indica llamada terminada)
            const result = db.exec(`
        SELECT 
          id,
          callId,
          number,
          name,
          type,
          time,
          duration,
          info,
          CASE type
            WHEN 1 THEN 'Recebida'
            WHEN 2 THEN 'Realizada'
            WHEN 3 THEN 'Perdida'
            ELSE 'Outra'
          END as type_description,
          datetime(time, 'unixepoch', 'localtime') as formatted_time
        FROM call_log 
        WHERE id > ${this.lastSyncId}
          AND (
            info LIKE '%encerrada%' 
            OR info LIKE '%Chamada%' 
            OR info LIKE '%CANCEL%'
            OR info LIKE '%NO ANSWER%'
            OR info LIKE '%FAILED%'
          )
        ORDER BY id ASC
        LIMIT 1000
      `);
            db.close();
            // === Limpiar archivo temporal ===
            if (tempPath && fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                }
                catch (e) {
                    console.warn('⚠️ No se pudo eliminar archivo temporal:', tempPath);
                }
            }
            if (result.length === 0)
                return [];
            const columns = result[0].columns;
            const values = result[0].values;
            return values.map((row) => {
                const obj = {};
                columns.forEach((col, index) => {
                    obj[col] = row[index];
                });
                return obj;
            });
        }
        catch (error) {
            console.error('❌ Error leyendo base de datos:', error.message);
            // === Limpieza de emergencia ===
            if (tempPath && fs.existsSync(tempPath)) {
                try {
                    fs.unlinkSync(tempPath);
                }
                catch (e) {
                    // Ignorar
                }
            }
            return [];
        }
    }
}
process.on('SIGINT', () => {
    console.log('\n👋 Cerrando agente...');
    process.exit(0);
});
const agent = new MicroSIPAgent();
//# sourceMappingURL=index.js.map