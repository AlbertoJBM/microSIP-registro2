import chokidar from 'chokidar';
import axios from 'axios';
import { io } from 'socket.io-client';
import initSqlJs from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import dotenv from 'dotenv';


dotenv.config();


class MicroSIPAgent {
  private dbPath: string;
  private serverUrl: string;
  private agentInfo: any;
  private socket: any;
  private lastSyncId: number = 0;
  private isSyncing: boolean = false;
  private watcher: chokidar.FSWatcher | null = null;
  private syncInterval: NodeJS.Timeout | null = null;


  constructor() {
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
    this.socket = io(this.serverUrl, {
      auth: { agentInfo: this.agentInfo },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });


    this.socket.on('connect', () => {
      console.log('✅ Conectado al servidor');
      this.syncInitialData();
    });


    this.socket.on('disconnect', (reason: string) => {
      console.log(`❌ Desconectado del servidor: ${reason}`);
    });


    this.socket.on('connect_error', (error: any) => {
      console.error(`Error de conexión: ${error.message}`);
    });


    this.setupWatcher();
    this.syncInterval = setInterval(() => this.syncChanges(), 10000);
  }


  private formatFullName(username: string): string {
    if (username.includes('.') || username.includes('-') || username.includes('_')) {
      return username
        .split(/[.\-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }
    return username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
  }


  private setupWatcher(): void {
    if (!fs.existsSync(this.dbPath)) {
      console.error(`❌ Archivo no encontrado: ${this.dbPath}`);
      console.log('💡 Ejecuta "npm run setup" para crear la base de datos de prueba');
      return;
    }


    console.log(`👀 Monitoreando cambios en: ${this.dbPath}`);


    this.watcher = chokidar.watch(this.dbPath, {
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


    this.watcher.on('error', (error: any) => {
      console.error('Error en watcher:', error);
    });
  }


  private async syncInitialData(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.serverUrl}/api/sync/status/${encodeURIComponent(this.agentInfo.username)}`
      );
      this.lastSyncId = response.data.lastSyncId || 0;
      console.log(`📊 Último ID sincronizado: ${this.lastSyncId}`);
      await this.syncChanges();
    } catch (error: any) {
      console.error('Error en sincronización inicial:', error.message);
    }
  }


  private async syncChanges(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;


    try {
      let changes: any[];
      do {
        changes = await this.readChanges();


        if (changes.length === 0) break;


        console.log(`📤 Enviando ${changes.length} registros...`);


        const response = await axios.post(`${this.serverUrl}/api/logs/batch`, {
          agentInfo: this.agentInfo,
          changes: changes,
          lastSyncId: changes[changes.length - 1].id
        });


        if (response.data.success) {
          this.lastSyncId = changes[changes.length - 1].id;
          console.log(`✅ ${response.data.stored} registros sincronizados`);
        } else {
          break;
        }
      } while (changes.length === 1000);
    } catch (error: any) {
      console.error('Error en sincronización:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }


  private async readChanges(): Promise<any[]> {
    if (!fs.existsSync(this.dbPath)) return [];

    let tempPath: string | null = null;

    try {
      // === OPCIÓN 1: Copiar archivo a temporal para lectura consistente ===
      tempPath = path.join(os.tmpdir(), `microsip_temp_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
      fs.copyFileSync(this.dbPath, tempPath);

      // Esperar un poco para asegurar que la copia se completó
      await new Promise(resolve => setTimeout(resolve, 500));

      const SQL = await initSqlJs({
        locateFile: (file: string) => (process as NodeJS.Process & { pkg?: boolean }).pkg
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
        } catch (e) {
          console.warn('⚠️ No se pudo eliminar archivo temporal:', tempPath);
        }
      }
      
      if (result.length === 0) return [];
      
      const columns = result[0].columns;
      const values = result[0].values;
      
      return values.map((row: any) => {
        const obj: any = {};
        columns.forEach((col: string, index: number) => {
          obj[col] = row[index];
        });
        return obj;
      });

    } catch (error: any) {
      console.error('❌ Error leyendo base de datos:', error.message);
      
      // === Limpieza de emergencia ===
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
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