# MicroSIP Call Log Sync

Sistema centralizado para capturar llamadas de múltiples estaciones con MicroSIP, normalizarlas y visualizarlas en un dashboard en tiempo real.

## Componentes

- Agent: recopila los registros locales de MicroSIP y los sincroniza al servidor.
- Server: expone API REST y eventos WebSocket para centralizar la información.
- Dashboard: muestra KPIs, filtros y registros por agente, loja y sector.

## Estructura relevante

- `agent/`: cliente que se ejecuta en cada máquina.
- `server/`: backend central con SQLite y API.
- `dashboard/`: aplicación React/Vite para la UI.
- `data/`: base de datos y catálogo de locales.

## Inicio rápido

```bash
npm install
npm run build-all
npm run start
```

Esto levanta el servidor, el agente y el dashboard local.

## Documentación

- [ARQUITECTURA.md](ARQUITECTURA.md): visión general de flujos, APIs y estructura.

## Notas

- El dashboard está pensado para uso local/red local, con Puerto 3001.
- El servidor mantiene un histórico central en SQLite.
- Los artefactos compilados y los scripts de mantenimiento antiguos se mantienen fuera del flujo principal para evitar ruido y duplicados.
