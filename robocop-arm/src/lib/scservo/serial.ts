/**
 * Web Serial API service for SCServo communication
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

export interface SerialConfig {
	baudRate: number;
	dataBits?: 8;
	stopBits?: 1;
	parity?: 'none';
}

export interface ServoInfo {
	id: number;
	firmwareVersion: string;
	servoVersion: string;
	model: string;
	online: boolean;
}

export interface ServoStatus {
	id: number;
	position: number;          // Current position (0-4095)
	positionDegrees: number;   // Position in degrees
	speed: number;             // Current speed
	load: number;              // Current load
	voltage: number;           // Input voltage (in 0.1V units)
	temperature: number;       // Temperature in Celsius
	current: number;           // Current draw
	moving: boolean;           // Is servo moving
	goalPosition: number;      // Target position
	torqueEnabled: boolean;    // Is torque enabled
}

export class SCServoSerial {
	private port: SerialPort | null = null;
	private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private readBuffer: number[] = [];
	private responseCallbacks: Map<number, (packet: ParsedPacket) => void> = new Map();
	private isReading = false;
	private lastSentPacket: Uint8Array | null = null;

	/**
	 * Check if Web Serial API is supported
	 */
	static isSupported(): boolean {
		return 'serial' in navigator;
	}

	/**
	 * Request port from user and connect
	 */
	async connect(config: SerialConfig = { baudRate: 1000000 }): Promise<void> {
		if (!SCServoSerial.isSupported()) {
			throw new Error('Web Serial API is not supported in this browser');
		}

		try {
			// Request port access
			this.port = await navigator.serial.requestPort();

			// Open port with configuration
			await this.port.open({
				baudRate: config.baudRate,
				dataBits: config.dataBits ?? 8,
				stopBits: config.stopBits ?? 1,
				parity: config.parity ?? 'none',
				bufferSize: 4096,
				flowControl: 'none'
			});

			// Set up reader and writer
			if (this.port.readable) {
				this.reader = this.port.readable.getReader();
				this.startReading();
			}

			if (this.port.writable) {
				this.writer = this.port.writable.getWriter();
			}
		} catch (error) {
			throw new Error(`Failed to connect: ${error}`);
		}
	}

	/**
	 * Disconnect from port
	 */
	async disconnect(): Promise<void> {
		this.isReading = false;

		if (this.reader) {
			await this.reader.cancel();
			this.reader.releaseLock();
			this.reader = null;
		}

		if (this.writer) {
			this.writer.releaseLock();
			this.writer = null;
		}

		if (this.port) {
			await this.port.close();
			this.port = null;
		}

		this.readBuffer = [];
		this.responseCallbacks.clear();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.port !== null && this.writer !== null;
	}

	/**
	 * Start reading from serial port
	 */
	private async startReading(): Promise<void> {
		if (!this.reader) return;

		this.isReading = true;

		try {
			while (this.isReading && this.reader) {
				const { value, done } = await this.reader.read();
				if (done) break;
				if (value) {
					this.handleIncomingData(value);
				}
			}
		} catch (error) {
			console.error('Error reading from serial port:', error);
		}
	}

	/**
	 * Handle incoming serial data
	 */
	private handleIncomingData(data: Uint8Array): void {
		console.log('Received data:', Array.from(data));

		// Check if this is an echo of what we just sent (common in half-duplex)
		if (this.lastSentPacket) {
			const dataArray = Array.from(data);
			const sentArray = Array.from(this.lastSentPacket);

			// If the received data starts with our sent packet, skip the echo
			if (dataArray.length >= sentArray.length) {
				let isEcho = true;
				for (let i = 0; i < sentArray.length; i++) {
					if (dataArray[i] !== sentArray[i]) {
						isEcho = false;
						break;
					}
				}

				if (isEcho) {
					console.log('Detected echo, skipping first', sentArray.length, 'bytes');
					// Skip the echo bytes, keep only the response
					const responseData = dataArray.slice(sentArray.length);
					this.readBuffer.push(...responseData);
					this.lastSentPacket = null;
					this.processBuffer();
					return;
				}
			}
		}

		// Add to buffer
		this.readBuffer.push(...Array.from(data));

		// Try to parse packets from buffer
		this.processBuffer();
	}

	/**
	 * Process read buffer for complete packets
	 */
	private processBuffer(): void {
		console.log('Processing buffer, length:', this.readBuffer.length, 'data:', this.readBuffer);

		while (this.readBuffer.length >= 6) {
			// Look for header
			const headerIndex = this.readBuffer.findIndex(
				(byte, i) => byte === 0xFF && this.readBuffer[i + 1] === 0xFF
			);

			console.log('Header index:', headerIndex);

			if (headerIndex === -1) {
				console.log('No header found, clearing buffer');
				this.readBuffer = [];
				return;
			}

			// Remove data before header
			if (headerIndex > 0) {
				this.readBuffer = this.readBuffer.slice(headerIndex);
			}

			// Check if we have enough data for a packet
			if (this.readBuffer.length < 6) return;

			const length = this.readBuffer[3];
			const packetLength = length + 4;

			console.log('Packet length:', packetLength, 'buffer length:', this.readBuffer.length);

			if (this.readBuffer.length < packetLength) return;

			// Extract packet
			const packetData = new Uint8Array(this.readBuffer.slice(0, packetLength));
			this.readBuffer = this.readBuffer.slice(packetLength);

			console.log('Parsing packet:', Array.from(packetData));

			// Parse and handle packet
			const packet = parsePacket(packetData);
			console.log('Parsed packet result:', packet);
			if (packet.valid) {
				this.handlePacket(packet);
			}
		}
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
	private async sendAndWait(packet: Uint8Array, servoId: number, timeout = 100): Promise<ParsedPacket> {
		if (!this.writer) {
			throw new Error('Not connected');
		}

		return new Promise(async (resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.responseCallbacks.delete(servoId);
				reject(new Error('Response timeout'));
			}, timeout);

			this.responseCallbacks.set(servoId, (response) => {
				clearTimeout(timeoutId);
				this.responseCallbacks.delete(servoId);
				resolve(response);
			});

			try {
				this.lastSentPacket = packet;
				await this.writer.write(packet);
			} catch (error) {
				clearTimeout(timeoutId);
				this.responseCallbacks.delete(servoId);
				this.lastSentPacket = null;
				reject(error);
			}
		});
	}

	/**
	 * Ping a servo to check if it's online
	 */
	async ping(id: number): Promise<boolean> {
		try {
			const packet = createPingPacket(id);
			console.log(`Pinging servo ${id}, packet:`, Array.from(packet));
			const response = await this.sendAndWait(packet, id, 500); // Increased timeout to 500ms
			console.log(`Servo ${id} response:`, response);
			return response.valid && response.error === 0;
		} catch (error) {
			console.log(`Servo ${id} ping failed:`, error);
			return false;
		}
	}

	/**
	 * Scan for servos on the bus
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
	 * Read servo status (all parameters)
	 */
	async getServoStatus(id: number): Promise<ServoStatus> {
		// Read from TORQUE_ENABLE to PRESENT_CURRENT (address 40-70, 30 bytes)
		const packet = createReadPacket(id, MemoryAddress.TORQUE_ENABLE, 31);
		const response = await this.sendAndWait(packet, id, 200);

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
	 * Set servo goal position
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
}
