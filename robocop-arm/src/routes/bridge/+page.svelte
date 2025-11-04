<script lang="ts">
	import { WebSocketSerial } from '$lib/scservo/websocket-serial';
	import type { ServoInfo, ServoStatus } from '$lib/scservo/websocket-serial';
	import { degreesToPosition } from '$lib/scservo/protocol';
	import { onMount } from 'svelte';
import ArmViewer from '$lib/components/ArmViewer.svelte';

	let serial = $state<WebSocketSerial>(new WebSocketSerial());
	let isConnected = $state(false);
	let isConnecting = $state(false);
	let isScanning = $state(false);
	let errorMessage = $state('');
	let servos = $state<ServoInfo[]>([]);
	let servoStatuses = $state<Map<number, ServoStatus>>(new Map());
	let statusUpdateInterval: number | null = null;
	let isPolling = $state(false);
let statsInterval: number | null = null;
let stats = $state({ sent: 0, received: 0, parsed: 0, timeouts: 0, lastLatencyMs: 0, avgLatencyMs: 0 });
let targetDegrees = $state<Map<number, number>>(new Map());
const armViewerModelUrl = '/models/so-101.glb';
// Calibration override example: wrist roll is on Z and inverted
const jointOverrides = [];

	// Convert servo position (0-4095) to radians for 3D visualization
	function positionToRadians(position: number): number {
		// STS3215 servos: 0-4095 maps to approximately -135° to +135° (270° total)
		const degrees = ((position / 4095) * 270) - 135;
		return (degrees * Math.PI) / 180;
	}

	// Reactive joint angles for the 3D viewer
	const jointAngles = $derived(
		servos.map(servo => ({
			id: servo.id,
			angle: positionToRadians(servoStatuses.get(servo.id)?.position ?? 2047) // 2047 = center position
		}))
	);

	async function connectToBridge() {
		isConnecting = true;
		errorMessage = '';

		try {
			await serial.connect('ws://localhost:8080');
			isConnected = true;
		} catch (error) {
			errorMessage = `Failed to connect: ${error}`;
			console.error(error);
		} finally {
			isConnecting = false;
		}
	}

	async function scanServos() {
		isScanning = true;
		servos = [];
		servoStatuses.clear();

		try {
			const foundIds = await serial.scanServos(6);
			console.log('Found servos:', foundIds);

			for (const id of foundIds) {
				try {
					const info = await serial.getServoInfo(id);
					servos = [...servos, info];
					if (!targetDegrees.has(id)) targetDegrees.set(id, 0);
				} catch (error) {
					console.error(`Failed to get info for servo ${id}:`, error);
				}
			}

			if (servos.length > 0) {
				startStatusUpdates();
			}
		} catch (error) {
			errorMessage = `Scan failed: ${error}`;
			console.error(error);
		} finally {
			isScanning = false;
		}
	}

	async function updateServoStatus(id: number) {
		try {
			const status = await serial.getServoStatus(id);
			const next = new Map(servoStatuses);
			next.set(id, status);
			servoStatuses = next;
		} catch (error) {
			console.error(`Failed to update status for servo ${id}:`, error);
		}
	}

	function startStatusUpdates() {
		if (statusUpdateInterval) return;

		statusUpdateInterval = window.setInterval(async () => {
			if (isPolling) return; // prevent overlap if a previous cycle is still running
			isPolling = true;
			try {
				// Poll servos SEQUENTIALLY to avoid interleaved responses
				for (const servo of servos) {
					await updateServoStatus(servo.id);
				}
			} finally {
				isPolling = false;
			}
		}, 500); // Slower polling to give servos time to respond

		// Lightweight stats refresh
		if (!statsInterval) {
			statsInterval = window.setInterval(() => {
				stats = serial.getStats();
			}, 1000);
		}
	}

	function stopStatusUpdates() {
		if (statusUpdateInterval) {
			clearInterval(statusUpdateInterval);
			statusUpdateInterval = null;
		}
		if (statsInterval) {
			clearInterval(statsInterval);
			statsInterval = null;
		}
	}

	onMount(() => {
		const onVis = () => {
			if (document.hidden) stopStatusUpdates();
			else if (isConnected && servos.length) startStatusUpdates();
		};
		document.addEventListener('visibilitychange', onVis);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			stopStatusUpdates();
			serial.disconnect();
		};
	});

	async function enableAllTorque() {
		for (const s of servos) {
			await serial.setTorqueEnable(s.id, true);
		}
	}

	async function disableAllTorque() {
		for (const s of servos) {
			await serial.setTorqueEnable(s.id, false);
		}
	}

	async function toggleTorque(id: number, enable: boolean) {
		await serial.setTorqueEnable(id, enable);
		await updateServoStatus(id);
	}

	async function moveServo(id: number) {
		const deg = targetDegrees.get(id) ?? 0;
		const pos = degreesToPosition(Math.max(0, Math.min(360, deg)));
		await serial.setPosition(id, pos);
		await updateServoStatus(id);
	}
</script>

<svelte:head>
	<title>RoboCop Arm - Bridge Mode</title>
</svelte:head>

<div class="container">
	<h1>RoboCop Arm Controller (Bridge Mode)</h1>
	<p class="subtitle">Using WebSocket Bridge Server</p>

	<div class="connection-panel">
		<div class="status">
			<span class="status-dot" class:connected={isConnected}></span>
			<span>{isConnected ? 'Connected to Bridge' : 'Disconnected'}</span>
		</div>

		{#if !isConnected}
			<button onclick={connectToBridge} disabled={isConnecting}>
				{isConnecting ? 'Connecting...' : 'Connect to Bridge Server'}
			</button>
		{:else}
			<button onclick={scanServos} disabled={isScanning}>
				{isScanning ? 'Scanning...' : 'Scan for Servos'}
			</button>
			<button class="secondary" style="margin-left: .5rem" onclick={enableAllTorque} disabled={!servos.length}>
				Enable all torque
			</button>
			<button class="secondary" style="margin-left: .5rem" onclick={disableAllTorque} disabled={!servos.length}>
				Disable all torque
			</button>
		{/if}

		{#if errorMessage}
			<div class="error">{errorMessage}</div>
		{/if}

		{#if isConnected}
			<div class="stats">
				<span>Packets: ↑ {stats.sent} · ↓ {stats.parsed}</span>
				<span>Timeouts: {stats.timeouts}</span>
				<span>Latency: {stats.lastLatencyMs.toFixed(1)} ms (avg {stats.avgLatencyMs.toFixed(1)} ms)</span>
			</div>
		{/if}
	</div>

	{#if servos.length > 0}
		<div class="viewer-section">
			<h2>Live 3D View</h2>
			<ArmViewer {jointAngles} initialZoom={150} />
		</div>

		<div class="servos-grid">
			{#each servos as servo}
				{@const status = servoStatuses.get(servo.id)}
				<div class="servo-card">
					<div class="servo-header">
						<h3>Servo {servo.id}</h3>
						<span class="model">{servo.model}</span>
					</div>

					{#if status}
						<div class="status-grid">
							<div class="status-item">
								<span class="label">Position:</span>
								<span class="value">{status.positionDegrees.toFixed(1)}°</span>
							</div>
							<div class="status-item">
								<span class="label">Goal:</span>
								<span class="value">{((status.goalPosition / 4095) * 360).toFixed(1)}°</span>
							</div>
							<div class="status-item">
								<span class="label">Speed:</span>
								<span class="value">{status.speed}</span>
							</div>
							<div class="status-item">
								<span class="label">Load:</span>
								<span class="value">{status.load}</span>
							</div>
							<div class="status-item">
								<span class="label">Voltage:</span>
								<span class="value">{status.voltage.toFixed(1)}V</span>
							</div>
							<div class="status-item">
								<span class="label">Temp:</span>
								<span class="value">{status.temperature}°C</span>
							</div>
						</div>

					<div class="controls">
						<button class="secondary" onclick={() => toggleTorque(servo.id, true)} disabled={status?.torqueEnabled}>Enable torque</button>
						<button class="secondary" onclick={() => toggleTorque(servo.id, false)} disabled={!status?.torqueEnabled}>Disable torque</button>
						<div class="move">
							<input
								type="number"
								min="0"
								max="360"
								step="0.1"
								value={targetDegrees.get(servo.id) ?? 0}
								oninput={(e) => {
									const v = parseFloat(e.currentTarget.value);
									targetDegrees.set(servo.id, isFinite(v) ? v : 0);
									targetDegrees = targetDegrees;
								}}
							/>
							<button class="secondary" onclick={() => moveServo(servo.id)}>Move</button>
						</div>
					</div>

					{:else}
						<div class="loading">Loading status...</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		background: #1a1a1a;
		min-height: 100vh;
		color: #e0e0e0;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		color: #4a9eff;
	}

	.subtitle {
		margin: 0 0 2rem 0;
		color: #999;
	}

	.connection-panel {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		font-size: 1.1rem;
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #666;
		transition: background 0.3s;
	}

	.status-dot.connected {
		background: #4caf50;
		box-shadow: 0 0 8px #4caf50;
	}

	button {
		background: #4a9eff;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: #3a8eef;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		margin-top: 1rem;
		padding: 0.75rem;
		background: #3d1f1f;
		border: 1px solid #f44336;
		border-radius: 4px;
		color: #ff6b6b;
	}

	button.secondary {
		background: transparent;
		border: 1px solid #3a3a3a;
	}

	.stats {
		margin-top: 0.75rem;
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
		color: #bbb;
	}

	.viewer-section {
		margin-bottom: 2rem;
	}

	.viewer-section h2 {
		margin: 0 0 1rem 0;
		color: #4a9eff;
		font-size: 1.5rem;
	}

	.servos-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.servo-card {
		background: #2a2a2a;
		border: 2px solid #3a3a3a;
		border-radius: 8px;
		padding: 1.25rem;
	}

	.servo-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #3a3a3a;
	}

	.servo-header h3 {
		margin: 0;
		color: #4a9eff;
		font-size: 1.25rem;
	}

	.model {
		background: #1a1a1a;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.85rem;
		color: #999;
	}

	.status-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.controls {
		margin-top: 0.75rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.controls .move {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.controls input[type='number'] {
		width: 6rem;
		padding: 0.4rem 0.5rem;
		background: #1a1a1a;
		border: 1px solid #3a3a3a;
		border-radius: 4px;
		color: #e0e0e0;
	}

	.status-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.label {
		font-size: 0.85rem;
		color: #999;
	}

	.value {
		font-size: 1.1rem;
		font-weight: 600;
		color: #e0e0e0;
		font-family: 'Courier New', monospace;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: #666;
	}
</style>
