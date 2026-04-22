# Node-RED COM Port (Serial Port) Configuration Guide

# Node-RED COM Port (Serial Port) Configuration Guide

Based on your request, here is a summary of how to read and manage COM/Serial port data in Node-RED.

## 1. Installation
To interact with serial ports, you need the **`node-red-node-serialport`** package.

- Open Node-RED.
- Go to the **Menu** (top right) -> **Manage palette**.
- Click the **Install** tab.
- Search for `node-red-node-serialport` and click **Install**.

## 2. Configuration Steps
Once installed, you will find new nodes in the **Network** category: `serial in`, `serial out`, and `serial-request`.

### Step 1: Drag "Serial In" to the Canvas
- Drag a `serial in` node onto your workspace.
- Double-click the node to open the configuration.

### Step 2: Configure the Port Settings
- Click the **pencil icon** next to the "Serial Port" field.
- **Serial Port**: Enter the port name (e.g., `COM3` on Windows or `/dev/ttyUSB0` on Linux). You can often use the search button to auto-detect available ports.
- **Baud Rate**: Match this to your hardware (e.g., 9600, 115200).
- **Data Bits, Parity, Stop Bits**: Ensure these match your device (common: 8, None, 1).
- **Control**: Specify how to parse incoming data (e.g., "split input" on a specific character like `\n`).

### Step 3: Deploy and Monitor
- Connect a **Debug** node to the output of your `serial in` node.
- Click **Deploy**.
- Check the **Debug sidebar** to see incoming raw data.

## 3. Best Practices
- **Permissions**: On Linux, ensure the user running Node-RED has permission to access serial ports (usually by adding to the `dialout` group).
- **Device Availability**: Ensure no other software (like a serial terminal) is using the port simultaneously.
- **Binary Data**: If your device sends binary data (non-ASCII), configure the node to output as a `Buffer` instead of a `String`.

---

> [!TIP]
> If you are using Node-RED for a specific device, always double-check the **Baud Rate** and **End-of-Line character** (CR/LF) in the device's documentation.
