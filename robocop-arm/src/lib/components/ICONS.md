# Icons Usage Guide

This project uses **Iconify** with **Hugeicons** (free, stroke variant).

## Installation

Already installed via:
```bash
npm install @iconify/svelte @iconify-json/hugeicons
```

## Usage

### Basic Usage

```svelte
<script>
  import Icon from '$lib/components/Icon.svelte';
</script>

<Icon icon="hugeicons:home-01" />
```

### With Custom Size and Color

```svelte
<Icon
  icon="hugeicons:settings-01"
  size={24}
  color="rgb(0, 188, 125)"
/>
```

### With Design Tokens

```svelte
<script>
  import Icon from '$lib/components/Icon.svelte';
  import { colors } from '$lib/design-tokens';
</script>

<Icon
  icon="hugeicons:alert-circle"
  size={20}
  color={colors.error500}
/>
```

### With CSS Classes

```svelte
<Icon
  icon="hugeicons:checkmark-circle-01"
  class="my-custom-class"
/>

<style>
  :global(.my-custom-class) {
    margin-right: 8px;
  }
</style>
```

## Finding Icons

Browse all available Hugeicons at:
**https://icon-sets.iconify.design/hugeicons/**

All icons use the prefix `hugeicons:`

## Common Icons

Here are some commonly used icons:

### Navigation
- `hugeicons:home-01` - Home
- `hugeicons:settings-01` - Settings
- `hugeicons:menu-01` - Menu/Hamburger
- `hugeicons:arrow-left-01` - Back arrow
- `hugeicons:arrow-right-01` - Forward arrow

### Actions
- `hugeicons:add-01` - Add/Plus
- `hugeicons:delete-01` - Delete/Trash
- `hugeicons:edit-01` - Edit/Pencil
- `hugeicons:save-01` - Save
- `hugeicons:refresh` - Refresh/Reload
- `hugeicons:search-01` - Search

### Status
- `hugeicons:checkmark-circle-01` - Success/Check
- `hugeicons:alert-circle` - Warning/Alert
- `hugeicons:cancel-circle` - Error/Cancel
- `hugeicons:information-circle` - Info

### Media Controls
- `hugeicons:play` - Play
- `hugeicons:pause` - Pause
- `hugeicons:stop` - Stop
- `hugeicons:fast-forward` - Fast forward
- `hugeicons:fast-rewind` - Rewind

### Files & Documents
- `hugeicons:file-01` - File
- `hugeicons:folder-01` - Folder
- `hugeicons:download-01` - Download
- `hugeicons:upload-01` - Upload

### Communication
- `hugeicons:mail-01` - Email
- `hugeicons:notification-01` - Notification
- `hugeicons:message-01` - Message/Chat

### Hardware/Tech
- `hugeicons:usb-connected-01` - USB Connected
- `hugeicons:wifi` - WiFi
- `hugeicons:bluetooth` - Bluetooth
- `hugeicons:battery-full` - Battery
- `hugeicons:cpu` - Processor

## Examples in Context

### Button with Icon

```svelte
<button>
  <Icon icon="hugeicons:add-01" size={20} />
  Add Servo
</button>

<style>
  button {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
```

### Status Indicator

```svelte
<script>
  import Icon from '$lib/components/Icon.svelte';
  import { colors } from '$lib/design-tokens';

  let connected = $state(true);
</script>

<div class="status">
  {#if connected}
    <Icon icon="hugeicons:checkmark-circle-01" color={colors.primary500} />
    Connected
  {:else}
    <Icon icon="hugeicons:cancel-circle" color={colors.error500} />
    Disconnected
  {/if}
</div>
```

### Icon-only Button

```svelte
<button class="icon-button">
  <Icon icon="hugeicons:settings-01" size={24} />
</button>

<style>
  .icon-button {
    padding: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
</style>
```

## Performance Note

Iconify loads icons **on-demand** - only the icons you actually use are included in the bundle. This keeps the bundle size small even though the entire Hugeicons library is available.

## Icon Properties

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `string` | required | Icon name with prefix (e.g., "hugeicons:home-01") |
| `size` | `number \| string` | `24` | Icon size in pixels or CSS value |
| `color` | `string` | `'currentColor'` | Icon color (CSS color value) |
| `class` | `string` | `''` | Additional CSS classes |

## Tips

1. **Use currentColor**: By default, icons inherit the text color from parent elements
2. **Consistent sizing**: Stick to standard sizes (16, 20, 24, 32) for visual consistency
3. **Stroke variant**: All Hugeicons use stroke (outline) style for a clean, modern look
4. **Search tip**: Use the Iconify website to search for icons, then copy the full name

---

**Last Updated:** 2025-11-08
