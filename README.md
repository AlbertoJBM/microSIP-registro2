# MicroSIP Call Log Sync

Sistema centralizado para capturar llamadas de múltiples estaciones con MicroSIP, normalizarlas y visualizarlas en un dashboard en tiempo real.

## Componentes

- Agent: programa en Go. En cada PC lee el registro local de MicroSIP y lo envia al servidor. El ejecutable para Windows 11 se explica en [reedmeGO.md](reedmeGO.md).
- Server: expone API REST y eventos WebSocket para centralizar la información.
- Dashboard: muestra KPIs, filtros y registros por agente, loja y sector.
- Rota diária: permite escolher o dia no calendário, selecionar lojas, salvar a rota e registrar atendimentos, chamados e auditoria.

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

- [reedmeGO.md](reedmeGO.md): compilar el agente y dejarlo como un exe para Windows 11.
- [ARQUITECTURA.md](ARQUITECTURA.md): visión general de flujos, APIs y estructura.

## Notas

- El dashboard está pensado para uso local/red local, con Puerto 3001.
- El servidor mantiene un histórico central en SQLite.
- A rota diária usa `server/data/store-locations.json` e salva os dados em `central_logs.db`. O roteiro do dia pode ser salvo; lojas incluídas depois exigem o nome de quem as adicionou e registram data e horário. Um atendimento pode ser finalizado diretamente ou ficar pendente para validação posterior; a validação registra nome, função, observações e data/hora. O ordenamento e as distâncias são estimados com base nos centros urbanos, não representam uma rota viária e não consideram o trânsito. O nome do responsável é informado no painel porque a aplicação ainda não possui autenticação.
- Los artefactos compilados y los scripts de mantenimiento antiguos se mantienen fuera del flujo principal para evitar ruido y duplicados.
