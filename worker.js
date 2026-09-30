const TABLE = "portal_state";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function getState(db) {
  await ensureTable(db);

  const row = await db
    .prepare(`SELECT state FROM ${TABLE} WHERE id = 1`)
    .first();

  if (!row) {
    return {
      overrides: {},
      addedItems: [],
      deletedIds: []
    };
  }

  try {
    return JSON.parse(row.state);
  } catch {
    return {
      overrides: {},
      addedItems: [],
      deletedIds: []
    };
  }
}

async function saveState(db, state) {
  await ensureTable(db);

  await db.prepare(`
    INSERT INTO ${TABLE} (id, state, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state = excluded.state,
      updated_at = excluded.updated_at
  `)
  .bind(
    JSON.stringify(state),
    new Date().toISOString()
  )
  .run();

  return state;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // API DO D1
    if (url.pathname === "/api/state") {

      if (!env.DB) {
        return json({
          error: "Binding D1 'DB' não está configurado."
        }, 500);
      }

      try {

        // SINCRONIZAR
        if (request.method === "GET") {
          const state = await getState(env.DB);
          return json(state);
        }

        // SALVAR
        if (request.method === "PUT") {
          const state = await request.json();
          const saved = await saveState(env.DB, state);

          return json({
            ok: true,
            ...saved
          });
        }

        return json({
          error: "Método não permitido."
        }, 405);

      } catch (error) {

        console.error(error);

        return json({
          error: "Erro ao acessar o D1.",
          detail: error?.message || String(error)
        }, 500);
      }
    }

    // Tudo que não for API continua sendo servido pelo HTML
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};
