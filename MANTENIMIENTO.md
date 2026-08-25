# GUÍA DE MANTENIMIENTO - Tech Lead

Para personas que herede este código en 10 años.

## 🎯 ¿Qué hace cada cosa?

### `server/src/index.ts` (El Corazón)

**3 funciones principales:**

1. **`POST /api/logs/batch`** - Recibe llamadas de agentes
   - Guarda en SQLite
   - Emite WebSocket `new-logs` al dashboard
   
2. **`GET /api/stats`** - Retorna números agregados
   - Filtra por fecha, usuario, loja, sector
   - Agrupa por agente y por hora
   
3. **Sirve `/` → Dashboard** - HTML + JS compilado

**Funciones helper:**
- `parseNumber()` - Extrae loja/sector del teléfono
- `normalizeCallType()` - Estandariza tipos de llamadas
- `saveDatabase()` - Persiste SQLite a disco

### `agent/src/index.ts` (El Recolector)

**Ciclo cada 5 segundos:**
1. Lee `MicroSIP/call_log.db` local
2. Compara con `lastSyncId` guardado
3. Si hay nuevas → `POST /api/logs/batch` al servidor

**Variables clave:**
- `os.homedir()` - Path del usuario local (automático)
- `SERVER_URL` - Conexión al servidor (desde `.env`)
- `lastSyncId` - ID de última llamada sincronizada

### `dashboard/src/Dashboard.tsx` (La Interfaz)

**Escucha WebSocket:**
- Evento `new-logs` → recarga datos automáticamente
- Cada 30 segundos → auto-refresh con filtros guardados

**Componentes principales:**
- `fetchDashboardData()` - Obtiene `/api/stats`
- `fetchFilteredCalls()` - Obtiene `/api/calls` (tabla)
- `filterParamsRef` - Mantiene filtros entre actualizaciones

## 🐛 Debugging

### El servidor no recibe datos del agente
```bash
# 1. Verifica salud
curl http://10.25.96.58:3001/health
# Debe responder: {"status":"ok",...}

# 2. Verifica agentes activos
curl http://10.25.96.58:3001/api/agents
# Debe listar agentes conectados

# 3. Revisa logs del server
# Busca: "Sincronizadas X llamadas"
```

### El dashboard no carga datos
```bash
# 1. Abre Developer Tools (F12) → Console
# 2. Busca errores de CORS o conexión
# 3. Verifica que SERVER_URL sea correcto

# Si muestra: "Cannot read property 'values' of undefined"
# → Significa que la BD está vacía, espera datos de agentes
```

### El agente no conecta
```bash
# 1. En agent, abre node_modules/ y verifica socket.io-client
# 2. En .env, verifica: SERVER_URL=http://10.25.96.58:3001
# 3. En Windows: netsh advfirewall firewall show rule name="MicroSIP"
#    Debe estar ALLOW, puerto 3001
```

## 📦 Estructura Simple

```
IMPORTANTE = Lo que DEBE existir para funcionar

├── server/src/index.ts       ← IMPORTANTE: Servidor central
├── agent/src/index.ts        ← IMPORTANTE: Agente
├── dashboard/src/Dashboard.tsx ← IMPORTANTE: Dashboard
│
├── server/data/central_logs.db ← IMPORTANTE: BD (creada automáticamente)
├── agent/.env                ← IMPORTANTE: SERVER_URL
│
├── package.json              ← IMPORTANTE: Dependencias
├── npm run build-all         ← IMPORTANTE: Compilar todo
│
└── MENOS IMPORTANTE:
    ├── tsconfig.json         (compilación TypeScript)
    ├── vite.config.ts        (bundler React)
    ├── docker-compose.yml    (nunca se usó)
    ├── sql.txt               (notas viejas, ignorar)
    └── test/                 (vacío, ignorar)
```

## 🔧 Cambios Futuros - Guía

### Si necesitas agregar una nueva métrica
1. Agrega SQL en `server/src/index.ts` → `GET /api/stats`
2. Actualiza Dashboard → `fetchDashboardData()` → agregar gráfica
3. Recompila: `npm run build-all`

### Si necesitas cambiar clasificación (SECTOR_MAP)
1. Edita `SECTOR_MAP` en `server/src/index.ts`
2. Edita misma lógica en `agent/src/index.ts` 
3. Recompila: `npm run build-all`
4. **Nota**: Datos antiguos NO se reclasifican (conservan original)

### Si necesitas agregar filtro nuevo
1. Agrega parámetro en `GET /api/calls` (server)
2. Agrega opción en `GET /api/filters` (server)
3. Agrega input en Dashboard.tsx
4. Actualiza `fetchFilteredCalls()` para usar nuevo parámetro

## 🚨 Problemas Comunes

| Problema | Causa | Solución |
|----------|-------|----------|
| Dashboard vacío | No hay datos | Inicia agente primero |
| "Cannot reach server" | Firewall | `netsh advfirewall firewall add rule name="MicroSIP Call Log Server" dir=in action=allow protocol=TCP localport=3001` |
| Agente no inicia | Node no instalado | Instala Node.js LTS |
| Base de datos corrupta | Crash durante escritura | Elimina `server/data/central_logs.db`, reinicia |
| Datos desaparecen | No se guardó a disco | Verifica `saveDatabase()` se llama |

## ✅ Checklist Antes de Usar en Producción

- [ ] Todos los agentes tienen `.env` con IP correcta
- [ ] Puerto 3001 abierto en firewall
- [ ] MicroSIP instalado en todas las máquinas
- [ ] `npm run build-all` compila sin errores
- [ ] Dashboard carga en `http://10.25.96.58:3001`
- [ ] Agente se conecta (ver log: "Agente conectado:")
- [ ] Primera llamada aparece en dashboard en 10 segundos

## 📊 Base de Datos - Consultas Útiles

```sql
-- Ver último sincronizado
SELECT username, last_sync_id, last_seen FROM agents;

-- Ver total de llamadas por agente
SELECT agent_username, COUNT(*) FROM call_logs GROUP BY agent_username;

-- Ver llamadas hoy
SELECT * FROM call_logs 
WHERE DATE(formatted_time) = DATE('now');

-- Exportar CSV
.mode csv
.output llamadas.csv
SELECT * FROM call_logs;

-- Ver tamaño de BD
SELECT page_count * page_size / 1024 / 1024 AS "Size (MB)" 
FROM pragma_page_count(), pragma_page_size();
```

## 🔒 Seguridad

⚠️ **ACTUAL**: No hay autenticación
- Cualquiera con IP + puerto puede conectar
- Datos se transmiten sin encriptación

**Para usar en producción**, agregar:
1. JWT token en agentes
2. HTTPS/WSS en servidor
3. Validar origen en CORS

## 📞 Contacto Futuro

Si algo no funciona en 2034:
1. Verifica que Node.js sigue siendo Node.js
2. Verifica que Socket.IO versión sigue compatible
3. Verifica que SQLite no desapareció (spoiler: no)
4. Si todo falla: recompila `npm run build-all`

---

**Escrito por**: Tech Leader con 10+ años | **Año**: 2026
