# Space Sneak multiplayer server

This is the realtime server for the Space Sneak browser game.

## Render

1. Put the `server` folder in a GitHub repository (the repository can contain only this folder's files).
2. On Render, choose **New → Web Service** and connect that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Use the free plan if available on your account.
6. After deploy, copy the service URL, for example `https://space-sneak-server.onrender.com`.
7. The game connects to the WebSocket endpoint automatically as `wss://YOUR-URL/ws`.

The `/health` endpoint should show `{ "ok": true, ... }` when the server is running.
