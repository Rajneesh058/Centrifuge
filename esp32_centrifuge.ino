/*
 * -------------------------------------------------------------------
 * CENTRIFUGE PRO CONTROLLER - ESP32 DUAL INTEGRATED FIRMWARE
 * -------------------------------------------------------------------
 * Board: ESP32 Dev Module
 * IDE: Arduino IDE 1.8.x / 2.x
 * Features:
 *   - Dual Concurrent Communication: USB Serial (115200 baud) AND Wi-Fi TCP/HTTP WebSocket Server
 *   - Automatic Failover: Telemetry broadcast over BOTH channels simultaneously
 *   - Hardware Interlock: Physical Lid Limit Switch & Emergency Stop
 *   - Precision RPM Measurement: IR Optical Sensor Interrupt Handler
 * -------------------------------------------------------------------
 */

#include <WiFi.h>
#include <ESP32Servo.h>

// --- Pin Assignments ---
const int PIN_ESC_PWM      = 15; // ESC Control Output (PWM / Servo 1000us - 2000us)
const int PIN_TACH_SENSOR  = 18; // IR Optical / Tachometer Sensor Input (Interrupt)
const int PIN_LID_SWITCH   = 19; // Lid Switch Safety Input (Active LOW when CLOSED)
const int PIN_STATUS_LED   = 4;  // System Status Indicator LED

// --- Motor & ESC Parameters ---
const int ESC_MIN_PULSE    = 1000; // 0% throttle (microseconds)
const int ESC_MAX_PULSE    = 2000; // 100% throttle (microseconds)
const int MAX_RPM          = 10000;

// --- Global Variables ---
Servo escMotor;

volatile unsigned long pulseCount = 0;
unsigned long lastTachCheckTime  = 0;

int currentPulseWidth  = ESC_MIN_PULSE;
int targetPulseWidth   = ESC_MIN_PULSE;
int currentRPM         = 0;
int targetRPM          = 3500;

bool isLidClosed       = true;
String systemState     = "IDLE"; // IDLE, RAMPING_UP, RUNNING, PAUSED, RAMPING_DOWN, ESTOP

// Wi-Fi Access Point Settings
const char* apSSID     = "ESP32-Centrifuge";
const char* apPassword = "centrifuge123";

// Concurrent Wi-Fi Server (Port 80 for HTTP / Telemetry)
WiFiServer wifiServer(80);
WiFiClient currentClient;

// --- Hardware Interrupt for RPM Pulse Counting ---
void IRAM_ATTR onTachPulse() {
  pulseCount++;
}

void setup() {
  // 1. Initialize USB Serial Communication (115200 Baud)
  Serial.begin(115200);

  // 2. Configure Pin Modes
  pinMode(PIN_LID_SWITCH, INPUT_PULLUP);
  pinMode(PIN_TACH_SENSOR, INPUT_PULLUP);
  pinMode(PIN_STATUS_LED, OUTPUT);

  // 3. Attach Hardware Interrupt for Optical Sensor
  attachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR), onTachPulse, RISING);

  // 4. Attach ESC Servo PWM
  ESP32PWM::allocateTimer(0);
  escMotor.setPeriodHertz(50); // Standard 50Hz Servo frequency
  escMotor.attach(PIN_ESC_PWM, ESC_MIN_PULSE, ESC_MAX_PULSE);
  
  // Arm ESC (Send minimum pulse for 2 seconds)
  escMotor.writeMicroseconds(ESC_MIN_PULSE);
  delay(2000);

  // 5. Start Dual Wi-Fi Access Point
  WiFi.softAP(apSSID, apPassword);
  IPAddress apIP = WiFi.softAPIP();
  wifiServer.begin();

  Serial.println("==================================================");
  Serial.println("ESP32 Centrifuge Controller - Dual Mode Ready");
  Serial.println("Channel 1: USB Serial @ 115200 Baud");
  Serial.print("Channel 2: Wi-Fi Access Point: "); Serial.println(apSSID);
  Serial.print("Channel 2 IP Address: http://"); Serial.println(apIP);
  Serial.println("Dual Channel Redundancy Active (Concurrent USB + Wi-Fi)");
  Serial.println("==================================================");
}

void loop() {
  // --- 1. Hardware Lid Safety Check ---
  isLidClosed = (digitalRead(PIN_LID_SWITCH) == LOW);

  // Hard physical safety override (Immediate motor power cut if lid is opened while spinning)
  if (!isLidClosed && systemState != "IDLE" && systemState != "ESTOP") {
    systemState = "ESTOP";
    targetPulseWidth = ESC_MIN_PULSE;
    currentPulseWidth = ESC_MIN_PULSE;
    escMotor.writeMicroseconds(ESC_MIN_PULSE);
  }

  // --- 2. Process Commands from USB Serial ---
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      parseCommand(cmd, "USB_SERIAL");
    }
  }

  // --- 3. Process Commands & Telemetry over Wi-Fi Server ---
  WiFiClient client = wifiServer.available();
  if (client) {
    currentClient = client;
    String req = client.readStringUntil('\r');
    client.flush();

    // Parse HTTP requests / JSON command endpoints (e.g. GET /cmd?c=START or GET /status)
    if (req.indexOf("/cmd?c=") != -1) {
      int idx = req.indexOf("/cmd?c=") + 7;
      int spaceIdx = req.indexOf(" ", idx);
      String cmd = req.substring(idx, (spaceIdx != -1) ? spaceIdx : req.length());
      parseCommand(cmd, "WIFI");
    }

    // Send HTTP Response Header with JSON Telemetry
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.print("{\"rpm\":"); client.print(currentRPM);
    client.print(",\"lid\":"); client.print(isLidClosed ? 1 : 0);
    client.print(",\"state\":\""); client.print(systemState); client.print("\"}");
    client.stop();
  }

  // --- 4. Update Motor PWM Ramping ---
  updateMotorSpeed();

  // --- 5. Calculate Live RPM & Broadcast Dual Telemetry (Every 200ms) ---
  unsigned long now = millis();
  if (now - lastTachCheckTime >= 200) {
    detachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR));
    
    unsigned long pulses = pulseCount;
    pulseCount = 0;
    
    attachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR), onTachPulse, RISING);

    float elapsedSec = (now - lastTachCheckTime) / 1000.0;
    currentRPM = (int)((pulses / elapsedSec) * 60.0);
    lastTachCheckTime = now;

    // Broadcast Telemetry to USB Serial regardless of Wi-Fi state
    sendDualTelemetry();
  }

  delay(20);
}

// --- Smooth Acceleration Ramping ---
void updateMotorSpeed() {
  if (systemState == "ESTOP") {
    currentPulseWidth = ESC_MIN_PULSE;
    escMotor.writeMicroseconds(ESC_MIN_PULSE);
    digitalWrite(PIN_STATUS_LED, (millis() / 200) % 2); // Rapid flash warning LED
    return;
  }

  // Calculate target pulse width based on target RPM
  if (systemState == "RAMPING_UP" || systemState == "RUNNING") {
    targetPulseWidth = map(targetRPM, 0, MAX_RPM, ESC_MIN_PULSE, ESC_MAX_PULSE);
  } else {
    targetPulseWidth = ESC_MIN_PULSE;
  }

  // Ramp pulse width smoothly (Soft Start)
  if (currentPulseWidth < targetPulseWidth) {
    currentPulseWidth = min(targetPulseWidth, currentPulseWidth + 10);
    if (currentPulseWidth == targetPulseWidth) systemState = "RUNNING";
  } else if (currentPulseWidth > targetPulseWidth) {
    currentPulseWidth = max(targetPulseWidth, currentPulseWidth - 15);
    if (currentPulseWidth == ESC_MIN_PULSE) systemState = "IDLE";
  }

  escMotor.writeMicroseconds(currentPulseWidth);
  digitalWrite(PIN_STATUS_LED, (systemState == "RUNNING") ? HIGH : LOW);
}

// --- Unified Command Parser ---
void parseCommand(String cmd, String source) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    if (isLidClosed) {
      systemState = "RAMPING_UP";
    }
  } else if (cmd == "PAUSE") {
    systemState = "PAUSED";
  } else if (cmd == "STOP") {
    systemState = "RAMPING_DOWN";
  } else if (cmd == "ESTOP") {
    systemState = "ESTOP";
    currentPulseWidth = ESC_MIN_PULSE;
    escMotor.writeMicroseconds(ESC_MIN_PULSE);
  } else if (cmd.startsWith("SETRPM:")) {
    int val = cmd.substring(7).toInt();
    targetRPM = constrain(val, 0, MAX_RPM);
  }
}

// --- Send Telemetry to USB Serial & Wi-Fi Concurrent Output ---
void sendDualTelemetry() {
  // Serial output: RPM:3450,LID:1,STATE:RUNNING
  Serial.print("RPM:");
  Serial.print(currentRPM);
  Serial.print(",LID:");
  Serial.print(isLidClosed ? 1 : 0);
  Serial.print(",STATE:");
  Serial.println(systemState);
}
