/*
  Servidor local do Sistema de Agendamento para Barbearia.

  O navegador nao consegue gravar diretamente em um arquivo SQLite. Por isso,
  este servidor Node faz a ponte entre a interface web e o banco:
  - entrega os arquivos estaticos do app;
  - cria o arquivo data/barbearia.sqlite;
  - oferece a rota GET /api/state para carregar os dados;
  - oferece a rota PUT /api/state para salvar os dados.

  Para executar localmente:
  1. abra o terminal nesta pasta;
  2. rode: npm start
  3. acesse: http://localhost:3000
*/

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const databasePath = path.join(dataDir, "barbearia.sqlite");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Payload muito grande."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function handleStateGet(response) {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get("main");
  if (!row) {
    sendJson(response, 404, { message: "Banco SQLite ainda nao possui estado salvo." });
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(row.value);
}

async function handleStatePut(request, response) {
  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const serialized = JSON.stringify(parsed);
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run("main", serialized);
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 400, { ok: false, message: error.message });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Arquivo nao encontrado.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.url === "/api/health") {
    sendJson(response, 200, { ok: true, database: databasePath });
    return;
  }

  if (request.url === "/api/state" && request.method === "GET") {
    handleStateGet(response);
    return;
  }

  if (request.url === "/api/state" && request.method === "PUT") {
    await handleStatePut(request, response);
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Sistema rodando em http://localhost:${PORT}`);
  console.log(`Banco SQLite: ${databasePath}`);
});
