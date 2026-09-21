# Banco SQLite

O projeto agora possui uma camada de banco em **SQLite** para uso local.

## Como funciona

O navegador nao grava diretamente em um arquivo `.sqlite`. Por isso, foi criado um servidor Node em `server.js`.

Esse servidor faz duas coisas:

- entrega os arquivos do sistema no navegador;
- cria e atualiza o banco `data/barbearia.sqlite`.

## Como rodar

Abra o terminal dentro da pasta do projeto e execute:

```bash
npm start
```

Ou, se o PowerShell bloquear o `npm`, execute:

```bash
npm.cmd start
```

Depois acesse:

```text
http://localhost:3000
```

## Arquivo do banco

O banco e criado automaticamente em:

```text
data/barbearia.sqlite
```

Dentro dele existe a tabela:

```sql
app_state
```

Essa tabela guarda o estado principal do sistema, incluindo:

- configuracoes;
- clientes;
- profissionais;
- servicos;
- agendamentos.

## Rotas da API

### Verificar servidor

```text
GET /api/health
```

### Carregar dados do SQLite

```text
GET /api/state
```

### Salvar dados no SQLite

```text
PUT /api/state
```

## Fallback

Se o app for aberto sem o servidor Node, ele continua funcionando com `localStorage`.

Isso permite que a versao hospedada na Vercel continue abrindo normalmente. Porem, para usar **SQLite de verdade**, e necessario rodar o app pelo servidor local:

```text
http://localhost:3000
```

## Observacao sobre Vercel

SQLite e um banco baseado em arquivo. Em hospedagens serverless como a Vercel, esse arquivo nao deve ser usado como banco persistente principal.

Para producao online, as opcoes corretas seriam:

- usar um servidor proprio com SQLite;
- usar uma VPS;
- usar Turso/libSQL;
- trocar para um banco online como PostgreSQL.
