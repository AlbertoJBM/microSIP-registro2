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
│ │ Agente (Go, un .exe)                             │   │
│ │ MicroSIP-Agent.exe                               │   │
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
| **Agent** | Go (un .exe) | Lee MicroSIP local, envía al servidor |
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

### Tabelas da rota: `route_days`, `route_day_stores`, `route_visits`, `route_tickets`, `route_audit`
Armazenam o roteiro salvo por dia e suas lojas, os atendimentos e chamados, os dados de validação (atendente da central, funcionário da loja e horário) e o histórico de alterações.

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

### APIs de Ruta Diaria
- `GET /api/route/stores`: catálogo de lojas de `server/data/store-locations.json`.
- `GET /api/route/days/:date`: roteiro salvo e lojas do dia.
- `POST /api/route/days/:date`: salva o roteiro inicial do dia.
- `POST /api/route/days/:date/stores`: adiciona uma loja ao roteiro salvo, registrando quem adicionou e o horário.
- `DELETE /api/route/days/:date/stores/:loja`: remove uma loja do roteiro.
- `GET /api/route/visits?date=YYYY-MM-DD`: atendimentos e chamados do dia.
- `POST /api/route/visits`: inicia um atendimento.
- `PATCH /api/route/visits/:id`: salva observações e horários ou conclui e valida o atendimento.
- `POST /api/route/visits/:id/validate`: valida um atendimento concluído após informar o atendente da central e o funcionário da loja.
- `POST /api/route/visits/:id/tickets`: adiciona um chamado individual.
- `GET /api/route/dashboard`: indicadores, atividade mensal e auditoria recente.

O planejamento estima distâncias entre centros urbanos locais e não substitui uma rota viária. Os nomes informados são registrados para auditoria; atualmente, a aplicação não autentica usuários.

## 💾 Archivos Importantes

```
call-log-sync/
├── server/
│   ├── src/index.ts       ← SERVIDOR CENTRAL (API + WebSocket)
│   └── dist/              ← Compilado
│
├── agent/
│   ├── main.go            ← AGENTE (lee MicroSIP local)
│   ├── agent.json         ← SERVER_URL=http://10.25.96.58:3001
│   └── MicroSIP-Agent.exe ← Ejecutable para colegas
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

# Correr agente (lee local). En las PCs de los colegas se usa MicroSIP-Agent.exe.
# Ver reedmeGO.md

# Dashboard se sirve automáticamente en http://localhost:3001
```

## 📝 Notas de Mantenimiento

- **Backup**: Copiar `server/data/central_logs.db` regularmente
- **Limpieza**: Las llamadas nunca se borran (histórico completo)
- **Performance**: Con 100,000 llamadas, aún rápido en SQLite
- **Red**: Requiere puerto 3001 abierto en firewall
- **Actualizar IP**: Si cambias IP, editar `agent.json` de todos los agentes y reiniciar el exe

---

**Versión**: 1.0.0 | **Fecha**: 2026-08-21
