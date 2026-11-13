# reedmeGO

El server y el dashboard siguen igual (Node). El agente ahora es un solo programa en Go. En las PCs de los colegas no hace falta Node ni Go: solo Windows 11 y dos archivos.

El agente solo hace tres cosas:

1. Lee `call_log.db` de MicroSIP en esa PC.
2. Manda las llamadas ya terminadas a `POST /api/logs/batch`.
3. Se anuncia por WebSocket para que el dashboard cuente "Agentes conectados".

Loja, sector, tipo de llamada y las graficas las calcula el server. El agente no las toca.

## 1. Compilar el exe (solo en tu PC)

Go ya esta en esta maquina (`go1.25.1`). Si en otra PC de desarrollo no esta:

1. Abre https://go.dev/dl/
2. Baja el instalador **Windows, amd64**.
3. Instala y cierra y vuelve a abrir PowerShell.
4. Comprueba con `go version`.

Compilar:

1. Abre PowerShell.
2. Entra a la carpeta del agente:

```powershell
cd "C:\Users\zerat\OneDrive\Documentos\Projeto Registro call\microSIP-registro2\agent"
```

3. Compila:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

4. Tiene que aparecer `agent\MicroSIP-Agent.exe` (unos 10 MB).

Ese comando equivale a:

```powershell
$env:CGO_ENABLED = '0'
go build -ldflags='-s -w' -o MicroSIP-Agent.exe .
```

`CGO_ENABLED=0` es importante: el exe no pide Visual C++ ni ninguna DLL extra.

## 2. Que copiar a cada colega

Crea una carpeta, por ejemplo `C:\MicroSIP-Agent`, y copia adentro solo esto:

- `MicroSIP-Agent.exe`
- `agent.json` (tiene que estar al lado del exe, con ese nombre)

No copies `node_modules`, el server ni el dashboard.

`agent.json` de ejemplo:

```json
{
  "serverUrl": "http://10.25.96.58:3001",
  "pollSeconds": 10,
  "username": "",
  "fullName": "",
  "dbPath": ""
}
```

- `serverUrl`: el server central. Si la IP cambia, se edita aqui y se reinicia el exe.
- `pollSeconds`: cada cuantos segundos revisa llamadas nuevas. Minimo 2. Vacio o 0 usa 10.
- `username` y `fullName`: vacios. El agente usa la carpeta del usuario de Windows (`alberto.morales` queda como "Alberto Morales"). Llenalos solo si la cuenta de Windows no es la persona real.
- `dbPath`: vacio. Busca `%APPDATA%\MicroSIP\call_log.db`. Llenalo solo si MicroSIP guarda el archivo en otro sitio.

Tambien acepta la variable de entorno `SERVER_URL`. Si existe, pisa el valor de `agent.json`.

## 3. En cada PC con Windows 11

1. Si esa PC todavia corre el agente viejo de Node, apagalo para no tener dos:

```powershell
pm2 delete agenteMicroSIP
```

Si `pm2` no existe, no habia agente viejo. Sigue.

2. Pega la carpeta en un camino fijo, por ejemplo `C:\MicroSIP-Agent`.
3. Abre `agent.json` con el Bloc de notas y confirma `serverUrl`.
4. Doble clic en `MicroSIP-Agent.exe`.
5. Si Windows SmartScreen dice que protegio el equipo: **Mas informacion** y despues **Ejecutar de todas formas**. El exe no esta firmado.
6. Deja esa ventana abierta. Si la cierras, deja de sincronizar.
7. La ventana tiene que decir la persona, la maquina, la ruta del `.db` y `Presencia conectada`. Cuando hay llamadas nuevas: `Enviados N registros`.
8. El mismo texto queda en `agent.log`, al lado del exe.

MicroSIP tiene que haberse abierto al menos una vez con ese usuario de Windows. El archivo esperado es:

`C:\Users\<usuario>\AppData\Roaming\MicroSIP\call_log.db`

El agente tiene que correr con la misma cuenta que usa MicroSIP. No lo pongas como tarea de la cuenta SYSTEM.

## 4. Que arranque al iniciar sesion

1. Pulsa `Win + R`.
2. Escribe `shell:startup` y Enter.
3. Clic derecho dentro de esa carpeta, **Nuevo**, **Acceso directo**.
4. Ruta del exe, por ejemplo `C:\MicroSIP-Agent\MicroSIP-Agent.exe`.
5. La proxima vez que esa persona inicie sesion, el agente abre solo.

No hace falta abrir un puerto en la PC del colega. Solo tiene que poder salir por la red hacia `10.25.96.58` puerto `3001`. El firewall del server es el que tiene que tener el `3001` abierto.

## 5. Servidor y dashboard

En la maquina central, como siempre:

```powershell
cd "C:\Users\zerat\OneDrive\Documentos\Projeto Registro call\microSIP-registro2"
powershell -ExecutionPolicy Bypass -File server\build-windows.ps1
server\startServerMicroSIP.bat
```

El dashboard se abre en `http://10.25.96.58:3001`.

Para probar el agente en tu propia PC, con Go instalado y el server encendido:

```powershell
cd "C:\Users\zerat\OneDrive\Documentos\Projeto Registro call\microSIP-registro2\agent"
go run .
```

## 6. Como saber que funciona

- En la ventana del agente: `Presencia conectada`.
- En el dashboard: sube el numero de **Agentes conectados**.
- Despues de una llamada terminada en MicroSIP, en unos 10 segundos el agente escribe `Enviados ...` y la llamada aparece en el dashboard.
- Si el server esta apagado, el agente no se cierra: espera y reintenta. No hace falta abrirlo de nuevo cuando el server vuelva.

## 7. Que se envia y que no

Se envian las columnas crudas de MicroSIP: id, callId, numero, nombre, type, time, duration, info y la hora local. El server arma `type_description`, categoria, loja y sector.

Solo sube una llamada cuando `info` contiene `encerrada`, `Chamada`, `CANCEL`, `NO ANSWER` o `FAILED`. Si hay una llamada todavia abierta, el agente espera y no se salta las que vienen despues. Asi una llamada que termina mas tarde no se pierde.

La primera vez que un usuario conecta, el server tiene cursor `0` y el agente manda el historico que cumpla ese filtro, de a 1000.
