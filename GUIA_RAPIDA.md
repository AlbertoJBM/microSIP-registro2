# 🚀 GUÍA RÁPIDA - SINCRONIZADOR MicroSIP

**Como Tech Leader: Esto es lo ÚNICO que necesitas entender en 5 minutos.**

---

## 🎯 ¿Qué Es?

Sistema que recolecta logs de llamadas de múltiples máquinas Windows (con MicroSIP) en **una base de datos central**, y las visualiza en un dashboard en tiempo real.

```
Máquinas Colegas (agentes) → Servidor Central → Dashboard Web
```

---

## ⚡ Quick Start (TU MÁQUINA)

### 1️⃣ Compilar Todo
```cmd
npm run build-all
```

### 2️⃣ Abrir Firewall (Una Sola Vez)
```powershell
netsh advfirewall firewall add rule name="MicroSIP" dir=in action=allow protocol=TCP localport=3001
```

### 3️⃣ Iniciar Servidor
```cmd
npm --prefix server run start
```

Ver:
```
🚀 SERVIDOR - Activo en puerto 3001
📊 Dashboard: http://10.25.96.58:3001
```

### 4️⃣ Acceder Dashboard
Desde tu navegador:
```
http://localhost:3001
```

O desde otra máquina:
```
http://10.25.96.58:3001
```

---

## 👥 Agregar Colega (SU MÁQUINA)

### 1️⃣ Dale la carpeta `agent/`
El colega solo necesita: `agent/`

### 2️⃣ Colega abre terminal en `agent/`
```cmd
npm install
npm run build
```

### 3️⃣ Colega crea `.env`
```env
SERVER_URL=http://10.25.96.58:3001
```

### 4️⃣ Colega inicia agente
```cmd
npm start
```

Ver en servidor:
```
🔌 Agente conectado: Colega Name
📊 Sincronizadas 50 llamadas
```

---

## 🔍 Debugging Rápido

### ❌ "El servidor no recibe datos"
```powershell
# Verifica salud
curl http://10.25.96.58:3001/health

# Debe responder: {"status":"ok"}
```

### ❌ "El dashboard está vacío"
- Espera 10 segundos (primer sync del agente)
- Verifica que agente dice: "Sincronizadas X llamadas"

### ❌ "El agente no conecta"
1. Verifica `.env` tiene IP correcta
2. Firewall: `netsh advfirewall firewall show rule name="MicroSIP"`
3. Verifica que MicroSIP está instalado (Windows)

---

## 📊 Qué Ves en Dashboard

| Gráfica | Significa |
|---------|-----------|
| **Barras** | Llamadas por agente |
| **Pie** | Recebida / Realizada / Perdida |
| **KPIs** | Total, Promedio duración, etc |
| **Tabla** | Todas las llamadas detalladas |
| **Línea Horaria** | Llamadas por hora del día |

---

## 🔧 Cambios Comunes

### Agregar nuevo sector
En `server/src/index.ts`, modificar `SECTOR_MAP`:
```typescript
const SECTOR_MAP: { [key: string]: string } = {
  '00': 'Recepção',
  '99': 'Mi Sector Nuevo',  // ← Agregar aquí
};
```
Luego: `npm run build-all`

### Ver datos en SQLite directamente
```cmd
sqlite3 server/data/central_logs.db
> SELECT * FROM call_logs LIMIT 10;
> .mode csv
> .output export.csv
> SELECT * FROM call_logs;
> .quit
```

### Limpiar base de datos (⚠️ Cuidado)
```cmd
# Elimina todos los datos
del server\data\central_logs.db

# Reinicia servidor (recreará BD vacía)
npm --prefix server run start
```

---

## 📁 Archivos Principales

| Archivo | Propósito |
|---------|-----------|
| `server/src/index.ts` | Servidor central + APIs |
| `agent/src/index.ts` | Lector MicroSIP local |
| `dashboard/src/Dashboard.tsx` | Interfaz web |
| `server/data/central_logs.db` | **Los datos** |
| `agent/.env` | Config del agente |

---

## ✅ Checklist Antes de Usar

- [ ] Todos compilaron sin error: `npm run build-all`
- [ ] Firewall abierto: `netsh advfirewall firewall show rule name="MicroSIP"`
- [ ] Servidor en http://localhost:3001 sin errores
- [ ] Agente se conectó (ver log del servidor)
- [ ] Primera llamada aparece en 10 seg
- [ ] Filtros funcionan (usuario, loja, sector)

---

## 🆘 SOS - No Funciona

**Paso 1**: Ver logs del servidor
```cmd
npm --prefix server run start
# Buscar: "Agente conectado" o errores
```

**Paso 2**: Conectar agente con logs
```cmd
npm --prefix agent run start
# Buscar: "Sincronizado", "Error"
```

**Paso 3**: Abrir Developer Tools (F12) en dashboard
```
Console → Buscar errores
Network → Ver requests a /api/stats
```

**Paso 4**: Si nada funciona
- Elimina `server/data/central_logs.db`
- Reinicia todo
- Espera 30 segundos

---

## 📞 Mantenimiento Básico

| Tarea | Comando |
|-------|---------|
| Backup BD | `cp server/data/central_logs.db backup_$(date).db` |
| Ver agentes activos | `curl http://10.25.96.58:3001/api/agents` |
| Ver estadísticas | `curl http://10.25.96.58:3001/api/stats` |
| Limpiar logs | `npm --prefix agent run build && npm --prefix server run build` |

---

## 🎓 Conceptos Clave (Para 10 Años Después)

**Socket.IO** = Conexión en tiempo real (agente → server → dashboard)
- Cuando agente sincroniza, emite evento `new-logs`
- Dashboard escucha y recarga automáticamente

**SQLite** = Base de datos local sin servidor externo
- Archivo único: `central_logs.db`
- Backup: copiar ese archivo
- No necesita MySQL, PostgreSQL, etc.

**parseNumber()** = Extrae loja/sector del número de teléfono
- Ejemplo: `0180` → loja `01`, sector `80` (Televendas)
- Permite agrupar y filtrar por ubicación

---

## 🚀 Próximas Mejoras (Futuro)

- [ ] Autenticación (no todos pueden ver datos)
- [ ] HTTPS/WSS (datos encriptados)
- [ ] Exportar PDF/Excel
- [ ] Notificaciones (cuando llamada perdida)
- [ ] Estadísticas por horario (picos de llamadas)
- [ ] Histórico: que se pueda ver cambios en tiempo real

---

**Última actualización**: 2026-08-21  
**Versión**: 1.0.0 (Estable)  
**Tech Lead**: "Este código va a funcionar en 2034, créeme"
