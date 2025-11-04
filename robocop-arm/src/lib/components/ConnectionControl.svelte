<script lang="ts">
	import { SCServoSerial } from '$lib/scservo';
	import { onDestroy } from 'svelte';

	interface Props {
		serial: SCServoSerial;
		onConnected: () => void;
		onDisconnected: () => void;
	}

	let { serial, onConnected, onDisconnected }: Props = $props();

	let isConnected = $state(false);
	let isConnecting = $state(false);
	let errorMessage = $state('');
	let baudRate = $state(1000000);

	const baudRateOptions = [
		{ value: 1000000, label: '1000000' },
		{ value: 500000, label: '500000' },
		{ value: 250000, label: '250000' },
		{ value: 115200, label: '115200' }
	];

	async function handleConnect() {
		isConnecting = true;
		errorMessage = '';

		try {
			await serial.connect({ baudRate });
			isConnected = true;
			onConnected();
		} catch (error) {
			errorMessage = `Connection failed: ${error}`;
			console.error(error);
		} finally {
			isConnecting = false;
		}
	}

	async function handleDisconnect() {
		try {
			await serial.disconnect();
			isConnected = false;
			onDisconnected();
		} catch (error) {
			errorMessage = `Disconnect failed: ${error}`;
			console.error(error);
		}
	}

	onDestroy(async () => {
		if (isConnected) {
			await serial.disconnect();
		}
	});
</script>

<div class="connection-control">
	<div class="status-indicator" class:connected={isConnected}>
		<div class="status-dot"></div>
		<span>{isConnected ? 'Connected' : 'Disconnected'}</span>
	</div>

	<div class="controls">
		{#if !isConnected}
			<div class="baud-rate-selector">
				<label for="baudRate">Baud Rate:</label>
				<select id="baudRate" bind:value={baudRate}>
					{#each baudRateOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<button onclick={handleConnect} disabled={isConnecting}>
				{isConnecting ? 'Connecting...' : 'Connect to Serial Port'}
			</button>
		{:else}
			<button onclick={handleDisconnect} class="disconnect">
				Disconnect
			</button>
		{/if}
	</div>

	{#if errorMessage}
		<div class="error-message">{errorMessage}</div>
	{/if}

	{#if !SCServoSerial.isSupported()}
		<div class="warning-message">
			Web Serial API is not supported in this browser. Please use Chrome or Edge.
		</div>
	{/if}
</div>

<style>
	.connection-control {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		font-size: 1.1rem;
		font-weight: 500;
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #666;
		transition: background 0.3s;
	}

	.status-indicator.connected .status-dot {
		background: #4caf50;
		box-shadow: 0 0 8px #4caf50;
	}

	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.baud-rate-selector {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.baud-rate-selector label {
		font-size: 0.9rem;
		color: #999;
	}

	select {
		background: #1a1a1a;
		color: #e0e0e0;
		border: 1px solid #3a3a3a;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
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

	button.disconnect {
		background: #f44336;
	}

	button.disconnect:hover {
		background: #d32f2f;
	}

	.error-message {
		margin-top: 1rem;
		padding: 0.75rem;
		background: #3d1f1f;
		border: 1px solid #f44336;
		border-radius: 4px;
		color: #ff6b6b;
		font-size: 0.9rem;
	}

	.warning-message {
		margin-top: 1rem;
		padding: 0.75rem;
		background: #3d2f1f;
		border: 1px solid #ff9800;
		border-radius: 4px;
		color: #ffb74d;
		font-size: 0.9rem;
	}
</style>
