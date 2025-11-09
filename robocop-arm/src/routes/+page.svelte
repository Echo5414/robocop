<script lang="ts">
	import { WebSocketSerial } from '$lib/scservo/websocket-serial';
	import type { ServoInfo } from '$lib/scservo/websocket-serial';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';

	let serial = $state<WebSocketSerial>(new WebSocketSerial());
	let availablePorts = $state<any[]>([]);
	let selectedPort = $state<string>('');
	let selectedBaudRate = $state<string>('1000000');
	let isLoadingPorts = $state(false);
	let isConnectingToPort = $state(false);
	let servos = $state<ServoInfo[]>([]);
	let errorMessage = $state('');

	// Baud rate options
	const baudRateOptions = [
		{ value: '9600', label: '9600' },
		{ value: '19200', label: '19200' },
		{ value: '57600', label: '57600' },
		{ value: '115200', label: '115200' },
		{ value: '500000', label: '500000' },
		{ value: '1000000', label: '1000000' }
	];

	// Computed port options
	let portOptions = $derived(
		availablePorts.map(port => ({
			value: port.path,
			label: port.manufacturer ? `${port.path} (${port.manufacturer})` : port.path
		}))
	);

	async function loadAvailablePorts() {
		isLoadingPorts = true;
		errorMessage = '';

		try {
			availablePorts = await serial.listPorts();

			// Try to load last used port from localStorage
			const lastPort = localStorage.getItem('lastSerialPort');
			if (lastPort && availablePorts.some(p => p.path === lastPort)) {
				selectedPort = lastPort;
			} else if (availablePorts.length > 0) {
				selectedPort = availablePorts[0].path;
			}
		} catch (error) {
			errorMessage = `Failed to load ports: ${error}`;
			console.error(error);
		} finally {
			isLoadingPorts = false;
		}
	}

	async function connectToBridge() {
		errorMessage = '';

		try {
			await serial.connect('ws://localhost:8080');
			await loadAvailablePorts();
		} catch (error) {
			errorMessage = `Failed to connect: ${error}`;
			console.error(error);
		}
	}

	async function connectToPort() {
		if (!selectedPort) {
			errorMessage = 'Please select a COM port';
			return;
		}

		isConnectingToPort = true;
		errorMessage = '';

		try {
			await serial.selectPort(selectedPort, parseInt(selectedBaudRate));

			// Save last used port
			localStorage.setItem('lastSerialPort', selectedPort);

			// Scan for servos
			const foundIds = await serial.scanServos(6);
			for (const id of foundIds) {
				try {
					const info = await serial.getServoInfo(id);
					servos = [...servos, info];
				} catch (error) {
					console.error(`Failed to get info for servo ${id}:`, error);
				}
			}
		} catch (error) {
			errorMessage = `Failed to connect to ${selectedPort}: ${error}`;
			console.error(error);
		} finally {
			isConnectingToPort = false;
		}
	}

	onMount(() => {
		// Auto-connect to bridge server when component mounts
		connectToBridge();

		return () => {
			serial.disconnect();
		};
	});
</script>

<div class="container">
	<div class="setup-card">
		<!-- Header -->
		<div class="header">
			<div class="header-left">
				<h2 class="title">Servo Setup</h2>
				<p class="subtitle">Please, connect your servo.</p>
			</div>
			<small class="status-badge">
				{servos.length} Servos paired
			</small>
		</div>

		<!-- Servo Illustration -->
		<hr class="divider" />
		<div class="illustration">
			<img src="/feetech_servo.svg" alt="Feetech Servo" />
		</div>
		<hr class="divider divider-top" />

		<!-- Settings Container -->
		<div class="settings-container">
			<!-- Instructions -->
			<div class="instructions">
				<div class="instructions-content">
					<h3>Instructions</h3>
					<p class="instructions-text">Make sure only one servo is connected at a time.</p>
				</div>
				<div class="instructions-icon icon-wrapper">
					<Icon icon="hugeicons:alert-square" color="var(--color-warning-500)" />
				</div>
			</div>

			<!-- COM Port Selection -->
			<SettingRow
				label="COM Port"
				icon="hugeicons:square-arrow-data-transfer-horizontal"
				bind:value={selectedPort}
				options={portOptions}
				disabled={isLoadingPorts}
				showRefresh={true}
				onRefresh={loadAvailablePorts}
			/>

			<!-- Baud Rate Selection -->
			<SettingRow
				label="Baud Rate"
				icon="hugeicons:square-arrow-data-transfer-horizontal"
				bind:value={selectedBaudRate}
				options={baudRateOptions}
			/>
		</div>

		<!-- Error Message -->
		{#if errorMessage}
			<div class="error-message">
				<Icon icon="hugeicons:alert-circle" color="var(--color-error-500)" />
				{errorMessage}
			</div>
		{/if}

		<!-- Connect Button -->
		<button
			class="connect-button h3"
			onclick={connectToPort}
			disabled={!selectedPort || isConnectingToPort}
		>
			{isConnectingToPort ? 'Connecting...' : 'Connect'}
		</button>
	</div>
</div>

<style>
	.container {
		max-width: 700px;
		margin: 0 auto;
		padding: var(--spacing-8);
		background: var(--color-grey-900);
		min-height: 100vh;
	}

	.setup-card {
		background: var(--color-grey-800);
		border-radius: var(--radius-lg);
		padding: var(--spacing-6) var(--spacing-6) var(--spacing-8) var(--spacing-6);
		border: 1px solid var(--color-grey-600);
	}

	/* Header */
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-4) var(--spacing-5) 0 var(--spacing-5);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.title {
		color: var(--color-grey-100);
	}

	.subtitle {
		color: var(--color-grey-500);
	}

	.status-badge {
		color: var(--color-grey-500);
		padding: var(--spacing-2) var(--spacing-4);
		background: transparent;
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	/* Divider */
	.divider {
		width: calc(100% + var(--spacing-12));
		height: 1px;
		border: none;
		background: var(--color-grey-600);
		margin: var(--spacing-8) calc(-1 * var(--spacing-6));
	}

	/* Servo Illustration */
	.illustration {
		width: 100%;
		padding: var(--spacing-8) var(--spacing-4);
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.illustration img {
		width: 100%;
		max-width: 300px;
		height: auto;
		filter: brightness(0) saturate(100%) invert(96%) sepia(2%) saturate(577%) hue-rotate(178deg) brightness(98%) contrast(94%);
	}

	/* Settings Container */
	.settings-container {
		margin-bottom: var(--spacing-6);
	}

	/* Instructions */
	.instructions {
		display: flex;
		gap: var(--spacing-8);
		padding: var(--spacing-6);
		background: var(--color-grey-700);
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-base);
		margin-bottom: var(--spacing-3);
	}

	.instructions-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		align-self: center;
	}

	.instructions-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.instructions-content h3 {
		color: var(--color-grey-100);
	}

	.instructions-text {
		color: var(--color-grey-500);
	}

	.icon-wrapper {
		width: var(--icon-base);
		height: var(--icon-base);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-wrapper :global(svg) {
		width: var(--icon-base) !important;
		height: var(--icon-base) !important;
	}

	/* Error Message */
	.error-message {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-3) var(--spacing-4);
		background: rgba(241, 71, 74, 0.1);
		border: 1px solid var(--color-error-500);
		border-radius: var(--radius-sm);
		color: var(--color-error-500);
		margin-bottom: var(--spacing-6);
	}

	/* Connect Button */
	.connect-button {
		width: 100%;
		height: 54px;
		background: var(--color-primary-500);
		border: none;
		border-radius: var(--radius-base);
		color: var(--color-grey-900);
		cursor: pointer;
		transition: all var(--transition-base);
	}

	.connect-button:hover:not(:disabled) {
		background: var(--color-primary-700);
	}

	.connect-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
