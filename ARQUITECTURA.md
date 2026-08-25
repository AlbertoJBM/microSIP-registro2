# SINCRONIZADOR DE LLAMADAS MicroSIP

## 📋 Arquitectura

Sistema centralizado que recolecta logs de llamadas de múltiples máquinas con MicroSIP instalado.

```
┌─────────────────────────────────────────────────────────┐
│ MACHINE A (Colega 1)                                    │
│ ┌──────────────────────────────────────────────────┐   │
│ │ MicroSIP                                         │   │
│ │ ~/.../AppData/Roaming/MicroSIP/call_log.db       │   │
│ └──────────┬───────────────────────────────────────┘   │
│            │                                            │
│            │ Agente lee cada 5 seg                      │
│ ┌──────────▼───────────────────────────────────────┐   │
│ │ Agente (Node.js)                                 │   │
│ │ node dist/index.js                               │   │
│ └──────────┬───────────────────────────────────────┘   │
│            │                                            │
└────────────┼────────────────────────────────────────────┘
             │
             │ POST /api/logs/batch (Socket.IO)
             │ Conecta a 10.25.96.58:3001
             │
┌────────────▼────────────────────────────────────────────┐
│ SERVIDOR CENTRAL (TU MACHINE)                           │
│ 10.25.96.58:3001                                        │
│                                                          │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Express + Socket.IO                              │   │
│ │ - Recibe datos de agentes                        │   │
│ │ - Guarda en BD central                           │   │
│ │ - Emite eventos en tiempo real                   │   │
│ └──────────┬───────────────────────────────────────┘   │
│            │                                            │
│ ┌──────────▼───────────────────────────────────────┐   │
│ │ SQLite (central_logs.db)                         │   │
│ │ - Tabla agents (quién conectó)                   │   │
│ │ - Tabla call_logs (todas las llamadas)           │   │
│ └──────────────────────────────────────────────────┘   │
│            │                                            │
│            │ Sirve HTML compilado + API REST           │
│ ┌──────────▼───────────────────────────────────────┐   │
│ │ Dashboard (React + Recharts)                     │   │
│ │ http://10.25.96.58:3001                          │   │
│ │ - Gráficas de llamadas                           │   │
│ │ - Filtros por usuario/loja/sector                │   │
│ │ - Actualización en tiempo real (WebSocket)       │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ MACHINE B, C, N... (Otros colegas)                      │
│ Igual a MACHINE A                                       │
└─────────────────────────────────────────────────────────┘
```

## 🔧 Stack Tecnológico

| Componente | Tecnología | Propósito |
|-----------|-----------|----------|
| **Agent** | Node.js + TypeScript | Lee MicroSIP local, envía al servidor |
| **Server** | Express + Socket.IO | Centraliza datos, sirve API |
| **Database** | SQLite | Almacena llamadas y agentes |
| **Dashboard** | React + Vite | UI en tiempo real |
| **Gráficas** | Recharts | Visualización de datos |

## 📊 Base de Datos

### Tabla: `agents`
```
id, username, full_name, machine_name, last_seen, last_sync_id
```
Registra qué máquinas/usuarios han sincronizado.

### Tabla: `call_logs`
```
id, original_id, callId, agent_username, agent_full_name,
number, name, type, type_description, time, formatted_time,
duration, info, synced_at
```
Almacena **todas las llamadas** de todos los agentes.

## 🔐 Clasificaciones

### Tipos de Llamada
- `1` = Recebida (entrante)
- `2` = Realizada (saliente)
- `3` = Perdida

### Sectores (agrupados por código)
- `FRENTE_CAIXA` → códigos: 00, 01, 04
- `TELEVENDAS` → códigos: 80, 81
- `PREVENCAO` → códigos: 18, 19
- `DESCONHECIDO` → otros

### Lojas (especiales)
- `99` → CD
- `984` → CD & CD2
- `981` → ADM 95
- `982` → ADM 96
- `001` → Loja 1 (normal)
- etc.

## 🚀 Flujo de Sincronización

1. **Agente (cada 5 segundos)**
   - Lee `call_log.db` local de MicroSIP
   - Compara con último `lastSyncId` conocido
   - Envía nuevas llamadas: `POST /api/logs/batch`

2. **Servidor**
   - Recibe batch del agente
   - Inserta en `call_logs` (ignora duplicados)
   - Actualiza timestamp en `agents`
   - **Emite evento WebSocket** `new-logs`

3. **Dashboard (WebSocket listener)**
   - Recibe evento `new-logs`
   - Recarga estadísticas
   - Recarga tabla de llamadas
   - Auto-refresh cada 30 segundos

## 🔍 APIs

### GET `/health`
Verifica que el servidor está activo.

### POST `/api/logs/batch`
Recibe batch de agente.
```json
{
  "agentInfo": {
    "username": "alberto.morales",
    "fullName": "Alberto Morales",
    "machineName": "LAPTOP-XYZ",
    "osUser": "alberto.morales",
    "profilePath": "C:\\Users\\alberto.morales"
  },
  "changes": [
    {
      "id": 123,
      "callId": "abc123",
      "number": "0180",
      "name": "João Silva",
      "type": 1,
      "type_description": "Entrante",
      "time": 1692374400,
      "formatted_time": "2023-08-18 10:20:00",
      "duration": 120,
      "info": ""
    }
  ],
  "lastSyncId": 122
}
```

### GET `/api/stats`
Retorna estadísticas globales.
**Parámetros opcionales**: `startDate`, `endDate`, `user`, `loja`, `sector`

### GET `/api/calls`
Retorna llamadas (máximo 1000).
**Parámetros opcionales**: `startDate`, `endDate`, `user`, `loja`, `sector`

### GET `/api/filters`
Retorna opciones disponibles para filtrar (usuarios, lojas, sectores).

### GET `/api/agents`
Retorna lista de agentes conectados.

## 💾 Archivos Importantes

```
call-log-sync/
├── server/
│   ├── src/index.ts       ← SERVIDOR CENTRAL (API + WebSocket)
│   └── dist/              ← Compilado
│
├── agent/
│   ├── src/index.ts       ← AGENTE (lee MicroSIP local)
│   ├── .env               ← SERVER_URL=http://10.25.96.58:3001
│   └── iniciar-agente.cmd ← Launcher para colegas
│
├── dashboard/
│   ├── src/Dashboard.tsx  ← DASHBOARD (React)
│   └── dist/              ← Compilado (servido por server)
│
└── data/
    └── central_logs.db    ← Base de datos (SQLite)
```

## 🛠️ Comandos

```bash
# Compilar todo
npm run build-all

# Correr servidor (puerto 3001)
npm --prefix server run start

# Correr agente (lee local)
npm --prefix agent run start

# Dashboard se sirve automáticamente en http://localhost:3001
```

## 📝 Notas de Mantenimiento

- **Backup**: Copiar `server/data/central_logs.db` regularmente
- **Limpieza**: Las llamadas nunca se borran (histórico completo)
- **Performance**: Con 100,000 llamadas, aún rápido en SQLite
- **Red**: Requiere puerto 3001 abierto en firewall
- **Actualizar IP**: Si cambias IP, actualizar `.env` de todos los agentes

---

**Versión**: 1.0.0 | **Fecha**: 2026-08-21
