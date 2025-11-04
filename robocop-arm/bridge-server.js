/**
 * Serial Bridge Server for SCServo Communication
 *
 * This server bridges Web Serial API limitations by providing
 * a WebSocket interface to the serial port. It handles the
 * half-duplex communication that the XIAO adapter board requires.
 */

import { SerialPort } from 'serialport';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

const SERIAL_PORT = process.env.BRIDGE_SERIAL || 'COM13';
const BAUD_RATE = Number(process.env.BRIDGE_BAUD || 1000000);
const WS_PORT = Number(process.env.BRIDGE_WS_PORT || 8080);
const VERBOSE = process.env.BRIDGE_VERBOSE === '1';
const LOG_TO_FILE = process.env.BRIDGE_LOG === '1';
const LOG_PATH = process.env.BRIDGE_LOG_PATH || path.join(process.cwd(), 'log.txt');
const LOG_MAX = Number(process.env.BRIDGE_LOG_MAX || 1_000_000); // ~1MB

let port = null;
let wsServer = null;
let connectedClients = new Set();

function appendLog(line) {
    const msg = `[${new Date().toISOString()}] ${line}\n`;
    if (LOG_TO_FILE) {
        try {
            if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX) {
                // rotate: move to .prev and start fresh
                const prev = LOG_PATH.replace(/\.txt$/i, '.prev.txt');
                try { fs.rmSync(prev, { force: true }); } catch {}
                fs.renameSync(LOG_PATH, prev);
            }
            fs.appendFileSync(LOG_PATH, msg);
        } catch (e) {
            // ignore logging errors
        }
    }
    // Always also write to console for interactive use
    process.stdout.write(msg);
}

// Initialize serial port
async function initSerialPort() {
	try {
		port = new SerialPort({
			path: SERIAL_PORT,
			baudRate: BAUD_RATE,
			dataBits: 8,
			stopBits: 1,
			parity: 'none',
			autoOpen: false
		});

    port.on('open', () => {
        appendLog(`✓ Serial port ${SERIAL_PORT} opened at ${BAUD_RATE} baud`);
    });

    port.on('data', (data) => {
        if (VERBOSE) appendLog('← Received from servo: ' + JSON.stringify(Array.from(data)));
        // Broadcast to all connected WebSocket clients
        connectedClients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(JSON.stringify({
                    type: 'data',
                    data: Array.from(data)
                }));
            }
        });
    });

    port.on('error', (err) => {
        appendLog('Serial port error: ' + err.message);
    });

		await new Promise((resolve, reject) => {
			port.open((err) => {
				if (err) reject(err);
				else resolve();
			});
		});

	} catch (error) {
		console.error('Failed to initialize serial port:', error);
		throw error;
	}
}

// Initialize WebSocket server
function initWebSocketServer() {
    wsServer = new WebSocketServer({ port: WS_PORT });

    wsServer.on('connection', (ws) => {
        appendLog('✓ Web client connected');
        connectedClients.add(ws);

		ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'write' && Array.isArray(data.data)) {
                    const buffer = Buffer.from(data.data);
                    if (VERBOSE) appendLog('→ Sending to servo: ' + JSON.stringify(Array.from(buffer)));

                    port.write(buffer, (err) => {
                        if (err) {
                            appendLog('Write error: ' + err.message);
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: err.message
                            }));
                        }
                    });
                }
            } catch (error) {
                appendLog('Message processing error: ' + (error?.message || String(error)));
            }
        });

        ws.on('close', () => {
            appendLog('✗ Web client disconnected');
            connectedClients.delete(ws);
        });

        ws.on('error', (error) => {
            appendLog('WebSocket error: ' + (error?.message || String(error)));
            connectedClients.delete(ws);
        });

		// Send connection confirmation
		ws.send(JSON.stringify({
			type: 'connected',
			port: SERIAL_PORT,
			baudRate: BAUD_RATE
		}));
	});

    appendLog(`✓ WebSocket server listening on ws://localhost:${WS_PORT}`);
}

// Main
async function main() {
    appendLog('=== SCServo Serial Bridge Server ===');

	try {
		await initSerialPort();
		initWebSocketServer();

        appendLog('✓ Bridge server ready!');
        appendLog(`  Serial: ${SERIAL_PORT} @ ${BAUD_RATE} baud`);
        appendLog(`  WebSocket: ws://localhost:${WS_PORT}`);
        appendLog('Waiting for web client connections...');

	} catch (error) {
        appendLog('Failed to start bridge server: ' + (error?.message || String(error)));
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGINT', () => {
    appendLog('Shutting down...');
    if (port && port.isOpen) {
        port.close();
    }
    if (wsServer) {
        wsServer.close();
    }
    process.exit(0);
});

main();
