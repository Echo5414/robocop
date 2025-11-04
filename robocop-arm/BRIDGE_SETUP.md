# Serial Bridge Setup

## Why do we need a bridge?

The **Web Serial API** has limitations when working with half-duplex serial communication required by the Seeed XIAO Servo Adaptor Board. The bridge server solves this by:

1. Running as a local Node.js server
2. Handling serial communication with proper half-duplex support
3. Exposing a WebSocket interface that the web app connects to

## Quick Start

### 1. Start the Bridge Server

Open a terminal and run:

```bash
cd robocop-arm
npm run bridge
```

You should see:

```
=== SCServo Serial Bridge Server ===

✓ Serial port COM13 opened at 1000000 baud
✓ WebSocket server listening on ws://localhost:8080

✓ Bridge server ready!
  Serial: COM13 @ 1000000 baud
  WebSocket: ws://localhost:8080

Waiting for web client connections...
```

### 2. Start the Web App

In **another terminal**, run:

```bash
cd robocop-arm
npm run dev
```

### 3. Use the App

1. Open http://localhost:5173 in Chrome/Edge
2. The app will automatically connect to the bridge
3. Click "Scan for Servos" to detect your servos
4. View real-time servo data!

## Troubleshooting

### "Failed to open serial port"

- Make sure COM13 is the correct port
- Close FT ScServo Debug if it's running
- Check that the XIAO board is connected

### "WebSocket connection failed"

- Make sure the bridge server is running (`npm run bridge`)
- Check that port 8080 is not in use by another program

### Edit COM Port

If your servos are on a different port, edit `bridge-server.js`:

```javascript
const SERIAL_PORT = 'COM13';  // Change this to your port
```

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     Serial
│                 │ ←──────────────────→│                  │ ←────────────→
│   Web Browser   │   ws://localhost    │  Bridge Server   │   COM13 @ 1M
│  (Svelte App)   │       :8080         │   (Node.js)      │     baud
│                 │                     │                  │
└─────────────────┘                     └──────────────────┘
                                               ↓
                                        ┌──────────────────┐
                                        │  XIAO Servo      │
                                        │  Adaptor Board   │
                                        └──────────────────┘
                                               ↓
                                        ┌──────────────────┐
                                        │  STS3215 Servos  │
                                        │   (ID 1-6)       │
                                        └──────────────────┘
```

## Benefits

✅ Works with half-duplex hardware
✅ No browser compatibility issues
✅ Better serial port control
✅ Can run on remote server if needed
✅ Detailed logging for debugging
