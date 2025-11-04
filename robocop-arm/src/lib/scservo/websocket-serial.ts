/**
 * WebSocket-based Serial Service for SCServo communication
 * Connects to the bridge server instead of using Web Serial API directly
 */

import {
	createPingPacket,
	createReadPacket,
	createWritePacket,
	parsePacket,
	bytesToWord,
	MemoryAddress,
	type ParsedPacket
} from './protocol';

export interface ServoInfo {
	id: number;
	firmwareVersion: string;
	servoVersion: string;
	model: string;
	online: boolean;
}

export interface ServoStatus {
	id: number;
	position: number;
	positionDegrees: number;
	speed: number;
	load: number;
	voltage: number;
	temperature: number;
	current: number;
	moving: boolean;
	goalPosition: number;
	torqueEnabled: boolean;
}

export class WebSocketSerial {
	private ws: WebSocket | null = null;
	private readBuffer: number[] = [];
	private responseCallbacks: Map<number, (packet: ParsedPacket) => void> = new Map();
	private isConnected = false;
	private lastSentPacket: Uint8Array | null = null;
	private stats = {
		sent: 0,
		received: 0,
		parsed: 0,
		timeouts: 0,
		lastLatencyMs: 0,
		avgLatencyMs: 0,
	};

	/**
	 * Connect to the bridge server
	 */
	async connect(bridgeUrl: string = 'ws://localhost:8080'): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(bridgeUrl);

				this.ws.onopen = () => {
					console.log('✓ Connected to bridge server');
				};

				this.ws.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);

						if (message.type === 'connected') {
							console.log(`✓ Bridge connected to ${message.port} @ ${message.baudRate} baud`);
							this.isConnected = true;
							resolve();
						} else if (message.type === 'data') {
							this.handleIncomingData(new Uint8Array(message.data));
						} else if (message.type === 'error') {
							console.error('Bridge error:', message.message);
						}
					} catch (error) {
						console.error('Message parse error:', error);
					}
				};

				this.ws.onerror = (error) => {
					console.error('WebSocket error:', error);
					reject(new Error('WebSocket connection failed'));
				};

				this.ws.onclose = () => {
					console.log('✗ Disconnected from bridge server');
					this.isConnected = false;
				};

			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Disconnect from bridge server
	 */
	async disconnect(): Promise<void> {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.isConnected = false;
		this.readBuffer = [];
		this.responseCallbacks.clear();
	}

	/**
	 * Check if connected
	 */
	isConnectedToBridge(): boolean {
		return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Handle incoming data from bridge
	 */
	private handleIncomingData(data: Uint8Array): void {
		// Append to buffer and process. Echo filtering happens in processBuffer
		this.readBuffer.push(...Array.from(data));
		this.stats.received += 1;
		this.processBuffer();
	}

	/**
	 * Process read buffer for complete packets
	 */
	private processBuffer(): void {
		while (this.readBuffer.length >= 6) {
			const headerIndex = this.readBuffer.findIndex(
				(byte, i) => byte === 0xFF && this.readBuffer[i + 1] === 0xFF
			);

			if (headerIndex === -1) {
				this.readBuffer = [];
				return;
			}

			if (headerIndex > 0) {
				this.readBuffer = this.readBuffer.slice(headerIndex);
			}

			if (this.readBuffer.length < 6) return;

			const length = this.readBuffer[3];
			const packetLength = length + 4;

			if (this.readBuffer.length < packetLength) return;

			const packetData = new Uint8Array(this.readBuffer.slice(0, packetLength));
			this.readBuffer = this.readBuffer.slice(packetLength);

			// Filter out half-duplex echo (identical to last written packet)
			if (this.lastSentPacket && this.arraysEqual(packetData, this.lastSentPacket)) {
				// Drop echo and continue. Preserve lastSentPacket only until first echo seen.
				this.lastSentPacket = null;
				continue;
			}

				const packet = parsePacket(packetData);

				if (packet.valid) {
					this.stats.parsed += 1;
					this.handlePacket(packet);
				}
			}
	}

	private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	/**
	 * Handle parsed packet
	 */
	private handlePacket(packet: ParsedPacket): void {
		const callback = this.responseCallbacks.get(packet.id);
		if (callback) {
			callback(packet);
		}
	}

	/**
	 * Send packet and wait for response
	 */
	private async sendAndWait(packet: Uint8Array, servoId: number, timeout = 500): Promise<ParsedPacket> {
		if (!this.ws || !this.isConnected) {
			throw new Error('Not connected to bridge');
		}

		return new Promise((resolve, reject) => {
			const start = performance.now();
			const timeoutId = setTimeout(() => {
				this.responseCallbacks.delete(servoId);
				reject(new Error('Response timeout'));
				this.stats.timeouts += 1;
			}, timeout);

			this.responseCallbacks.set(servoId, (response) => {
				clearTimeout(timeoutId);
				this.responseCallbacks.delete(servoId);
				this.stats.lastLatencyMs = performance.now() - start;
				this.stats.avgLatencyMs = this.stats.avgLatencyMs === 0
					? this.stats.lastLatencyMs
					: (this.stats.avgLatencyMs * 0.8 + this.stats.lastLatencyMs * 0.2);
				resolve(response);
			});

			try {
				this.lastSentPacket = packet;
				this.ws!.send(JSON.stringify({
					type: 'write',
					data: Array.from(packet)
				}));
				this.stats.sent += 1;
			} catch (error) {
				clearTimeout(timeoutId);
				this.responseCallbacks.delete(servoId);
				reject(error);
			}
		});
	}

	/**
	 * Ping a servo
	 */
	async ping(id: number): Promise<boolean> {
		try {
			const packet = createPingPacket(id);
			const response = await this.sendAndWait(packet, id);
			return response.valid && response.error === 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Scan for servos
	 */
	async scanServos(maxId = 6): Promise<number[]> {
		const foundServos: number[] = [];

		for (let id = 1; id <= maxId; id++) {
			const online = await this.ping(id);
			if (online) {
				foundServos.push(id);
			}
		}

		return foundServos;
	}

	/**
	 * Read servo information
	 */
	async getServoInfo(id: number): Promise<ServoInfo> {
		const packet = createReadPacket(id, MemoryAddress.FIRMWARE_MAJOR, 5);
		const response = await this.sendAndWait(packet, id);

		if (!response.valid || response.parameters.length < 5) {
			throw new Error('Failed to read servo info');
		}

		return {
			id,
			firmwareVersion: `${response.parameters[0]}.${response.parameters[1]}`,
			servoVersion: `${response.parameters[2]}.${response.parameters[3]}`,
			model: 'STS3215',
			online: true
		};
	}

	/**
	 * Read servo status
	 */
	async getServoStatus(id: number): Promise<ServoStatus> {
		const packet = createReadPacket(id, MemoryAddress.TORQUE_ENABLE, 31);
		const response = await this.sendAndWait(packet, id, 500);

		if (!response.valid || response.parameters.length < 31) {
			throw new Error('Failed to read servo status');
		}

		const params = response.parameters;
		const torqueEnabled = params[0] === 1;
		const goalPosition = bytesToWord(params[2], params[3]);
		const presentPosition = bytesToWord(params[16], params[17]);
		const presentSpeed = bytesToWord(params[18], params[19]);
		const presentLoad = bytesToWord(params[20], params[21]);
		const voltage = params[22];
		const temperature = params[23];
		const moving = params[26] === 1;
		const current = bytesToWord(params[29], params[30]);

		return {
			id,
			position: presentPosition,
			positionDegrees: (presentPosition / 4095) * 360,
			speed: presentSpeed,
			load: presentLoad,
			voltage: voltage / 10,
			temperature,
			current,
			moving,
			goalPosition,
			torqueEnabled
		};
	}

	/**
	 * Set servo position
	 */
	async setPosition(id: number, position: number, speed?: number): Promise<void> {
		const posLow = position & 0xFF;
		const posHigh = (position >> 8) & 0xFF;

		let data: number[];
		if (speed !== undefined) {
			const speedLow = speed & 0xFF;
			const speedHigh = (speed >> 8) & 0xFF;
			data = [posLow, posHigh, speedLow, speedHigh];
		} else {
			data = [posLow, posHigh];
		}

		const packet = createWritePacket(id, MemoryAddress.GOAL_POSITION, data);
		await this.sendAndWait(packet, id);
	}

	/**
	 * Enable/disable torque
	 */
	async setTorqueEnable(id: number, enable: boolean): Promise<void> {
		const packet = createWritePacket(id, MemoryAddress.TORQUE_ENABLE, [enable ? 1 : 0]);
		await this.sendAndWait(packet, id);
	}

	getStats() {
		return { ...this.stats };
	}
}
