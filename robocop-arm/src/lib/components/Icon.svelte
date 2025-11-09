<script lang="ts">
	/**
	 * Icon component using Iconify with Hugeicons
	 *
	 * Usage:
	 *   <Icon icon="hugeicons:home-01" />
	 *   <Icon icon="hugeicons:settings-01" size={24} color="rgb(0, 188, 125)" />
	 *
	 * Find icons at: https://icon-sets.iconify.design/hugeicons/
	 * All Hugeicons use the prefix "hugeicons:"
	 */

	import IconifyIcon from '@iconify/svelte';

	interface Props {
		icon: string;
		size?: number | string;
		color?: string;
		class?: string;
	}

	let { icon, size = 24, color = 'currentColor', class: className = '' }: Props = $props();
</script>

<IconifyIcon
	{icon}
	width={size}
	height={size}
	style="color: {color};"
	class={className}
/>
