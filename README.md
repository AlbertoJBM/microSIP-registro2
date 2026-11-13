# MicroSIP Call Log Sync

Sistema para coletar chamadas do MicroSIP em várias estações, armazenar os registros em SQLite e consultá-los no dashboard. O servidor e o agente são programas Go. O dashboard continua sendo React, TypeScript e JavaScript.

## Produção no Windows 11

### O que precisa ser instalado

O servidor de produção e os computadores dos agentes **não precisam ter Go instalado** quando recebem os executáveis compilados. O Go é necessário somente na máquina usada para compilar o servidor e o agente. Node.js/npm também só são necessários nessa máquina para compilar o dashboard.

Para compilar a partir do código-fonte, use uma máquina Windows 11 x64 com:

- Go 1.22 ou superior, instalado pelo instalador oficial em [go.dev/dl](https://go.dev/dl/).
- Node.js LTS e npm, disponíveis em [nodejs.org](https://nodejs.org/), para compilar o dashboard.
- Acesso à internet durante a primeira compilação para baixar dependências Go e npm.

Depois de instalar Go, abra um novo PowerShell e confirme:

```powershell
go version
```

### 1. Obter e preparar o projeto

Na máquina de build, clone ou extraia o projeto completo. Abra o PowerShell na pasta raiz do projeto, onde estão `server`, `agent` e `dashboard`:

```powershell
cd C:\Projetos\microSIP-registro2
```

Não compile somente o servidor se também precisar atualizar o dashboard. O executável Go serve os arquivos estáticos do dashboard, mas não os compila.

### 2. Compilar o dashboard

Este passo é necessário se o dashboard foi alterado ou se não há um build atualizado. Ele pode ser feito na máquina de build; não é necessário instalar Node.js no servidor de produção.

```powershell
npm --prefix dashboard ci
npm --prefix dashboard run build
```

O build será criado em `dashboard\dist`.

### 3. Compilar os executáveis Windows

Compile o servidor:

```powershell
powershell -ExecutionPolicy Bypass -File .\server\build-windows.ps1
```

O arquivo gerado é `server\serverMicroSIP.exe`. O script compila para Windows x64 com CGO desativado; o executável não precisa de Go instalado para funcionar.

Compile o agente:

```powershell
powershell -ExecutionPolicy Bypass -File .\agent\build.ps1
```

O arquivo gerado é `agent\MicroSIP-Agent.exe`. Para distribuir aos computadores dos usuários, também é necessário preparar o `agent.json` descrito na seção “Instalar os agentes”.

### 4. Montar a pasta de produção

Crie uma pasta na máquina central, por exemplo `C:\MicroSIP\`, mantendo esta estrutura:

```text
C:\MicroSIP\
├── server\
│   ├── serverMicroSIP.exe
│   └── data\
│       └── store-locations.json
└── dashboard\
    └── dist\
        ├── index.html
        └── assets\
```

Copie `server\serverMicroSIP.exe`, `server\data\store-locations.json` e toda a pasta `dashboard\dist` para os locais correspondentes. O servidor cria `server\data\central_logs.db` ao iniciar pela primeira vez.

Se estiver transferindo uma instalação que já possui histórico, pare o servidor e copie também o arquivo `central_logs.db` para `server\data`. Não substitua um banco de produção existente por um banco vazio. Faça um backup antes de atualizar executáveis ou dados.

O catálogo `store-locations.json` é necessário para carregar lojas e usar a rota diária. O dashboard também é necessário: o servidor procura primeiro `..\dashboard\dist`; quando essa pasta não existe, usa `server\public` como fallback.

### 5. Abrir o acesso na rede local

O servidor escuta na porta TCP `3001` em todas as interfaces de rede. Em PowerShell executado como Administrador, permita conexões apenas na rede local e no perfil privado do Windows:

```powershell
New-NetFirewallRule `
  -DisplayName "MicroSIP Server TCP 3001" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3001 `
  -Profile Private `
  -RemoteAddress LocalSubnet
```

Configure a rede da máquina central como **Privada**. Não exponha a porta diretamente à internet: o sistema não tem autenticação de usuários e a API aceita conexões da rede.

### 6. Iniciar e verificar o servidor

Na máquina central, execute:

```powershell
cd C:\MicroSIP\server
.\serverMicroSIP.exe
```

Também é possível iniciar `server\startServerMicroSIP.bat` com duplo clique. Mantenha o processo em execução. Para iniciar automaticamente com o Windows, crie uma tarefa no Agendador de Tarefas configurada para executar `C:\MicroSIP\server\serverMicroSIP.exe` na inicialização do computador e reiniciar a tarefa em caso de falha.

No próprio servidor, confirme o health check:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

A resposta deve conter `status: ok`. Em outro computador da rede, abra `http://IP_DO_SERVIDOR:3001` no navegador. Para descobrir o IP da máquina central, execute `ipconfig`.

### 7. Instalar os agentes

Em cada computador com MicroSIP, crie uma pasta, por exemplo `C:\MicroSIP-Agent\`, e copie para ela:

- `MicroSIP-Agent.exe` compilado na etapa 3.
- `agent.json` configurado com o endereço da máquina central.

Exemplo de `agent.json`:

```json
{
  "serverUrl": "http://IP_DO_SERVIDOR:3001",
  "pollSeconds": 10,
  "username": "",
  "fullName": "",
  "dbPath": ""
}
```

Com `username`, `fullName` e `dbPath` vazios, o agente tenta identificar o usuário do Windows e usa o caminho padrão do banco do MicroSIP. Se o MicroSIP estiver instalado em outro local, informe o caminho completo de `call_log.db` em `dbPath`. O agente cria `pending.json` e `agent.log` ao lado do executável; cada computador deve ter sua própria pasta e seus próprios arquivos.

Execute `MicroSIP-Agent.exe` e confirme no log a conexão com o servidor. Para iniciar o agente automaticamente após o login, crie um atalho para o executável na pasta de inicialização do usuário (`shell:startup`). Não é necessário instalar Go nos computadores dos agentes.

### 8. Atualizações e backup

Antes de atualizar, pare o servidor e copie `server\data\central_logs.db` para um local de backup. Atualize o executável e, quando houver mudança visual, substitua `dashboard\dist` pelo novo build. Preserve o banco e o `store-locations.json`. Depois inicie novamente e valide `/health` e o dashboard.

## Servidor de teste

O servidor usa a porta `3001` fixa no código. Para testar sem alterar a produção, use outra máquina Windows ou uma máquina virtual e mantenha banco, catálogo e agentes de teste separados.

1. Prepare uma pasta de teste, por exemplo `C:\MicroSIP-Test\`, com `server\serverMicroSIP.exe`, `server\data\store-locations.json` e `dashboard\dist`, usando o mesmo layout da seção de produção.
2. Não copie o banco de produção. Na primeira inicialização, o servidor de teste cria um `central_logs.db` vazio próprio.
3. Libere TCP `3001` somente na rede de teste e inicie o executável de teste.
4. Verifique `http://localhost:3001/health` na máquina de teste e abra o dashboard pelo IP dessa máquina.
5. Instale o agente de teste em uma estação descartável ou numa VM e configure o `serverUrl` do `agent.json` para o IP do servidor de teste. Não aponte agentes de produção para o servidor de teste.

Para testar código alterado, compile os executáveis novamente na máquina de build e copie-os para a máquina/VM de teste. Os testes automatizados podem ser executados na máquina de build com Go instalado:

```powershell
cd C:\Projetos\microSIP-registro2\server
go test ./...

cd ..\agent
go test ./...
```

Não execute uma segunda instância na mesma máquina usando a mesma porta ou a mesma pasta `data`: ela conflita com o servidor em produção e pode misturar os bancos. Para testar localmente no mesmo computador, será necessário criar uma configuração de teste isolada e compilar o servidor com outra porta.

## Desenvolvimento

Para trabalhar no dashboard, instale suas dependências com `npm --prefix dashboard ci` e execute `npm --prefix dashboard run dev`. Para executar o servidor a partir do código, instale Go 1.22 ou superior e use `go run .` dentro de `server`. O agente pode ser executado com `go run .` dentro de `agent`.

## Componentes e dados

- `server/`: servidor Go, migrações SQLite, catálogo e arquivos de runtime.
- `server/data/central_logs.db`: histórico de chamadas e dados da rota diária.
- `server/data/store-locations.json`: catálogo de lojas/localidades.
- `agent/`: agente Go, configuração, estado pendente e executável Windows.
- `dashboard/`: frontend React, TypeScript e Vite.

O sistema deve ser usado em rede confiável. A aplicação não autentica usuários e não deve ser publicada diretamente na internet.
