# Distribuicao do agente MicroSIP

## 1. Iniciar o servidor central

Na sua maquina:

```cmd
cd /d "C:\Users\alberto.morales\Documents\Projecto call\call-log-sync"
npm run start
```

O servidor continua na sua maquina na porta `3001`. Descubra o IPv4 com:

```cmd
ipconfig
```

Use o IPv4 da rede local, por exemplo `192.168.1.50`.

## 2. Liberar a porta no firewall

Abra o CMD como administrador na maquina central:

```cmd
netsh advfirewall firewall add rule name="MicroSIP Call Log Server" dir=in action=allow protocol=TCP localport=3001
```

Teste a partir do computador de um colega:

```text
http://IP_DA_MAQUINA_CENTRAL:3001/health
```

O resultado esperado e um JSON com `status: ok`.

## 3. Distribuir o agente

Na raiz do projeto, execute:

```cmd
npm run build-agent-exe
```

O agente compilado fica em `agent/dist/index.js`. Para uma distribuicao simples, entregue ao colega a pasta `agent` contendo:

- `dist/index.js`
- `dist/sql-wasm.wasm`
- `node_modules`
- `iniciar-agente.cmd`
- `package.json`
- `package-lock.json`

O arquivo `sql-wasm.wasm` deve permanecer dentro de `dist`.

## 4. Configurar cada colega

Na pasta do agente, copie `.env.distribuicao` para `.env` e altere o endereco:

```env
SERVER_URL=http://IP_DA_MAQUINA_CENTRAL:3001
```

Nao use `localhost`, pois isso apontaria para o computador do proprio colega.

## 5. Iniciar o agente

No computador do colega, confirme que o MicroSIP esta instalado e que existe:

```text
%USERPROFILE%\AppData\Roaming\MicroSIP\call_log.db
```

Depois, clique duas vezes em `iniciar-agente.cmd`. Essa alternativa requer Node.js instalado no computador do colega.

## 6. Executavel EXE opcional

O comando `npm run build-agent-exe` tenta gerar `agent/dist/microsip-agent.exe`, incluindo o runtime Node.js. No ambiente atual, o empacotador nao encontrou binario pre-compilado e tentou compilar o runtime; essa etapa falhou porque o utilitario `patch` nao esta disponivel no PATH. Portanto, o EXE ainda nao foi gerado e nao deve ser distribuido como pronto.

Para gerar o EXE em outra maquina, instale as ferramentas de compilacao do Node.js, o Git/Patch e execute novamente:

```cmd
npm run build-agent-exe
```

O EXE precisa ser entregue junto com `dist/sql-wasm.wasm` e `.env`.

## Operacao diaria

1. Mantenha `npm run start` rodando na maquina central.
2. Inicie o agente em cada computador dos colegas.
3. Abra o dashboard central em `http://localhost:5173`.
4. Se o IP da maquina central mudar, atualize o `.env` de cada agente.

O servidor e o banco central permanecem somente na sua maquina. O agente envia registros novos em lotes e monitora a base local do MicroSIP.
