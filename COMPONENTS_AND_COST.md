# Centrifuge Prototype - Components, Cost Estimation & Hardware Guide

This document provides a complete guide on components, alternative choices, budget breakdown, hardware wiring, and operational workflow for building a working 10,000 RPM centrifuge prototype.

---

## 1. Required Components & Cost Estimation

| # | Component Name | Function / Purpose | Recommended Specification | Alternative Option | Estimated Cost (INR ₹) | Estimated Cost (USD $) |
|---|----------------|-------------------|---------------------------|--------------------|------------------------|------------------------|
| **1** | **Microcontroller** | System brain, wireless web server, sensor reading & PWM control | **ESP32 Dev Module** (Wi-Fi + Bluetooth + Hardware PWM) | Arduino Uno / Nano + HC-05 BT module | ₹350 - ₹450 | $4.50 - $5.50 |
| **2** | **Motor** | High RPM centrifuge rotor driving | **A2212 1000KV or 1400KV Brushless BLDC Motor** | 775 High-Speed DC Motor (12V 10000RPM) with MOSFET | ₹400 - ₹550 | $5.00 - $7.00 |
| **3** | **Motor Driver** | Converts PWM control signals to high current motor power | **30A Electronic Speed Controller (ESC)** for BLDC | IRF520 / High Power MOSFET Module (for 775 DC motor) | ₹300 - ₹420 | $4.00 - $5.50 |
| **4** | **Speed Sensor** | Tachometer to measure live RPM | **LM393 Optical IR Speed Sensor Module** + Encoder Disk | A3144 Hall Effect Sensor + Neodymium Magnet | ₹60 - ₹100 | $0.80 - $1.30 |
| **5** | **Safety Switch** | Physical Lid Interlock switch | **Lever Micro Switch (NO/NC)** | Magnetic Reed Switch | ₹30 - ₹60 | $0.40 - $0.80 |
| **6** | **Power Supply** | Powers motor and ESP32 electronics | **12V 5A DC Power Adapter / SMPS** | 3S 11.1V LiPo Battery (1500mAh+) | ₹450 - ₹700 | $5.50 - $8.50 |
| **7** | **Physical Body & Rotor** | Holds micro-centrifuge tubes (1.5mL / 2mL) | **3D Printed PLA Rotor & Enclosure** (4-6 tube capacity) | Acrylic base + 3D printed rotor hub | ₹300 - ₹500 | $4.00 - $6.50 |
| **8** | **Wiring & Accessories** | Connection wires, safety fuse, E-stop switch | Jumper wires, 10A fuse & holder, breadboard/perfboard | Screw terminal block, DC Jack | ₹150 - ₹250 | $2.00 - $3.00 |
| **TOTAL** | | | **Complete Functional Centrifuge Rig** | | **₹2,040 - ₹3,030** | **$26.20 - $38.60** |

---

## 2. Hardware Wiring Diagram & Pinout

### ESP32 Pin Connections
- **ESC Signal (PWM)**: Connect to **GPIO 15** (Pulse width 1000µs - 2000µs at 50Hz).
- **Lid Safety Switch**: Connect one pin to **GPIO 19**, other pin to **GND** (Internal Pull-Up enabled).
- **RPM Tachometer Sensor**: Connect signal out pin to **GPIO 18** (Hardware Interrupt pin).
- **Status LED / Buzzer (Optional)**: Connect to **GPIO 4**.
- **Common GND**: Connect ESP32 GND, ESC Power GND, Power Supply GND together!

### Safety Hardware Interlock (Crucial!)
To strictly ensure the phone/web app **cannot bypass physical safety**:
- Wire the **Lid Limit Switch** inline with the ESC signal line or ESC power enable.
- When the lid is open, the signal/power circuit is physically broken, preventing motor rotation regardless of any software command sent from web/phone.

---

## 3. Communication Alternatives & Workflow Comparison

### Option A: Wi-Fi WebSocket Server (Recommended & Implemented)
- **How it works**: ESP32 creates a Wi-Fi Access Point (`ESP32-Centrifuge`) or connects to local Wi-Fi. The Web Dashboard is served directly by ESP32 or hosted locally in browser. WebSocket connection provides bidirectional real-time data flow (10 updates/sec).
- **Pros**: Totally wireless, works on any device (Mobile, Tablet, Laptop) without apps.
- **Cons**: Requires connecting to ESP32 Wi-Fi network.

### Option B: Web Serial API (USB Plug & Play)
- **How it works**: Connect ESP32 via USB cable to Chrome/Edge browser. Web browser talks directly to COM port using `navigator.serial`.
- **Pros**: Instant plug & play, zero network setup, works offline effortlessly.
- **Cons**: Requires wired USB connection.

---

## 4. Software Features Included in this Repository

1. **Modern Minimalist Single-Dashboard Web UI (`index.html`, `style.css`, `app.js`)**:
   - Live RPM chart (0 - 10,000 RPM).
   - Speed control (+50, +100, -50, -100 quick adjustment buttons & slider).
   - Timer countdown with automatic soft stop.
   - Quick Actions: **START**, **PAUSE**, **STOP**, **EMERGENCY BREAK**.
   - Safety Indicators: Lid Status (CLOSED/OPEN), Motor Status, Connectivity.
   - Real-time Activity Logs.
   - Built-in **Simulation / Demo Mode** for testing in browser without hardware.

2. **ESP32 Firmware (`esp32_centrifuge.ino`)**:
   - Servo library motor speed ramping (Soft Start & Controlled Stop).
   - Hardware interrupt tachometer calculation.
   - Wi-Fi AP + WebSockets + WebServer + Serial command parser.
   - Immediate motor PWM shutoff on Emergency Stop command or Lid open detection.
