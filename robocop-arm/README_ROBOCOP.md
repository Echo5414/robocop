# RoboCop Arm Controller

Open source web-based controller for the Seeed Studio LeRobot SO-101 robotic arm using Feetech STS3215 servos.

## Features

- **Web Serial API Integration**: Direct serial communication from your browser
- **Real-time Servo Monitoring**: View live servo status including:
  - Position (current and goal)
  - Speed and load
  - Voltage and temperature
  - Current draw
  - Torque status
- **Multi-Servo Support**: Detect and monitor up to 6 servos simultaneously
- **TypeScript/Svelte**: Modern, type-safe codebase
- **No Backend Required**: Runs entirely in the browser

## Requirements

- **Browser**: Chrome or Edge (Web Serial API support required)
- **Hardware**: Seeed Studio LeRobot SO-101 arm with STS3215 servos
- **Connection**: USB serial connection to your robotic arm

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open your browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Connect Hardware**: Connect your LeRobot SO-101 arm via USB
2. **Open Application**: Launch the app in Chrome or Edge
3. **Connect to Serial Port**:
   - Click "Connect to Serial Port"
   - Select your COM port (e.g., COM13)
   - Ensure baud rate is set to 1000000
4. **Scan for Servos**: Click "Scan for Servos" to detect connected servos
5. **Monitor**: View real-time status of all detected servos

## Technical Details

### SCServo Protocol

This project implements the Feetech SCServo communication protocol for STS3215 servos:

- **Baud Rate**: 1000000 (default)
- **Communication**: Half-duplex asynchronous UART
- **Servo IDs**: 1-253
- **Position Resolution**: 4096 steps (0-4095)
- **Rotation Range**: 360°

### Project Structure

```
robocop-arm/
├── src/
│   ├── lib/
│   │   ├── scservo/          # SCServo protocol implementation
│   │   │   ├── protocol.ts   # Packet creation and parsing
│   │   │   ├── serial.ts     # Web Serial API service
│   │   │   └── index.ts      # Library exports
│   │   └── components/        # Svelte components
│   │       ├── ConnectionControl.svelte
│   │       └── ServoList.svelte
│   ├── routes/
│   │   ├── +layout.svelte    # App layout
│   │   └── +page.svelte      # Main page
│   ├── app.css               # Global styles
│   └── app.html              # HTML template
├── svelte.config.js
├── vite.config.ts
└── package.json
```

### Memory Map

Key memory addresses for STS3215 servos:

| Address | Parameter | R/W | Bytes |
|---------|-----------|-----|-------|
| 5 | ID | RW | 1 |
| 6 | Baud Rate | RW | 1 |
| 40 | Torque Enable | RW | 1 |
| 42 | Goal Position | RW | 2 |
| 56 | Present Position | R | 2 |
| 58 | Present Speed | R | 2 |
| 60 | Present Load | R | 2 |
| 62 | Present Voltage | R | 1 |
| 63 | Present Temperature | R | 1 |
| 69 | Present Current | R | 2 |

## Browser Compatibility

This application requires the **Web Serial API**, which is supported in:

- ✅ Chrome 89+
- ✅ Edge 89+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

## Future Enhancements

- [ ] Servo position control interface
- [ ] Movement recording and playback
- [ ] Custom movement sequences
- [ ] Torque control
- [ ] Configuration backup/restore
- [ ] Multiple servo synchronization
- [ ] Export telemetry data
- [ ] WebSocket remote control

## Contributing

This is an open source project! Contributions are welcome.

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- Feetech for the STS3215 servo specifications
- Seeed Studio for the LeRobot SO-101 arm
- Web Serial API specification
