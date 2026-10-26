const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

let targetSocket = null;
let controllerSocket = null;

// Live Status Dashboard Route (Visit your Render URL in a browser to see this)
app.get('/', (req, res) => {
    const targetStatus = targetSocket && targetSocket.readyState === WebSocket.OPEN ? '🟢 ONLINE' : '🔴 OFFLINE';
    const controllerStatus = controllerSocket && controllerSocket.readyState === WebSocket.OPEN ? '🟢 ONLINE' : '🔴 OFFLINE';
    
    res.send(`
        <html>
            <head><title>Relay Status</title></head>
            <body style="font-family: Arial; padding: 20px;">
                <h2>WebSocket Relay Server Status</h2>
                <p>Server: <b>Active</b></p>
                <p>Target App: <b>${targetStatus}</b></p>
                <p>Controller App: <b>${controllerStatus}</b></p>
                <p><small>Refresh this page to update status.</small></p>
            </body>
        </html>
    `);
});

// Create HTTP server from Express app
const server = http.createServer(app);

// Attach WebSocket server to the same HTTP server
const wss = new WebSocketServer({ server });

console.log(`WebSocket relay server initializing...`);

wss.on('connection', (ws) => {
    console.log('New client connected via WebSocket');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'REGISTER_TARGET') {
                targetSocket = ws;
                console.log('Target Device registered successfully.');
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'TARGET' }));
                return;
            }

            if (data.type === 'REGISTER_CONTROLLER') {
                controllerSocket = ws;
                console.log('Controller Device registered successfully.');
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'CONTROLLER' }));
                return;
            }

            // Route Controller -> Target
            if (ws === controllerSocket) {
                if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                    console.log('Routing command to Target:', data.action || data.type);
                    targetSocket.send(JSON.stringify(data));
                } else {
                    ws.send(JSON.stringify({ error: 'Target device is offline.' }));
                }
            }
            // Route Target -> Controller
            else if (ws === targetSocket) {
                if (controllerSocket && controllerSocket.readyState === WebSocket.OPEN) {
                    console.log('Routing response to Controller:', data.action || data.type);
                    controllerSocket.send(JSON.stringify(data));
                }
            }
        } catch (err) {
            console.error('Message parsing error:', err.message);
        }
    });

    ws.on('close', () => {
        if (ws === targetSocket) {
            console.log('Target Device disconnected.');
            targetSocket = null;
        } else if (ws === controllerSocket) {
            console.log('Controller Device disconnected.');
            controllerSocket = null;
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});
