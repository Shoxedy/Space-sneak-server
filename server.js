const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 10000);
const MAX_PLAYERS = 26;
const rooms = new Map();

function cleanCode(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = '';
    for (let i = 0; i < 6; i++) {
      c += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(c));
  return c;
}

function newPeer() {
  return crypto.randomBytes(6).toString('hex');
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(room, obj, except) {
  for (const p of room.players.values()) {
    if (p.ws !== except) send(p.ws, obj);
  }
}

function snapshot(room) {
  return [...room.players.values()].map(p => ({
    peer: p.peer,
    kind: 'viewer',
    host: p.peer === room.host,
    presence: p.presence || {
      n: p.name || 'Player'
    }
  }));
}

function leave(ws) {
  const room = ws._ssRoom;
  if (!room) return;

  const peer = ws._ssPeer;

  room.players.delete(peer);

  ws._ssRoom = null;
  ws._ssPeer = null;

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.host === peer) {
    room.host = room.players.keys().next().value;
  }

  broadcast(room, {
    type: 'snapshot',
    players: snapshot(room),
    code: room.code
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {
      'content-type': 'application/json'
    });

    res.end(JSON.stringify({
      ok: true,
      service: 'Space Sneak multiplayer',
      rooms: rooms.size
    }));

    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocket.Server({
  server,
  path: '/ws'
});

wss.on('connection', ws => {

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', raw => {

    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {

      if (ws._ssRoom) {
        leave(ws);
      }

      const code =
        cleanCode(msg.code) || newCode();

      let room = rooms.get(code);

      if (!room) {
        room = {
          code,
          host: null,
          players: new Map()
        };

        rooms.set(code, room);
      }

      if (room.players.size >= MAX_PLAYERS) {
        send(ws, {
          type: 'error',
          message: 'Room is full.'
        });

        return;
      }

      const peer = newPeer();

      const name =
        String(msg.name || 'Player').slice(0, 12);

      room.players.set(peer, {
        ws,
        peer,
        name,
        presence: {
          n: name
        }
      });

      if (!room.host) {
        room.host = peer;
      }

      ws._ssRoom = room;
      ws._ssPeer = peer;

      send(ws, {
        type: 'welcome',
        peer,
        code: room.code,
        host: peer === room.host,
        players: snapshot(room)
      });

      broadcast(room, {
        type: 'snapshot',
        players: snapshot(room),
        code: room.code
      }, ws);

      return;
    }

    const room = ws._ssRoom;
    const peer = ws._ssPeer;

    if (!room || !peer) return;

    if (msg.type === 'presence') {

      const p = room.players.get(peer);

      if (!p) return;

      if (
        msg.data &&
        typeof msg.data === 'object'
      ) {
        p.presence = {
          ...(p.presence || {}),
          ...msg.data
        };
      }

      broadcast(room, {
        type: 'presence',
        peer,
        presence: p.presence
      }, ws);

      return;
    }

    if (msg.type === 'start') {

      if (peer !== room.host) return;

      broadcast(room, {
        type: 'start',
        data: msg.data
      });

      return;
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

const timer = setInterval(() => {

  for (const ws of wss.clients) {

    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }

}, 30000);

server.on('close', () => {
  clearInterval(timer);
});

server.listen(
  PORT,
  '0.0.0.0',
  () => console.log(
    `Space Sneak server listening on ${PORT}`
  )
);
