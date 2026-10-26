const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

let targetSocket = null;
let controllerSocket = null;

// Serve the Web-Based Controller Dashboard
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
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
                <div>Target Status: <span id="status" class="status offline">Connecting...</span></div>
                
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
