<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	const tabs = [
		{ label: 'Servo Setup', href: '/' },
		{ label: 'Calibration', href: '/calibration' },
		{ label: 'Visualization', href: '/visualization' }
	];
</script>

<div class="app">
	<header>
		<h1 class="logo">robodesk</h1>
		<nav class="tabs">
			{#each tabs as tab}
				<a
					href={tab.href}
					class="tab"
					class:active={$page.url.pathname === tab.href}
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</header>

	<main>
		<slot />
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--color-grey-900);
		color: var(--color-grey-100);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--spacing-12);
		padding: var(--spacing-6) var(--spacing-8);
		background: var(--color-grey-900);
	}

	.logo {
		color: var(--color-primary-500);
	}

	.tabs {
		font-weight: var(--font-weight-medium);
		display: flex;
		gap: var(--spacing-8);
	}

	.tab {
		color: var(--color-grey-500);
		text-decoration: none;
		transition: color var(--transition-base);
		cursor: pointer;
		padding: var(--spacing-2) 0;
	}

	.tab:hover {
		color: var(--color-grey-100);
	}

	.tab.active {
		color: var(--color-grey-100);
	}

	main {
		flex: 1;
		padding: 0;
	}
</style>
