<script lang="ts">
	import type { SCServoSerial, ServoInfo, ServoStatus } from '$lib/scservo';

	interface Props {
		serial: SCServoSerial;
	}

	let { serial }: Props = $props();

	let servos = $state<ServoInfo[]>([]);
	let servoStatuses = $state<Map<number, ServoStatus>>(new Map());
	let isScanning = $state(false);
	let selectedServoId = $state<number | null>(null);
	let updateInterval: number | null = null;

	async function scanForServos() {
		isScanning = true;
		servos = [];
		servoStatuses.clear();

		try {
			const foundIds = await serial.scanServos(6);

			for (const id of foundIds) {
				try {
					const info = await serial.getServoInfo(id);
					servos.push(info);
				} catch (error) {
					console.error(`Failed to get info for servo ${id}:`, error);
				}
			}

			// Start updating statuses
			if (servos.length > 0 && !updateInterval) {
				startStatusUpdates();
			}
		} catch (error) {
			console.error('Scan failed:', error);
		} finally {
			isScanning = false;
		}
	}

	async function updateServoStatus(id: number) {
		try {
			const status = await serial.getServoStatus(id);
			servoStatuses.set(id, status);
			servoStatuses = servoStatuses; // Trigger reactivity
		} catch (error) {
			console.error(`Failed to update status for servo ${id}:`, error);
		}
	}

	function startStatusUpdates() {
		if (updateInterval) return;

		updateInterval = window.setInterval(() => {
			servos.forEach((servo) => {
				updateServoStatus(servo.id);
			});
		}, 200); // Update every 200ms
	}

	function stopStatusUpdates() {
		if (updateInterval) {
			clearInterval(updateInterval);
			updateInterval = null;
		}
	}

	function selectServo(id: number) {
		selectedServoId = selectedServoId === id ? null : id;
	}

	$effect(() => {
		return () => {
			stopStatusUpdates();
		};
	});
</script>

<div class="servo-list">
	<div class="header">
		<h2>Detected Servos</h2>
		<button onclick={scanForServos} disabled={isScanning}>
			{isScanning ? 'Scanning...' : 'Scan for Servos'}
		</button>
	</div>

	{#if servos.length === 0 && !isScanning}
		<div class="empty-state">
			<p>No servos detected. Click "Scan for Servos" to search.</p>
		</div>
	{:else if isScanning}
		<div class="scanning-state">
			<div class="spinner"></div>
			<p>Scanning for servos...</p>
		</div>
	{:else}
		<div class="servo-cards">
			{#each servos as servo}
				{@const status = servoStatuses.get(servo.id)}
				<div
					class="servo-card"
					class:selected={selectedServoId === servo.id}
					onclick={() => selectServo(servo.id)}
				>
					<div class="servo-header">
						<div class="servo-id">ID {servo.id}</div>
						<div class="servo-model">{servo.model}</div>
					</div>

					<div class="servo-info">
						<div class="info-row">
							<span class="label">Firmware:</span>
							<span class="value">{servo.firmwareVersion}</span>
						</div>
						<div class="info-row">
							<span class="label">Servo Ver:</span>
							<span class="value">{servo.servoVersion}</span>
						</div>
					</div>

					{#if status}
						<div class="servo-status">
							<div class="status-row">
								<span class="label">Position:</span>
								<span class="value">{status.positionDegrees.toFixed(1)}° ({status.position})</span>
							</div>
							<div class="status-row">
								<span class="label">Goal:</span>
								<span class="value">{((status.goalPosition / 4095) * 360).toFixed(1)}° ({status.goalPosition})</span>
							</div>
							<div class="status-row">
								<span class="label">Speed:</span>
								<span class="value">{status.speed}</span>
							</div>
							<div class="status-row">
								<span class="label">Load:</span>
								<span class="value">{status.load}</span>
							</div>
							<div class="status-row">
								<span class="label">Voltage:</span>
								<span class="value" class:warning={status.voltage < 7 || status.voltage > 13}>
									{status.voltage.toFixed(1)}V
								</span>
							</div>
							<div class="status-row">
								<span class="label">Temp:</span>
								<span class="value" class:warning={status.temperature > 70}>
									{status.temperature}°C
								</span>
							</div>
							<div class="status-row">
								<span class="label">Current:</span>
								<span class="value">{status.current}mA</span>
							</div>
							<div class="status-row">
								<span class="label">Torque:</span>
								<span class="value" class:enabled={status.torqueEnabled}>
									{status.torqueEnabled ? 'Enabled' : 'Disabled'}
								</span>
							</div>
							<div class="status-row">
								<span class="label">Moving:</span>
								<span class="value" class:enabled={status.moving}>
									{status.moving ? 'Yes' : 'No'}
								</span>
							</div>
						</div>
					{:else}
						<div class="loading-status">Loading status...</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.servo-list {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.header h2 {
		margin: 0;
		font-size: 1.5rem;
		color: #e0e0e0;
	}

	button {
		background: #4a9eff;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 500;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: #3a8eef;
	}

	.empty-state,
	.scanning-state {
		text-align: center;
		padding: 3rem;
		color: #999;
	}

	.scanning-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #3a3a3a;
		border-top-color: #4a9eff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.servo-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.servo-card {
		background: #1a1a1a;
		border: 2px solid #3a3a3a;
		border-radius: 8px;
		padding: 1.25rem;
		transition: all 0.2s;
		cursor: pointer;
	}

	.servo-card:hover {
		border-color: #4a9eff;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(74, 158, 255, 0.2);
	}

	.servo-card.selected {
		border-color: #4a9eff;
		background: #222;
	}

	.servo-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #3a3a3a;
	}

	.servo-id {
		font-size: 1.25rem;
		font-weight: 600;
		color: #4a9eff;
	}

	.servo-model {
		font-size: 0.85rem;
		color: #999;
		background: #2a2a2a;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.servo-info,
	.servo-status {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.servo-info {
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #3a3a3a;
	}

	.info-row,
	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.label {
		color: #999;
		font-weight: 500;
	}

	.value {
		color: #e0e0e0;
		font-family: 'Courier New', monospace;
	}

	.value.warning {
		color: #ff9800;
		font-weight: 600;
	}

	.value.enabled {
		color: #4caf50;
		font-weight: 600;
	}

	.loading-status {
		text-align: center;
		padding: 1rem;
		color: #666;
		font-size: 0.9rem;
	}
</style>
