<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { getContext, setContext, hasContext } from 'svelte';

	interface Props {
		label: string;
		icon: string;
		value: string;
		options?: Array<{ value: string; label: string }>;
		disabled?: boolean;
		onSelect?: (value: string) => void;
		onRefresh?: () => void;
		showRefresh?: boolean;
	}

	let {
		label,
		icon,
		value = $bindable(),
		options = [],
		disabled = false,
		onSelect,
		onRefresh,
		showRefresh = false
	}: Props = $props();

	// Get or create the dropdown manager context
	// Use a class with $state for proper Svelte 5 reactivity
	class DropdownManager {
		current = $state<string | null>(null);
	}

	let dropdownManager: DropdownManager;

	if (hasContext('dropdownManager')) {
		dropdownManager = getContext('dropdownManager');
	} else {
		dropdownManager = new DropdownManager();
		setContext('dropdownManager', dropdownManager);
	}

	// Generate unique ID for this dropdown
	const dropdownId = `dropdown-${Math.random().toString(36).substr(2, 9)}`;

	let isDropdownOpen = $derived(dropdownManager.current === dropdownId);

	let selectWrapperEl: HTMLDivElement;

	function toggleDropdown(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (!disabled && options.length > 0) {
			if (dropdownManager.current === dropdownId) {
				dropdownManager.current = null;
			} else {
				dropdownManager.current = dropdownId;
			}
		}
	}

	function selectOption(optionValue: string, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		value = optionValue;
		dropdownManager.current = null;
		if (onSelect) {
			onSelect(optionValue);
		}
	}

	function closeDropdown() {
		dropdownManager.current = null;
	}

	function handleClickOutside(event: MouseEvent) {
		if (isDropdownOpen && selectWrapperEl) {
			const target = event.target as HTMLElement;
			// Close only if clicking outside the select wrapper entirely
			if (!selectWrapperEl.contains(target)) {
				closeDropdown();
			}
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="setting-row">
	<div class="row-label">
		<span class="icon-wrapper">
			<Icon {icon} color="var(--color-grey-100)" />
		</span>
		<h3>{label}</h3>
	</div>
	<div class="row-controls">
		<div class="select-wrapper" bind:this={selectWrapperEl}>
			<!-- Custom Dropdown Button -->
			<button
				class="row-select"
				onclick={toggleDropdown}
				{disabled}
				type="button"
			>
				<span class="selected-text">
					{#if options.length === 0}
						No options available
					{:else if value}
						{@const option = options.find(opt => opt.value === value)}
						{option?.label || value}
					{:else}
						Select an option
					{/if}
				</span>
			</button>
			<span class="select-arrow icon-wrapper">
				<Icon icon="hugeicons:square-arrow-down-01" color="var(--color-grey-500)" />
			</span>

			<!-- Custom Dropdown Menu -->
			{#if isDropdownOpen}
				<div class="dropdown-menu">
					{#each options as option}
						<button
							class="dropdown-option"
							class:selected={value === option.value}
							onclick={(e) => selectOption(option.value, e)}
							type="button"
						>
							{option.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<!-- Icon Slot (always present for consistent alignment) -->
		<div class="icon-slot">
			{#if showRefresh && onRefresh}
				<button
					class="refresh-icon"
					onclick={onRefresh}
					{disabled}
					title="Refresh"
					type="button"
				>
					<span class="refresh-icon-inner icon-wrapper">
						<Icon icon="hugeicons:square-arrow-reload-01" color="currentColor" />
					</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Setting Row */
	.setting-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-8);
		padding: 0 var(--spacing-6);
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
		gap: var(--spacing-6);
		flex: 1;
		align-items: center;
	}

	.select-wrapper {
		position: relative;
		flex: 1;
	}

	.row-select {
		width: 100%;
		height: 42px;
		padding: 0 var(--spacing-12) 0 var(--spacing-6);
		background: var(--color-grey-800);
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-input);
		color: var(--color-grey-100);
		font-family: var(--font-family);
		font-size: 14px;
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		text-align: left;
	}

	.selected-text {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + var(--spacing-2));
		left: 0;
		right: 0;
		background: var(--color-grey-800);
		border: 1px solid var(--color-grey-600);
		border-radius: var(--radius-input);
		max-height: 200px;
		overflow-y: auto;
		z-index: var(--z-dropdown);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

		/* Hide scrollbar */
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE and Edge */
	}

	.dropdown-menu::-webkit-scrollbar {
		display: none; /* Chrome, Safari, Opera */
	}

	.dropdown-option {
		width: 100%;
		padding: var(--spacing-4) var(--spacing-6);
		background: var(--color-grey-800);
		border: none;
		color: var(--color-grey-100);
		font-family: var(--font-family);
		font-size: 14px;
		font-weight: var(--font-weight-medium);
		text-align: left;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.dropdown-option:hover {
		background: var(--color-grey-700);
	}

	.dropdown-option.selected {
		background: var(--color-primary-500);
		color: var(--color-grey-900);
	}

	.select-arrow {
		position: absolute;
		right: var(--spacing-6);
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
	}

	.row-select:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.row-select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.icon-slot {
		width: var(--icon-base);
		height: var(--icon-base);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.refresh-icon {
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-grey-500);
		transition: color var(--transition-base);
	}

	.refresh-icon:hover:not(:disabled) {
		color: var(--color-grey-100);
	}

	.refresh-icon:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.refresh-icon-inner {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
