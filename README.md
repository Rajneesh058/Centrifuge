# Centrifuge Prototype & Controller Project
> **A Beginner-Friendly, Non-Technical Complete Guide for College Projects (B. Pharma / Pharmacy / Engineering)**

---

## 💡 1. What is a Centrifuge and Why Did We Build This?

### What is a Centrifuge?
In pharmaceutical, medical, and chemistry labs, a **centrifuge** is a machine that spins liquid samples (like blood, chemical solutions, or cell suspensions) at very high speeds. 
Because of **centrifugal force**, heavier particles settle down at the bottom of the test tube (called a *pellet*), while lighter liquid stays on top (called the *supernatant*).

### Why this Prototype?
Commercial lab centrifuges can be very expensive (ranging from $500 to $3,000+). This project demonstrates a **working, low-cost prototype** built for college demonstrations. 
It features:
- High speed capability (up to **10,000 RPM**).
- A clean, modern **digital screen controller** on your phone, laptop, or tablet.
- **Physical Safety Locks** so it never spins when the lid is open.
- **Dual Wireless + USB Cable Safety Net** so it never stops unexpectedly during an experiment!

---

## 🌀 2. How Does It Work? (Simple Diagram)

```
 [ Your Laptop / Mobile Phone ]
      |                 |
(Wi-Fi Wireless)     (USB Cable)   <-- DUAL SAFETY LINK (If one drops, other takes over!)
      |                 |
      v                 v
   +-----------------------+
   |   ESP32 Microchip     |  <-- The "Brain" of the machine
   +-----------------------+
        |             |
  (Pushes Power)  (Checks Lid)
        |             |
        v             v
   [ Motor Driver ] [ Lid Safety Switch ] (Physical Lock: Motor CANNOT spin if lid is open!)
        |
        v
   [ High Speed Motor + Spinning Tube Rotor ]
```

---

## 🛠️ 3. Component Checklist & Simple Explanation

Here is what each part does in plain language:

| Part Name | Simple Explanation | What it Does in the Machine |
| :--- | :--- | :--- |
| **ESP32 Board** | The Microchip / "Brain" | Receives commands from your phone/laptop and controls the motor speed. |
| **BLDC Motor** | High-Speed Motor | Spins the test tube rotor up to 10,000 revolutions per minute. |
| **ESC Motor Driver** | Power Regulator | Translates low-voltage signals from the brain into high-power currents for the motor. |
| **Optical Speed Sensor** | Tachometer / Speedometer | Counts how fast the rotor is actually spinning and shows live RPM on the screen. |
| **Lid Limit Switch** | Physical Safety Lock | A mechanical lever switch on the lid. If the lid is open, it physically breaks the power circuit so no accidents can happen. |
| **12V Power Adapter** | Wall Charger / Power Source | Provides 12 Volts of electricity to power the motor and electronics. |
| **3D Printed Rotor** | Test Tube Holder | The plastic disc with angled holes that holds 4 to 6 micro-centrifuge tubes (1.5mL / 2mL). |

---

## 📡 4. Dual Communication (Wi-Fi + USB Cable) Explained

To make sure your project presentation never fails due to network issues, this prototype uses **Dual Integrated Communication**:

1. **Wireless Mode (Wi-Fi)**: The machine creates its own Wi-Fi network (`ESP32-Centrifuge`). You can connect your phone or laptop wirelessly without any wires.
2. **Wired Mode (USB Cable)**: You can plug a USB cable directly from the machine into your laptop's USB port.
3. **Auto-Failover Protection**: Both connections work **at the exact same time**. If someone disconnects the Wi-Fi or unplugged the USB cable, the other channel takes over automatically without stopping your experiment!

---

## 🚀 5. Step-by-Step Operating Guide (How to Run It)

### Step 1: Power On
1. Plug the 12V Power Adapter into the wall socket and connect it to the machine.
2. Ensure the lid is firmly closed.

### Step 2: Open the Control Dashboard
- **Option A (Offline / Browser Test)**: Double click [`index.html`](file:///d:/Coding/Projects/robotics/Centrifuge/index.html) on your laptop. Select **Dual Link** or **Simulation Mode**.
- **Option B (Wireless)**: On your phone/laptop, join the Wi-Fi network named `ESP32-Centrifuge` (Password: `centrifuge123`). Open your browser and go to `http://192.168.4.1`.
- **Option C (USB Cable)**: Plug the USB cable into your laptop, open [`index.html`](file:///d:/Coding/Projects/robotics/Centrifuge/index.html) in Chrome or Edge, select **Dual Link**, and click **Connect**.

### Step 3: Run an Experiment
1. Place balanced test tubes inside the rotor (always place equal weights opposite each other!).
2. Close the lid. (Notice the screen badge change to green `LID: CLOSED`).
3. Set your target speed (e.g., 3,500 RPM) using the quick buttons (`+50`, `+100`, or presets).
4. Set the Run Timer (e.g., 3 minutes).
5. Click **START**. The machine will smoothly ramp up speed to your target RPM while showing a live graph.
6. When the timer finishes, the machine will automatically perform a **Soft Stop** (smoothly slowing down).

### Step 4: Emergency Stop
If anything goes wrong, press the big red **EMERGENCY BREAK** button on the screen. The power will instantly cut off and active braking will stop the motor in seconds.

---

## 🛡️ 6. Important Safety Rules for Students

1. **Always Balance Your Tubes**: Never run the centrifuge with only 1 tube! Always put a tube of equal water volume directly opposite it. Unbalanced loads cause shaking.
2. **Never Force open the Lid**: The machine has a physical lock switch that cuts power if opened, but always wait for the motor to come to a complete stop (0 RPM) before taking out your samples.
3. **Keep on a Flat Surface**: Always place the machine on a sturdy, flat table.

---

## 🎓 7. College Viva / Presentation Q&A Cheatsheet

When teachers or judges ask questions about your project, here are simple answers you can give:

- **Q: What is the maximum speed of this centrifuge?**
  - *Answer*: Up to 10,000 RPM (Revolutions Per Minute), controlled in precise steps of 50 or 100 RPM.
- **Q: What safety features are built into this machine?**
  - *Answer*: It has a physical Lid Safety Switch (motor will not turn on if lid is open), a digital Emergency Brake button, smooth soft-start acceleration to prevent tube splashing, and automatic timer cutoff.
- **Q: How does the computer talk to the centrifuge?**
  - *Answer*: It uses a Dual Redundant Link: both wireless Wi-Fi WebSockets and wired USB Serial work concurrently. If one network drops, the other automatically keeps running without resetting the machine.
- **Q: How does it measure the actual RPM?**
  - *Answer*: An optical IR sensor counts how many times the motor rotor turns per second using hardware interrupts on the ESP32 microchip.

---

## 📁 Project File Directory

- [`index.html`](file:///d:/Coding/Projects/robotics/Centrifuge/index.html): The visual screen dashboard.
- [`style.css`](file:///d:/Coding/Projects/robotics/Centrifuge/style.css): The modern dark design stylesheet.
- [`app.js`](file:///d:/Coding/Projects/robotics/Centrifuge/app.js): The logic engine & dual connection manager.
- [`esp32_centrifuge.ino`](file:///d:/Coding/Projects/robotics/Centrifuge/esp32_centrifuge.ino): The microcontroller code for Arduino IDE.
- [`COMPONENTS_AND_COST.md`](file:///d:/Coding/Projects/robotics/Centrifuge/COMPONENTS_AND_COST.md): List of parts and cost breakdown.
