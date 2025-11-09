<script lang="ts">
	import { WebSocketSerial } from '$lib/scservo/websocket-serial';
	import type { ServoInfo } from '$lib/scservo/websocket-serial';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import InputRow from '$lib/components/InputRow.svelte';
    import { setContext } from 'svelte';

    // Provide a shared dropdown manager so only one dropdown can be open at a time
    class DropdownManager { current = $state<string | null>(null); }
    const dropdownManager = new DropdownManager();
    setContext('dropdownManager', dropdownManager);

	let serial = $state<WebSocketSerial>(new WebSocketSerial());
	let availablePorts = $state<any[]>([]);
	let selectedPort = $state<string>('');
	let selectedBaudRate = $state<string>('auto');
	let isLoadingPorts = $state(false);
	let isConnectingToPort = $state(false);
	let servos = $state<ServoInfo[]>([]);
	let errorMessage = $state('');
	let isPortConnected = $state(false);

	// Servo configuration state
	let isConfiguringServo = $state(false);
	let detectedServoId = $state<number | null>(null);
	let configServoId = $state('');
	let configAmax = $state('');
	let additionalParameters = $state<Array<{id: string, name: string, value: string}>>([]);

	// Baud rate options
	const baudRateOptions = [
		{ value: 'auto', label: 'Auto-Discovery' },
		{ value: '1000000', label: '1000000' },
		{ value: '115200', label: '115200' },
		{ value: '57600', label: '57600' },
		{ value: '9600', label: '9600' }
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
			// Save last used port
			localStorage.setItem('lastSerialPort', selectedPort);

			let foundIds: number[] = [];
			let detectedBaud: number = 1000000;

			if (selectedBaudRate === 'auto') {
				// Multi-baud auto-discovery
				const result = await serial.scanServosMultiBaud(selectedPort, 16);

				if (result && result.foundIds.length > 0) {
					foundIds = result.foundIds;
					detectedBaud = result.baudRate;
					// Update baud rate dropdown to show detected value
					selectedBaudRate = result.baudRate.toString();
				}
			} else {
				// Manual baud rate - use single baud
				await serial.selectPort(selectedPort, parseInt(selectedBaudRate));
				foundIds = await serial.scanServos(16);
				detectedBaud = parseInt(selectedBaudRate);
			}

			if (foundIds.length > 0) {
				// Mark port as connected
				isPortConnected = true;

				// Found a servo - show configuration card
				detectedServoId = foundIds[0];
				configServoId = foundIds[0].toString();
				configAmax = '254'; // Default Amax value
				additionalParameters = []; // Start with no additional parameters
				isConfiguringServo = true;
			} else {
				errorMessage = 'No servos detected. Please check connections and ensure only ONE servo is connected.';
			}
		} catch (error) {
			errorMessage = `Failed to connect to ${selectedPort}: ${error}`;
			console.error(error);
		} finally {
			isConnectingToPort = false;
		}
	}

	function addParameter() {
		// For now, only Temperature Limit is available
		if (!additionalParameters.find(p => p.id === 'temp_limit')) {
			additionalParameters = [
				...additionalParameters,
				{ id: 'temp_limit', name: 'Temperature Limit', value: '' }
			];
		}
	}

	function removeParameter(id: string) {
		additionalParameters = additionalParameters.filter(p => p.id !== id);
	}

	async function confirmServoConfig() {
		errorMessage = '';

		try {
			const newId = parseInt(configServoId);
			const amaxValue = parseInt(configAmax);

			if (isNaN(newId) || newId < 0 || newId > 253) {
				errorMessage = 'Servo ID must be between 0 and 253';
				return;
			}

			if (isNaN(amaxValue) || amaxValue < 0 || amaxValue > 254) {
				errorMessage = 'Amax must be between 0 and 254';
				return;
			}

			// Write new ID to servo if changed
			if (newId !== detectedServoId) {
				await serial.writeServoId(detectedServoId!, newId);
			}

			// Write Amax value to servo
			await serial.writeAmax(newId, amaxValue);

			// Add configured servo to the list
			const info = await serial.getServoInfo(newId);
			servos = [...servos, info];

			// Disconnect from port to prepare for next device
			await serial.disconnectPort();

			// Reset configuration state
			isConfiguringServo = false;
			isPortConnected = false;
			detectedServoId = null;
			configServoId = '';
			configAmax = '';
			additionalParameters = [];
		} catch (error) {
			errorMessage = `Failed to configure servo: ${error}`;
			console.error(error);
		}
	}

	async function disconnectFromPort() {
		try {
			// Only disconnect from port, keep bridge connection alive
			await serial.disconnectPort();
			// Reset state
			isPortConnected = false;
			isConfiguringServo = false;
			detectedServoId = null;
			configServoId = '';
			configAmax = '';
			additionalParameters = [];
			servos = [];
			errorMessage = '';
		} catch (error) {
			errorMessage = `Failed to disconnect: ${error}`;
			console.error(error);
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
	{#if !isConfiguringServo}
		<!-- Connection Card -->
		<div class="setup-card">
		<!-- Header -->
		<div class="header">
			<div class="header-left">
				<h2 class="title">Servo Setup</h2>
				<p class="subtitle">Please, connect your servo.</p>
			</div>
			<div class="header-badges">
				<small class="status-badge">
					{servos.length} Servos paired
				</small>
				{#if isPortConnected}
					<button class="disconnect-badge" onclick={disconnectFromPort} type="button">
						Disconnect
					</button>
				{/if}
			</div>
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

		<!-- Pair Device Button -->
		<button
			class="connect-button h3"
			onclick={connectToPort}
			disabled={!selectedPort || isConnectingToPort}
		>
			{isConnectingToPort ? 'Connecting...' : 'Pair Device'}
		</button>
	</div>
	{:else}
		<!-- Servo Configuration Card -->
		<div class="setup-card">
			<!-- Header -->
			<div class="header">
				<div class="header-left">
					<h2 class="title">Setup Servo</h2>
					<p class="subtitle">Found servo with factory ID: {detectedServoId}</p>
				</div>
				<div class="header-badges">
					<small class="status-badge">
						{servos.length} Servos paired
					</small>
					{#if isPortConnected}
						<button class="disconnect-badge" onclick={disconnectFromPort} type="button">
							Disconnect
						</button>
					{/if}
				</div>
			</div>

			<hr class="divider" />

			<!-- Configuration Container -->
			<div class="settings-container">
				<!-- Servo ID Input (required) -->
				<InputRow
					label="Servo ID"
					icon="hugeicons:square-arrow-data-transfer-horizontal"
					bind:value={configServoId}
					type="number"
					removable={false}
				/>

				<!-- Amax Input (required) -->
				<InputRow
					label="Amax"
					icon="hugeicons:square-arrow-data-transfer-horizontal"
					bind:value={configAmax}
					type="number"
					removable={false}
				/>

				<!-- Additional Parameters (removable) -->
				{#each additionalParameters as param (param.id)}
					<InputRow
						label={param.name}
						icon="hugeicons:square-arrow-data-transfer-horizontal"
						bind:value={param.value}
						placeholder="60"
						removable={true}
						onRemove={() => removeParameter(param.id)}
					/>
				{/each}

				<!-- Add Parameter Row -->
				<button class="add-parameter-row" onclick={addParameter} type="button">
					<div class="add-parameter-label">
						<span class="icon-wrapper add-icon">
							<Icon icon="hugeicons:add-square" color="var(--color-primary-500)" />
						</span>
						<h3 style="color: var(--color-primary-500);">Add Parameter</h3>
					</div>
					<div class="icon-slot"></div>
				</button>
			</div>

			<!-- Error Message -->
			{#if errorMessage}
				<div class="error-message">
					<Icon icon="hugeicons:alert-circle" color="var(--color-error-500)" />
					{errorMessage}
				</div>
			{/if}

			<!-- Confirm Button -->
			<button class="connect-button h3" onclick={confirmServoConfig}>
				Confirm
			</button>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 640px;
		margin: 0 auto;
		padding: var(--spacing-8);
		background: var(--color-grey-900);
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.setup-card {
		background: var(--color-grey-800);
		border-radius: var(--radius-lg);
		padding: var(--spacing-6) var(--spacing-6) var(--spacing-8) var(--spacing-6);
		border: 1px solid var(--color-grey-600);
		width: 100%;
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

	.header-badges {
		display: flex;
		gap: var(--spacing-2);
		align-items: center;
	}

	.status-badge {
		color: var(--color-grey-500);
		padding: var(--spacing-2) var(--spacing-4);
		background: transparent;
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.disconnect-badge {
		color: var(--color-error-500);
		padding: var(--spacing-2) var(--spacing-4);
		background: transparent;
		border: 1px solid var(--color-error-500);
		border-radius: var(--radius-full);
		white-space: nowrap;
		cursor: pointer;
		transition: all var(--transition-base);
		font-size: 11px;
		font-weight: 400;
	}

	.disconnect-badge:hover {
		background: rgba(241, 71, 74, 0.1);
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

	/* Add Parameter Row */
	.add-parameter-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-8);
		padding: 0 var(--spacing-8);
		height: 54px;
		background: transparent;
		border: none;
		border-radius: var(--radius-base);
		margin-bottom: var(--spacing-3);
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: background var(--transition-base);
	}

	.add-parameter-row:hover {
		background: rgba(0, 188, 125, 0.05);
	}

	.add-parameter-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-4);
		min-width: 120px;
	}

	.icon-slot {
		width: var(--icon-base);
		height: var(--icon-base);
		flex-shrink: 0;
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
		background: var(--color-primary-400);
	}

	.connect-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
