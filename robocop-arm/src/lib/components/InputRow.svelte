<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		label: string;
		icon: string;
		value: string;
		placeholder?: string;
		removable?: boolean;
		onRemove?: () => void;
		type?: 'text' | 'number';
	}

	let {
		label,
		icon,
		value = $bindable(),
		placeholder = '',
		removable = false,
		onRemove,
		type = 'text'
	}: Props = $props();

	let isHoveringRemove = $state(false);
</script>

<div class="input-row">
	<div class="row-label">
		<span class="icon-wrapper">
			<Icon {icon} color="var(--color-grey-100)" />
		</span>
		<h3>{label}</h3>
	</div>
	<div class="row-controls">
		<input
			bind:value
			{placeholder}
			{type}
			class="row-input"
		/>
		<!-- Icon Slot (always present for consistent alignment) -->
		<div class="icon-slot">
			{#if removable && onRemove}
				<button
					class="remove-icon"
					onclick={onRemove}
					onmouseenter={() => isHoveringRemove = true}
					onmouseleave={() => isHoveringRemove = false}
					title="Remove"
					type="button"
				>
					<span class="remove-icon-inner icon-wrapper">
						<Icon
							icon="hugeicons:cancel-01"
							color={isHoveringRemove ? 'var(--color-error-500)' : 'var(--color-grey-500)'}
						/>
					</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Input Row */
	.input-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-8);
		padding: 0 var(--spacing-8);
		height: 54px;
		background: var(--color-grey-700);
		border-radius: var(--radius-base);
		border: 1px solid var(--color-grey-600);
		margin-bottom: var(--spacing-3);
	}

	.row-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-4);
		color: var(--color-grey-100);
		min-width: 120px;
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

	.row-controls {
		display: flex;
		gap: var(--spacing-4);
		flex: 1;
		align-items: center;
	}

	.row-input {
		flex: 1;
		height: 42px;
		padding: 0 var(--spacing-6);
		background: var(--color-grey-800);
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-input);
		color: var(--color-grey-100);
		font-family: var(--font-family);
		font-size: 14px;
		font-weight: var(--font-weight-medium);
	}

	.row-input::placeholder {
		color: var(--color-grey-500);
	}

	.row-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.icon-slot {
		width: var(--icon-base);
		height: var(--icon-base);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.remove-icon {
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color var(--transition-base);
	}

	.remove-icon-inner {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
