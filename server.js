const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

let targets = new Set();
let controllers = new Set();

app.get('/', (req, res) => {
    const isOnline = targets.size > 0;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remote File Explorer - Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .toast {
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
    </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col">

    <!-- Header / Navbar -->
    <header class="bg-slate-800 border-b border-slate-700 sticky top-0 z-30 shadow-md">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <div class="p-2 bg-indigo-600 rounded-lg text-white">
                    <i class="fa-solid fa-folder-tree text-xl"></i>
                </div>
                <div>
                    <h1 class="font-bold text-lg leading-tight text-white">SyncBridge Remote Dashboard</h1>
                    <p class="text-xs text-slate-400">Android Target File Explorer Relay</p>
                </div>
            </div>
            
            <!-- Connection Badge -->
            <div id="statusBadge" class="flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${isOnline ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800' : 'bg-rose-950/80 text-rose-400 border-rose-800'}">
                <span id="statusPing" class="relative flex h-3 w-3">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
                </span>
                <span id="statusText">${isOnline ? '🟢 TARGET ONLINE' : '🔴 TARGET OFFLINE'}</span>
            </div>
        </div>
    </header>

    <!-- Main Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">

        <!-- Controls & Navigation Card -->
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-lg flex flex-col md:flex-row gap-4 justify-between items-center">
            
            <!-- Path Input Bar -->
            <div class="flex-1 w-full flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                <span class="px-3 text-slate-500">
                    <i class="fa-solid fa-hard-drive"></i>
                </span>
                <input type="text" id="pathInput" value="/sdcard/Download/" placeholder="e.g. /sdcard/Download/" 
                    class="w-full bg-transparent border-none text-slate-200 focus:outline-none py-2.5 px-1 text-sm font-mono"
                    onkeydown="if(event.key === 'Enter') listDirectory()">
                <button onclick="navigateUp()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border-l border-slate-700 flex items-center gap-1 transition-colors" title="Up Directory">
                    <i class="fa-solid fa-level-up-alt"></i> Up
                </button>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-3 w-full md:w-auto">
                <button onclick="listDirectory()" class="flex-1 md:flex-initial bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20">
                    <i class="fa-solid fa-arrows-rotate" id="refreshIcon"></i> List Files
                </button>
            </div>
        </div>

        <!-- Breadcrumb Row -->
        <div id="breadcrumbs" class="flex items-center gap-1 text-xs text-slate-400 px-1 overflow-x-auto whitespace-nowrap">
            <span class="text-slate-500">Location:</span>
            <span id="crumbContainer" class="font-mono flex items-center gap-1">/sdcard/Download/</span>
        </div>

        <!-- File Table Card -->
        <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl flex-1 flex flex-col">
            <div class="overflow-x-auto flex-1">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-800/80 border-b border-slate-700 text-slate-400 text-xs uppercase font-semibold tracking-wider">
                            <th class="py-3.5 px-4">Name</th>
                            <th class="py-3.5 px-4 hidden sm:table-cell">Type</th>
                            <th class="py-3.5 px-4 hidden md:table-cell">Size</th>
                            <th class="py-3.5 px-4 hidden lg:table-cell">Last Modified</th>
                            <th class="py-3.5 px-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody id="fileList" class="divide-y divide-slate-700/50 text-sm">
                        <tr>
                            <td colspan="5" class="py-12 text-center text-slate-500">
                                <i class="fa-solid fa-folder-open text-4xl mb-3 text-slate-600 block"></i>
                                Click <strong>List Files</strong> to view remote directory contents.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

    </main>

    <!-- Toast Notification Container -->
    <div id="toastContainer" class="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none"></div>

    <script>
        const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const ws = new WebSocket(wsProtocol + location.host);

        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const statusPing = document.getElementById('statusPing');
        const fileListEl = document.getElementById('fileList');
        const pathInput = document.getElementById('pathInput');
        const crumbContainer = document.getElementById('crumbContainer');
        const refreshIcon = document.getElementById('refreshIcon');

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'REGISTER_CONTROLLER' }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // 1. Target Connection Status Update
                if (data.status === 'TARGET_STATUS') {
                    updateStatusUI(data.online);
                }

                // 2. File List Handling
                if (data.action === 'FILE_LIST') {
                    refreshIcon.classList.remove('fa-spin');
                    renderFileList(data.files || []);
                }

                // 3. Binary File Download Payload
                if (data.action === 'FILE_DATA' || data.type === 'RESPONSE_FETCH_FILE' || data.type === 'FILE_DATA') {
                    handleFileDownload(data);
                }

            } catch (err) {
                console.error("Payload error:", err);
            }
        };

        function updateStatusUI(isOnline) {
            statusBadge.className = \`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-semibold border \${isOnline ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800' : 'bg-rose-950/80 text-rose-400 border-rose-800'}\`;
            statusText.innerText = isOnline ? '🟢 TARGET ONLINE' : '🔴 TARGET OFFLINE';
            statusPing.innerHTML = \`
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full \${isOnline ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 \${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
            \`;
        }

        function listDirectory() {
            let path = pathInput.value.trim();
            if (!path.endsWith('/')) path += '/';
            pathInput.value = path;
            
            updateBreadcrumbs(path);
            refreshIcon.classList.add('fa-spin');

            ws.send(JSON.stringify({ 
                action: 'LIST_FILES',
                type: 'LIST_FILES',
                command: 'LIST_FILES',
                path: path 
            }));
        }

        function navigateTo(folderName) {
            let currentPath = pathInput.value.trim();
            if (!currentPath.endsWith('/')) currentPath += '/';
            pathInput.value = currentPath + folderName + '/';
            listDirectory();
        }

        function navigateUp() {
            let parts = pathInput.value.trim().split('/').filter(Boolean);
            if (parts.length > 0) {
                parts.pop();
                pathInput.value = '/' + parts.join('/') + (parts.length > 0 ? '/' : '');
                listDirectory();
            }
        }

        function updateBreadcrumbs(path) {
            const parts = path.split('/').filter(Boolean);
            let accum = '/';
            let html = \`<span onclick="setPath('/')" class="cursor-pointer hover:text-indigo-400 underline">root</span>/\`;
            parts.forEach((p, idx) => {
                accum += p + '/';
                const targetPath = accum;
                html += \`<span onclick="setPath('\${targetPath}')" class="cursor-pointer hover:text-indigo-400 underline">\${p}</span>/\`;
            });
            crumbContainer.innerHTML = html;
        }

        function setPath(newPath) {
            pathInput.value = newPath;
            listDirectory();
        }

        function renderFileList(files) {
            fileListEl.innerHTML = '';

            if (!files || files.length === 0) {
                fileListEl.innerHTML = \`
                    <tr>
                        <td colspan="5" class="py-10 text-center text-slate-500">
                            No files or directories found in this path.
                        </td>
                    </tr>\`;
                return;
            }

            files.forEach(file => {
                const name = typeof file === 'string' ? file : file.name;
                const isDir = typeof file === 'object' ? file.isDirectory : !name.includes('.');
                const rawSize = typeof file === 'object' ? file.size : 0;
                const formattedSize = isDir ? '-' : formatBytes(rawSize);
                const modTime = typeof file === 'object' && file.lastModified ? new Date(file.lastModified).toLocaleString() : '-';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-700/40 transition-colors group border-b border-slate-700/50";

                tr.innerHTML = \`
                    <td class="py-3 px-4 flex items-center gap-3">
                        <i class="\${isDir ? 'fa-solid fa-folder text-amber-400' : 'fa-solid fa-file text-indigo-400'} text-lg"></i>
                        \${isDir 
                            ? \`<button onclick="navigateTo('\${name}')" class="font-medium text-slate-200 hover:text-indigo-400 text-left transition-colors">\${name}</button>\`
                            : \`<span class="font-medium text-slate-200">\${name}</span>\`
                        }
                    </td>
                    <td class="py-3 px-4 hidden sm:table-cell text-xs text-slate-400 font-mono">
                        \${isDir ? 'Directory' : 'File'}
                    </td>
                    <td class="py-3 px-4 hidden md:table-cell text-xs text-slate-400 font-mono">
                        \${formattedSize}
                    </td>
                    <td class="py-3 px-4 hidden lg:table-cell text-xs text-slate-400">
                        \${modTime}
                    </td>
                    <td class="py-3 px-4 text-right">
                        \${!isDir ? \`
                            <button onclick="requestFileDownload('\${name}')" class="bg-indigo-600/80 hover:bg-indigo-600 active:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ml-auto transition-all shadow-sm">
                                <i class="fa-solid fa-download"></i> Download
                            </button>
                        \` : \`
                            <button onclick="navigateTo('\${name}')" class="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ml-auto transition-all">
                                Open <i class="fa-solid fa-chevron-right text-[10px]"></i>
                            </button>
                        \`}
                    </td>
                \`;
                fileListEl.appendChild(tr);
            });
        }

        function requestFileDownload(fileName) {
            const basePath = pathInput.value.trim();
            const fullPath = basePath.endsWith('/') ? basePath + fileName : basePath + '/' + fileName;
            
            showToast(\`Downloading '\${fileName}'...\`, 'info');

            ws.send(JSON.stringify({ 
                action: 'FETCH_FILE',
                type: 'FETCH_FILE',
                command: 'FETCH_FILE',
                filePath: fullPath,
                path: fullPath
            }));
        }

        function handleFileDownload(data) {
            const fileName = data.fileName || data.name || 'downloaded_file';
            const base64Content = data.content || data.data || data.fileData;

            if (!base64Content) {
                showToast('Failed to receive file content from device.', 'error');
                return;
            }

            try {
                // Convert Base64 to Blob directly in browser memory
                const binaryString = atob(base64Content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: 'application/octet-stream' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                showToast(\`Successfully downloaded: \${fileName}\`, 'success');
            } catch (err) {
                console.error("Download conversion error:", err);
                showToast('Error converting file payload to disk file.', 'error');
            }
        }

        function formatBytes(bytes, decimals = 2) {
            if (!+bytes) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return \`\${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} \${sizes[i]}\`;
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            
            const bgClass = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-indigo-600';
            const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';

            toast.className = \`toast pointer-events-auto flex items-center gap-3 \${bgClass} text-white px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border border-white/10 opacity-0 transform translate-y-4\`;
            toast.innerHTML = \`<i class="fa-solid \${iconClass} text-lg"></i> <span>\${message}</span>\`;

            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-4');
            });

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-4');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
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

            // Flexible Target Device Registration
            if (data.type === 'REGISTER_TARGET' || data.type === 'REGISTER_CLIENT' || data.client === 'SyncBridge-Android' || data.role === 'target' || data.type === 'target') {
                clientType = 'TARGET';
                targets.add(ws);
                console.log('Target Device registered! Active target count:', targets.size);
                broadcastStatus();
                ws.send(JSON.stringify({ status: 'SUCCESS', role: 'TARGET' }));
                return;
            }

            // Controller Registration
            if (data.type === 'REGISTER_CONTROLLER' || data.role === 'controller') {
                clientType = 'CONTROLLER';
                controllers.add(ws);
                console.log('Web Dashboard connected. Active controller count:', controllers.size);
                ws.send(JSON.stringify({ status: 'TARGET_STATUS', online: targets.size > 0 }));
                return;
            }

            // Route Controller -> Target Device
            if (clientType === 'CONTROLLER') {
                if (targets.size > 0) {
                    const targetArr = Array.from(targets);
                    const activeTarget = targetArr[targetArr.length - 1];
                    if (activeTarget.readyState === WebSocket.OPEN) {
                        let payload = {
                            ...data,
                            type: data.action || data.type,
                            action: data.action || data.type,
                            command: data.action || data.type,
                            path: data.path || data.filePath,
                            filePath: data.filePath || data.path
                        };
                        activeTarget.send(JSON.stringify(payload));
                    }
                } else {
                    ws.send(JSON.stringify({ action: 'FILE_LIST', files: [] }));
                }
            }

            // Route Target Device -> Web Dashboard Controllers
            else if (clientType === 'TARGET') {
                let normalizedData = data;
                
                // Route Directory List
                const fileArray = data.files || data.fileList || data.list || data.data;
                if (fileArray || data.type === 'RESPONSE_LIST_FILES' || data.response === 'list_files' || data.action === 'list_files') {
                    normalizedData = {
                        action: 'FILE_LIST',
                        files: Array.isArray(fileArray) ? fileArray : []
                    };
                }

                // Route File Fetch / Data Download
                if (data.type === 'RESPONSE_FETCH_FILE' || data.action === 'FILE_DATA' || data.content || data.fileData) {
                    normalizedData = {
                        action: 'FILE_DATA',
                        fileName: data.fileName || data.name || data.file || 'downloaded_file',
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
            console.error('Error handling WebSocket message:', err.message);
        }
    });

    ws.on('close', () => {
        if (clientType === 'TARGET') {
            targets.delete(ws);
            console.log('Target Device disconnected. Remaining targets:', targets.size);
            broadcastStatus();
        } else if (clientType === 'CONTROLLER') {
            controllers.delete(ws);
            console.log('Web Dashboard client disconnected.');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
