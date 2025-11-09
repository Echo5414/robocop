<script lang="ts">
	import { SCServoSerial } from '$lib/scservo';
	import ConnectionControl from '$lib/components/ConnectionControl.svelte';
	import ServoList from '$lib/components/ServoList.svelte';
	import { onMount } from 'svelte';

	let serial = $state<SCServoSerial>(new SCServoSerial());
	let isConnected = $state(false);
	let servoListComponent = $state<any>(null);

	function handleConnected() {
		isConnected = true;
	}

	function handleDisconnected() {
		isConnected = false;
	}

	onMount(() => {
		// Check Web Serial API support on mount
		if (!SCServoSerial.isSupported()) {
			console.warn('Web Serial API is not supported');
		}
	});
</script>

<svelte:head>
	<title>RoboCop Arm Controller</title>
</svelte:head>

<div class="container">
	<ConnectionControl
		{serial}
		onConnected={handleConnected}
		onDisconnected={handleDisconnected}
	/>

	{#if isConnected}
		<ServoList bind:this={servoListComponent} {serial} />
	{:else}
		<div class="connection-prompt">
			<div class="prompt-icon">🔌</div>
			<h2>Connect to get started</h2>
			<p>
				Click "Connect to Serial Port" above and select your serial device.<br />
				Make sure your LeRobot SO-101 arm is connected and powered on.
			</p>
			<div class="instructions">
				<h3>Instructions:</h3>
				<ol>
					<li>Connect your LeRobot SO-101 arm via USB</li>
					<li>Click the "Connect to Serial Port" button above</li>
					<li>Select the correct COM port (e.g., COM13)</li>
					<li>Make sure baud rate is set to 1000000</li>
					<li>Once connected, click "Scan for Servos" to detect your servos</li>
				</ol>
			</div>
			<div class="note">
				<strong>Note:</strong> This application requires a Chromium-based browser (Chrome, Edge)
				as it uses the Web Serial API.
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 1400px;
		margin: 0 auto;
	}

	.connection-prompt {
		background: #2a2a2a;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		padding: 3rem;
		text-align: center;
	}

	.prompt-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.connection-prompt h2 {
		margin: 0 0 1rem 0;
		color: #e0e0e0;
		font-size: 1.75rem;
	}

	.connection-prompt p {
		color: #999;
		line-height: 1.6;
		margin-bottom: 2rem;
	}

	.instructions {
		background: #1a1a1a;
		border: 1px solid #3a3a3a;
		border-radius: 6px;
		padding: 1.5rem;
		margin: 2rem auto;
		max-width: 600px;
		text-align: left;
	}

	.instructions h3 {
		margin: 0 0 1rem 0;
		color: #4a9eff;
		font-size: 1.1rem;
	}

	.instructions ol {
		margin: 0;
		padding-left: 1.5rem;
		color: #ccc;
		line-height: 1.8;
	}

	.instructions li {
		margin-bottom: 0.5rem;
	}

	.note {
		background: #2a3a1f;
		border: 1px solid #4caf50;
		border-radius: 4px;
		padding: 1rem;
		margin-top: 2rem;
		color: #a5d6a7;
		font-size: 0.9rem;
		max-width: 600px;
		margin-left: auto;
		margin-right: auto;
	}

	.note strong {
		color: #4caf50;
	}
</style>
