/*
 * -------------------------------------------------------------------
 * CENTRIFUGE PRO CONTROLLER - ESP32 TRIPLE INTEGRATED FIRMWARE + BUZZER
 * -------------------------------------------------------------------
 * Board: ESP32 Dev Module
 * Features:
 *   - Triple Concurrent Communication: USB Serial, Wi-Fi AP, and Bluetooth Serial
 *   - Distinct Piezo Buzzer Audio Tunes
 *   - Hardware Interlock: Physical Lid Limit Switch & Emergency Stop
 *   - Precision RPM Measurement: IR Optical Sensor Interrupt Handler
 * -------------------------------------------------------------------
 */

#include <WiFi.h>
#include <ESP32Servo.h>
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

// --- Pin Assignments ---
const int PIN_ESC_PWM      = 15; // ESC Control Output (PWM / Servo 1000us - 2000us)
const int PIN_TACH_SENSOR  = 18; // IR Optical / Tachometer Sensor Input (Interrupt)
const int PIN_LID_SWITCH   = 19; // Lid Switch Safety Input (Active LOW when CLOSED)
const int PIN_STATUS_LED   = 4;  // System Status Indicator LED
const int PIN_BUZZER       = 27; // Piezo Buzzer Pin

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
String systemState     = "IDLE";
String previousState   = "IDLE";

// Wi-Fi Access Point Settings
const char* apSSID     = "ESP32-Centrifuge";
const char* apPassword = "centrifuge123";

WiFiServer wifiServer(80);
WiFiClient currentClient;

void IRAM_ATTR onTachPulse() {
  pulseCount++;
}

void playBuzzerTone(int freq, int durationMs) {
  tone(PIN_BUZZER, freq, durationMs);
  delay(durationMs);
  noTone(PIN_BUZZER);
}

void playStartTune() {
  playBuzzerTone(523, 80);
  delay(20);
  playBuzzerTone(659, 80);
  delay(20);
  playBuzzerTone(784, 80);
  delay(20);
  playBuzzerTone(1047, 150);
}

void playPauseTune() {
  playBuzzerTone(784, 100);
  delay(30);
  playBuzzerTone(659, 150);
}

void playStopTune() {
  playBuzzerTone(523, 100);
  delay(30);
  playBuzzerTone(784, 100);
  delay(30);
  playBuzzerTone(1047, 120);
  delay(30);
  playBuzzerTone(1319, 250);
}

void playEmergencyTune() {
  for (int i = 0; i < 4; i++) {
    tone(PIN_BUZZER, 2500, 60);
    delay(60);
    tone(PIN_BUZZER, 1800, 60);
    delay(60);
  }
  noTone(PIN_BUZZER);
}

void playLidWarningTune() {
  playBuzzerTone(350, 120);
  delay(50);
  playBuzzerTone(350, 180);
}

void setup() {
  // 1. Initialize USB Serial & Bluetooth Serial
  Serial.begin(115200);
  SerialBT.begin("ESP32-Centrifuge-BT");

  // 2. Configure Pin Modes
  pinMode(PIN_LID_SWITCH, INPUT_PULLUP);
  pinMode(PIN_TACH_SENSOR, INPUT_PULLUP);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // 3. Attach Hardware Interrupt for Optical Sensor
  attachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR), onTachPulse, RISING);

  // 4. Attach ESC Servo PWM
  ESP32PWM::allocateTimer(0);
  escMotor.setPeriodHertz(50);
  escMotor.attach(PIN_ESC_PWM, ESC_MIN_PULSE, ESC_MAX_PULSE);
  
  escMotor.writeMicroseconds(ESC_MIN_PULSE);
  delay(1500);

  playStartTune();

  // 5. Start Wi-Fi Access Point
  WiFi.softAP(apSSID, apPassword);
  IPAddress apIP = WiFi.softAPIP();
  wifiServer.begin();

  Serial.println("==================================================");
  Serial.println("ESP32 Centrifuge Controller - Triple Mode Ready");
  Serial.println("Channel 1: USB Serial @ 115200 Baud");
  Serial.print("Channel 2: Wi-Fi Access Point: "); Serial.println(apSSID);
  Serial.println("Channel 3: Bluetooth Device: ESP32-Centrifuge-BT");
  Serial.println("==================================================");
}

void loop() {
  // 1. Hardware Lid Safety Check
  bool currentLidState = (digitalRead(PIN_LID_SWITCH) == LOW);

  if (isLidClosed && !currentLidState) {
    isLidClosed = false;
    if (systemState != "IDLE" && systemState != "ESTOP") {
      systemState = "ESTOP";
      targetPulseWidth = ESC_MIN_PULSE;
      currentPulseWidth = ESC_MIN_PULSE;
      escMotor.writeMicroseconds(ESC_MIN_PULSE);
      playLidWarningTune();
    }
  } else {
    isLidClosed = currentLidState;
  }

  // 2. Process USB Serial Commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      parseCommand(cmd, "USB_SERIAL");
    }
  }

  // 3. Process Bluetooth Commands
  if (SerialBT.available()) {
    String btCmd = SerialBT.readStringUntil('\n');
    btCmd.trim();
    if (btCmd.length() > 0) {
      parseCommand(btCmd, "BLUETOOTH");
    }
  }

  // 4. Process Wi-Fi Server Commands & Telemetry
  WiFiClient client = wifiServer.available();
  if (client) {
    currentClient = client;
    String req = client.readStringUntil('\r');
    client.flush();

    if (req.indexOf("/cmd?c=") != -1) {
      int idx = req.indexOf("/cmd?c=") + 7;
      int spaceIdx = req.indexOf(" ", idx);
      String cmd = req.substring(idx, (spaceIdx != -1) ? spaceIdx : req.length());
      parseCommand(cmd, "WIFI");
    }

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

  // 5. Update Motor PWM Ramping
  updateMotorSpeed();

  // 6. Calculate Live RPM & Broadcast Telemetry
  unsigned long now = millis();
  if (now - lastTachCheckTime >= 200) {
    detachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR));
    
    unsigned long pulses = pulseCount;
    pulseCount = 0;
    
    attachInterrupt(digitalPinToInterrupt(PIN_TACH_SENSOR), onTachPulse, RISING);

    float elapsedSec = (now - lastTachCheckTime) / 1000.0;
    currentRPM = (int)((pulses / elapsedSec) * 60.0);
    lastTachCheckTime = now;

    sendDualTelemetry();
  }

  delay(20);
}

void updateMotorSpeed() {
  if (systemState == "ESTOP") {
    currentPulseWidth = ESC_MIN_PULSE;
    escMotor.writeMicroseconds(ESC_MIN_PULSE);
    digitalWrite(PIN_STATUS_LED, (millis() / 200) % 2);
    return;
  }

  if (systemState == "RAMPING_UP" || systemState == "RUNNING") {
    targetPulseWidth = map(targetRPM, 0, MAX_RPM, ESC_MIN_PULSE, ESC_MAX_PULSE);
  } else {
    targetPulseWidth = ESC_MIN_PULSE;
  }

  if (currentPulseWidth < targetPulseWidth) {
    currentPulseWidth = min(targetPulseWidth, currentPulseWidth + 10);
    if (currentPulseWidth == targetPulseWidth && systemState != "RUNNING") {
      systemState = "RUNNING";
    }
  } else if (currentPulseWidth > targetPulseWidth) {
    currentPulseWidth = max(targetPulseWidth, currentPulseWidth - 15);
    if (currentPulseWidth == ESC_MIN_PULSE && systemState == "RAMPING_DOWN") {
      systemState = "IDLE";
      playStopTune();
    }
  }

  escMotor.writeMicroseconds(currentPulseWidth);
  digitalWrite(PIN_STATUS_LED, (systemState == "RUNNING") ? HIGH : LOW);
}

void parseCommand(String cmd, String source) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    if (isLidClosed) {
      systemState = "RAMPING_UP";
      playStartTune();
    } else {
      playLidWarningTune();
    }
  } else if (cmd == "PAUSE") {
    systemState = "PAUSED";
    playPauseTune();
  } else if (cmd == "STOP") {
    systemState = "RAMPING_DOWN";
    playStopTune();
  } else if (cmd == "ESTOP") {
    systemState = "ESTOP";
    currentPulseWidth = ESC_MIN_PULSE;
    escMotor.writeMicroseconds(ESC_MIN_PULSE);
    playEmergencyTune();
  } else if (cmd.startsWith("SETRPM:")) {
    int val = cmd.substring(7).toInt();
    targetRPM = constrain(val, 0, MAX_RPM);
    playBuzzerTone(880, 50);
  }
}

void sendDualTelemetry() {
  // USB Serial
  Serial.print("RPM:");
  Serial.print(currentRPM);
  Serial.print(",LID:");
  Serial.print(isLidClosed ? 1 : 0);
  Serial.print(",STATE:");
  Serial.println(systemState);

  // Bluetooth Serial
  if (SerialBT.hasClient()) {
    SerialBT.print("RPM:");
    SerialBT.print(currentRPM);
    SerialBT.print(",LID:");
    SerialBT.print(isLidClosed ? 1 : 0);
    SerialBT.print(",STATE:");
    SerialBT.println(systemState);
  }
}
