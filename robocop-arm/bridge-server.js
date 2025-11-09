/**
 * Serial Bridge Server for SCServo Communication
 *
 * This server bridges Web Serial API limitations by providing
 * a WebSocket interface to the serial port. It handles the
 * half-duplex communication that the XIAO adapter board requires.
 */

import { SerialPort } from 'serialport';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const DEFAULT_BAUD_RATE = Number(process.env.BRIDGE_BAUD || 1000000);
const WS_PORT = Number(process.env.BRIDGE_WS_PORT || 8080);
const HTTP_PORT = Number(process.env.BRIDGE_HTTP_PORT || 8081);
const VERBOSE = process.env.BRIDGE_VERBOSE === '1';
const LOG_TO_FILE = process.env.BRIDGE_LOG === '1';
const LOG_PATH = process.env.BRIDGE_LOG_PATH || path.join(process.cwd(), 'log.txt');
const LOG_MAX = Number(process.env.BRIDGE_LOG_MAX || 1_000_000); // ~1MB

let port = null;
let wsServer = null;
let httpServer = null;
let connectedClients = new Set();
let currentPortPath = null;
let currentBaudRate = DEFAULT_BAUD_RATE;

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
async function initSerialPort(portPath, baudRate) {
	try {
		// Close existing port if open
		if (port && port.isOpen) {
			await new Promise((resolve) => {
				port.close(() => resolve());
			});
		}

		port = new SerialPort({
			path: portPath,
			baudRate: baudRate,
			dataBits: 8,
			stopBits: 1,
			parity: 'none',
			autoOpen: false
		});

		currentPortPath = portPath;
		currentBaudRate = baudRate;

    port.on('open', () => {
        appendLog(`✓ Serial port ${portPath} opened at ${baudRate} baud`);
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

// Initialize HTTP server for port listing
function initHttpServer() {
	const app = express();
	app.use(cors());
	app.use(express.json());

	// List available serial ports
	app.get('/api/ports', async (req, res) => {
		try {
			const ports = await SerialPort.list();

			// Filter to show only likely servo controller ports
			const filtered = ports.filter(port => {
				const pathLower = port.path.toLowerCase();
				const manufacturer = (port.manufacturer || '').toLowerCase();

				// Windows: COM ports
				if (pathLower.includes('com')) return true;

				// Linux/Mac: tty devices
				if (pathLower.includes('/dev/tty')) return true;

				// Common USB-Serial chips
				if (manufacturer.includes('ftdi')) return true;
				if (manufacturer.includes('ch340')) return true;
				if (manufacturer.includes('cp210')) return true;
				if (manufacturer.includes('prolific')) return true;

				return false;
			});

			appendLog(`Found ${filtered.length} potential serial ports`);
			res.json(filtered);
		} catch (error) {
			appendLog('Error listing ports: ' + error.message);
			res.status(500).json({ error: error.message });
		}
	});

	// Get current connection status
	app.get('/api/status', (req, res) => {
		res.json({
			connected: port && port.isOpen,
			port: currentPortPath,
			baudRate: currentBaudRate
		});
	});

	httpServer = app.listen(HTTP_PORT, () => {
		appendLog(`✓ HTTP API listening on http://localhost:${HTTP_PORT}`);
	});
}

// Initialize WebSocket server
function initWebSocketServer() {
    wsServer = new WebSocketServer({ port: WS_PORT });

    wsServer.on('connection', (ws) => {
        appendLog('✓ Web client connected');
        connectedClients.add(ws);

		ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

				// Handle port connection request
				if (data.type === 'connect') {
					const portPath = data.port;
					const baudRate = data.baud || DEFAULT_BAUD_RATE;

					try {
						appendLog(`Connecting to ${portPath} @ ${baudRate} baud...`);
						await initSerialPort(portPath, baudRate);

						ws.send(JSON.stringify({
							type: 'connected',
							port: portPath,
							baudRate: baudRate
						}));

						// Notify all other clients about the connection
						connectedClients.forEach(client => {
							if (client !== ws && client.readyState === 1) {
								client.send(JSON.stringify({
									type: 'connected',
									port: portPath,
									baudRate: baudRate
								}));
							}
						});
					} catch (error) {
						appendLog(`Failed to connect to ${portPath}: ${error.message}`);
						ws.send(JSON.stringify({
							type: 'error',
							message: `Failed to connect to ${portPath}: ${error.message}`
						}));
					}
					return;
				}

				// Handle port disconnection request
				if (data.type === 'disconnect') {
					try {
						if (port && port.isOpen) {
							const closedPort = currentPortPath;
							await new Promise((resolve) => {
								port.close(() => resolve());
							});
							port = null;
							currentPortPath = null;

							appendLog(`✓ Serial port ${closedPort} closed`);

							ws.send(JSON.stringify({
								type: 'disconnected'
							}));

							// Notify all other clients about the disconnection
							connectedClients.forEach(client => {
								if (client !== ws && client.readyState === 1) {
									client.send(JSON.stringify({
										type: 'disconnected'
									}));
								}
							});
						} else {
							ws.send(JSON.stringify({
								type: 'disconnected'
							}));
						}
					} catch (error) {
						appendLog(`Failed to disconnect: ${error.message}`);
						ws.send(JSON.stringify({
							type: 'error',
							message: `Failed to disconnect: ${error.message}`
						}));
					}
					return;
				}

                if (data.type === 'write' && Array.isArray(data.data)) {
					if (!port || !port.isOpen) {
						ws.send(JSON.stringify({
							type: 'error',
							message: 'Serial port not connected. Please select a port first.'
						}));
						return;
					}

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

		// Send connection status (port may not be connected yet)
		ws.send(JSON.stringify({
			type: 'status',
			connected: port && port.isOpen,
			port: currentPortPath,
			baudRate: currentBaudRate
		}));
	});

    appendLog(`✓ WebSocket server listening on ws://localhost:${WS_PORT}`);
}

// Main
async function main() {
    appendLog('=== SCServo Serial Bridge Server ===');

	try {
		initHttpServer();
		initWebSocketServer();

        appendLog('✓ Bridge server ready!');
        appendLog(`  HTTP API: http://localhost:${HTTP_PORT}`);
        appendLog(`  WebSocket: ws://localhost:${WS_PORT}`);
        appendLog('Waiting for web client to select a serial port...');

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
	if (httpServer) {
		httpServer.close();
	}
    process.exit(0);
});

main();
