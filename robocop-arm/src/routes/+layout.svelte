<script lang="ts">
	import '../app.css';
</script>

<div class="app">
	<header>
		<h1>RoboCop Arm Controller</h1>
		<p>Open Source Servo Control for LeRobot SO-101</p>
	</header>

	<main>
		<slot />
	</main>

	<footer>
		<p>Powered by Web Serial API | STS3215 Servos</p>
	</footer>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: #1a1a1a;
		color: #e0e0e0;
	}

	header {
		background: #2a2a2a;
		padding: 1.5rem 2rem;
		border-bottom: 2px solid #3a3a3a;
	}

	header h1 {
		margin: 0;
		font-size: 2rem;
		color: #4a9eff;
	}

	header p {
		margin: 0.5rem 0 0 0;
		color: #999;
		font-size: 0.9rem;
	}

	main {
		flex: 1;
		padding: 2rem;
	}

	footer {
		background: #2a2a2a;
		padding: 1rem 2rem;
		border-top: 2px solid #3a3a3a;
		text-align: center;
		color: #666;
		font-size: 0.85rem;
	}
</style>
