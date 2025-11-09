/**
 * SCServo Protocol Implementation for Feetech STS3215
 * Based on Feetech SCServo communication protocol
 */

// Protocol constants
export const HEADER = 0xFF;
export const BROADCAST_ID = 0xFE;

// Instruction set
export enum Instruction {
	PING = 0x01,
	READ_DATA = 0x02,
	WRITE_DATA = 0x03,
	REG_WRITE = 0x04,
	ACTION = 0x05,
	SYNC_WRITE = 0x83,
	RESET = 0x06
}

// Memory table addresses (based on STS3215 specification)
export enum MemoryAddress {
	// EPROM area (persistent)
	FIRMWARE_MAJOR = 0,
	FIRMWARE_MINOR = 1,
	SERVO_MAJOR = 3,
	SERVO_MINOR = 4,
	ID = 5,
	BAUD_RATE = 6,
	RETURN_DELAY = 7,
	STATUS_RETURN_LEVEL = 8,
	MIN_ANGLE_LIMIT = 9,      // 2 bytes
	MAX_ANGLE_LIMIT = 11,     // 2 bytes
	MAX_TEMP_LIMIT = 13,
	MAX_INPUT_VOLTAGE = 14,
	MIN_INPUT_VOLTAGE = 15,
	MAX_TORQUE_LIMIT = 16,    // 2 bytes
	SETTING_BYTE = 18,
	UNLOADING_CONDITION = 19,
	LED_ALARM_CONDITION = 20,
	POSITION_P = 21,
	POSITION_D = 22,
	POSITION_I = 23,
	STARTUP_FORCE = 24,       // 2 bytes
	CW_DEAD_BAND = 26,
	CCW_DEAD_BAND = 27,
	OVERLOAD_CURRENT = 28,    // 2 bytes
	ANGULAR_RESOLUTION = 30,
	OFFSET_ADJUSTMENT = 31,   // 2 bytes
	MODE = 33,

	// RAM area (volatile)
	TORQUE_ENABLE = 40,
	ACCELERATION = 41,
	GOAL_POSITION = 42,       // 2 bytes
	RUNNING_TIME = 44,        // 2 bytes
	RUNNING_SPEED = 46,       // 2 bytes
	TORQUE_LIMIT = 48,        // 2 bytes
	LOCK = 55,

	// Read-only status
	PRESENT_POSITION = 56,    // 2 bytes
	PRESENT_SPEED = 58,       // 2 bytes
	PRESENT_LOAD = 60,        // 2 bytes
	PRESENT_VOLTAGE = 62,
	PRESENT_TEMPERATURE = 63,
	ASYNC_WRITE_FLAG = 64,
	SERVO_STATUS = 65,
	MOVING = 66,
	PRESENT_CURRENT = 69,     // 2 bytes

	// Additional DEFAULT area registers
	AMAX = 85                 // Acceleration max
}

/**
 * Calculate checksum for packet
 */
export function calculateChecksum(data: number[]): number {
	// Sum all bytes from ID through the last byte provided.
	// Callers must pass the packet WITHOUT the checksum byte.
	let sum = 0;
	for (let i = 2; i < data.length; i++) {
		sum += data[i];
	}
	return (~sum) & 0xFF;
}

/**
 * Create a packet for communication
 */
export function createPacket(
	id: number,
	instruction: Instruction,
	parameters: number[] = []
): Uint8Array {
	const length = parameters.length + 2; // instruction + checksum
	const packet = [
		HEADER,
		HEADER,
		id,
		length,
		instruction,
		...parameters
	];

	const checksum = calculateChecksum(packet);
	packet.push(checksum);

	return new Uint8Array(packet);
}

/**
 * Parse response packet
 */
export interface ParsedPacket {
	id: number;
	error: number;
	parameters: number[];
	valid: boolean;
}

export function parsePacket(data: Uint8Array): ParsedPacket {
	const result: ParsedPacket = {
		id: 0,
		error: 0,
		parameters: [],
		valid: false
	};

	if (data.length < 6) return result;
	if (data[0] !== HEADER || data[1] !== HEADER) return result;

	result.id = data[2];
	const length = data[3];
	result.error = data[4];

	const expectedLength = 6 + length - 2;
	if (data.length < expectedLength) return result;

	const checksum = data[expectedLength - 1];
	const calculatedChecksum = calculateChecksum(Array.from(data.slice(0, expectedLength - 1)));

	if (checksum !== calculatedChecksum) return result;

	result.parameters = Array.from(data.slice(5, expectedLength - 1));
	result.valid = true;

	return result;
}

/**
 * Create PING packet
 */
export function createPingPacket(id: number): Uint8Array {
	return createPacket(id, Instruction.PING);
}

/**
 * Create READ_DATA packet
 */
export function createReadPacket(
	id: number,
	address: MemoryAddress,
	length: number
): Uint8Array {
	return createPacket(id, Instruction.READ_DATA, [address, length]);
}

/**
 * Create WRITE_DATA packet
 */
export function createWritePacket(
	id: number,
	address: MemoryAddress,
	data: number[]
): Uint8Array {
	return createPacket(id, Instruction.WRITE_DATA, [address, ...data]);
}

/**
 * Convert 2 bytes to 16-bit value (little endian)
 */
export function bytesToWord(low: number, high: number): number {
	return (high << 8) | low;
}

/**
 * Convert 16-bit value to 2 bytes (little endian)
 */
export function wordToBytes(value: number): [number, number] {
	return [value & 0xFF, (value >> 8) & 0xFF];
}

/**
 * Convert position value (0-4095) to degrees
 */
export function positionToDegrees(position: number): number {
	return (position / 4095) * 360;
}

/**
 * Convert degrees to position value (0-4095)
 */
export function degreesToPosition(degrees: number): number {
	return Math.round((degrees / 360) * 4095);
}
