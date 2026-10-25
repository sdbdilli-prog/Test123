const { WebSocketServer, WebSocket } = require('ws');

// Use the PORT provided by hosting services (Render/Fly.io) or default to 3000 locally
const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: PORT });

let targetSocket = null;
let controllerSocket = null;

console.log(`WebSocket relay server starting on port ${PORT}...`);

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            // 1. Handshake / Registration Phase
            if (data.type === 'REGISTER_TARGET') {
                targetSocket = ws;
                console.log('Target Device registered.');
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'TARGET' }));
                return;
            }

            if (data.type === 'REGISTER_CONTROLLER') {
                controllerSocket = ws;
                console.log('Controller Device registered.');
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'CONTROLLER' }));
                return;
            }

            // 2. Command Routing (Controller -> Target)
            if (ws === controllerSocket) {
                if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                    console.log('Routing command from Controller to Target:', data.action || data.type);
                    targetSocket.send(JSON.stringify(data));
                } else {
                    console.log('Error: Target device is not connected.');
                    ws.send(JSON.stringify({ error: 'Target device is offline.' }));
                }
            }

            // 3. Response Routing (Target -> Controller)
            else if (ws === targetSocket) {
                if (controllerSocket && controllerSocket.readyState === WebSocket.OPEN) {
                    console.log('Routing response from Target to Controller:', data.action || data.type);
                    controllerSocket.send(JSON.stringify(data));
                } else {
                    console.log('Warning: Controller is not connected to receive response.');
                }
            }

        } catch (err) {
            console.error('Failed to parse incoming message:', err.message);
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

    ws.on('error', (err) => {
        console.error('WebSocket connection error:', err);
    });
});
