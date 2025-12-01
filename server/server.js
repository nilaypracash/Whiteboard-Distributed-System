// server/server.js
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { applyUpdate } = require('yjs');
const nano = require('nano');
const fetch = require('node-fetch');

const APP_PORT = process.env.PORT || 8080;
const COUCHDB_LOCAL = process.env.COUCHDB_LOCAL || 'http://couchdb-0.couchdb:5984';
const DB_PREFIX = process.env.DB_PREFIX || 'wb_';

const couch = nano(COUCHDB_LOCAL);
const docs = new Map(); // roomId -> { ydoc, db, conns:Set(ws) }

const app = express();

// serve static frontend (index.html + main.js)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.send('ok'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function ensureDB(room) {
  const dbName = `${DB_PREFIX}${room}`;
  return couch.db.get(dbName).catch(err => {
    if (err.statusCode === 404) {
      return couch.db.create(dbName);
    }
    throw err;
  }).then(() => couch.db.use(dbName));
}

async function loadStateFromDB(db) {
  try {
    const all = await db.list({ include_docs: true });
    all.rows.sort((a, b) => {
      const ta = a.doc && a.doc.timestamp ? a.doc.timestamp : 0;
      const tb = b.doc && b.doc.timestamp ? b.doc.timestamp : 0;
      return ta - tb;
    });
    const doc = new Y.Doc();
    for (const r of all.rows) {
      const d = r.doc;
      if (d && d.update_b64) {
        const u = Buffer.from(d.update_b64, 'base64');
        applyUpdate(doc, u);
      }
    }
    return doc;
  } catch (e) {
    console.error('loadStateFromDB error', e);
    return new Y.Doc();
  }
}

async function setupRoom(room) {
  if (docs.has(room)) return docs.get(room);
  const db = await ensureDB(room);
  const ydoc = await loadStateFromDB(db);
  const entry = { ydoc, db, conns: new Set() };
  docs.set(room, entry);

  // Persist local updates to CouchDB
  ydoc.on('update', async (update) => {
    try {
      const update_b64 = Buffer.from(update).toString('base64');
      const doc = { update_b64, timestamp: Date.now() };
      await db.insert(doc);
    } catch (e) {
      console.error('Error writing update to couch', e);
    }
  });

  // poll _changes to bring in replicated updates
  let lastSeq = null;
  async function pollChanges() {
    try {
      const since = lastSeq ? `since=${encodeURIComponent(lastSeq)}` : 'since=0';
      const url = `${COUCHDB_LOCAL}/${db.config.db}/_changes?${since}&include_docs=true&limit=100`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.last_seq) lastSeq = json.last_seq;
      if (json.results && json.results.length) {
        for (const r of json.results) {
          const d = r.doc;
          if (d && d.update_b64) {
            const u = Buffer.from(d.update_b64, 'base64');
            try { applyUpdate(ydoc, u); } catch {}
            for (const ws of entry.conns) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'yjs-update', update: d.update_b64 }));
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore transient errors
    } finally {
      setTimeout(pollChanges, 1000);
    }
  }
  pollChanges();

  return entry;
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = url.searchParams.get('room') || 'default';
  const entry = await setupRoom(room);
  entry.conns.add(ws);

  const state = Y.encodeStateAsUpdate(entry.ydoc);
  const b64 = Buffer.from(state).toString('base64');
  ws.send(JSON.stringify({ type: 'sync-step-1', update: b64 }));

  ws.on('message', async (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    if (data.type === 'yjs-update') {
      const updateBuf = Buffer.from(data.update, 'base64');
      try { applyUpdate(entry.ydoc, updateBuf); } catch {}
      try {
        await entry.db.insert({ update_b64: data.update, timestamp: Date.now() });
      } catch (e) {
        console.error('persist error', e);
      }
      for (const client of entry.conns) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'yjs-update', update: data.update }));
        }
      }
    }
  });

  ws.on('close', () => entry.conns.delete(ws));
});

server.listen(APP_PORT, () => console.log('App server listening on', APP_PORT));
