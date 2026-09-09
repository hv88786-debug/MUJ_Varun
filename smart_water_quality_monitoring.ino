/*
  ============================================================
  SMART WATER QUALITY MONITORING SYSTEM
  ============================================================
  Sensors combined:
    - TDS         -> D34   (calibrated, HIGH if >= 185 ppm)
    - Turbidity    -> D33   (calibrated: CLEAN / MEDIUM / DIRTY)
    - Thermistor   -> D32   (Temperature) -- FIXED at 22.0C
                              (wiring not verified yet, replace
                              readTemperature() later)
    - Salinity     -> D35   (calibrated: LOW / MODERATE / HIGH)
    - pH           -> D36 (VP) -- NOT wired to a real formula yet,
                                    always reports 7.23 as requested.
                                    Replace readPH() later with real
                                    calibration when your pH probe
                                    logic is ready.
  Outputs:
    - Green LED    -> D27 (blinks when water is drinkable)
    - Red LED      -> D26 (blinks when water is NOT drinkable)
    - Buzzer       -> D25 (buzzes together with Red LED)
    - 16x2 I2C LCD (address 0x27, change if yours is 0x3F)
    - WiFi + Firebase Realtime Database + ThingSpeak upload

  LCD SCREEN SEQUENCE (cycles continuously, 2 sec each):
    1. Smart Water Quality Monitoring (title)
    2. WiFi / Firebase connection status
    3. TDS value + WHO reference range
    4. Turbidity value
    5. Salinity value
    6. pH value
    7. Temperature value
    8. High parameters summary + overall drinkable status
  ============================================================
*/

#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <ThingSpeak.h>

// ---------------- WiFi CONFIG ----------------
const char* ssid     = "vivo Y300 5G";
const char* password = "76797679";

// ---------------- THINGSPEAK CONFIG ----------------
unsigned long channelID   = 3482162;
const char* writeAPIKey   = "EYKMC4ZB7RGVGWX7";
WiFiClient client;
// ThingSpeak free tier needs at least 15 sec between updates
const unsigned long THINGSPEAK_INTERVAL = 16000;
unsigned long lastThingSpeakMillis = 0;

// ---------------- FIREBASE CONFIG ----------------
// HOST   = Realtime Database URL without "https://" and without trailing "/"
// SECRET = Project Settings -> Service accounts -> Database secrets (legacy secret)
#define DATABASE_URL    "varun-735df-default-rtdb.firebaseio.com"
#define DATABASE_SECRET "BcvoLaUccb35s6Sy246iRX1J47Ainp9TafiiVs8u"

FirebaseData   fbdo;
FirebaseAuth   fbAuth;
FirebaseConfig fbConfig;
bool firebaseConnected = false;

// ---------------- LCD ----------------
LiquidCrystal_I2C lcd(0x27, 16, 2);   // change to 0x3F if your module uses that address

// ---------------- Sensor Pins ----------------
#define TDS_PIN        34
#define TURBIDITY_PIN  33
#define THERMISTOR_PIN 32
#define SALINITY_PIN   35
#define PH_PIN         36

// ---------------- Output Pins ----------------
#define GREEN_LED  27
#define RED_LED    26
#define BUZZER     25

// ---------------- Calibration Constants ----------------
#define TDS_HIGH_THRESHOLD     185.0   // ppm -- HIGH TDS if reading >= this

#define TURB_VOLTAGE_AIR       1.565
#define TURB_VOLTAGE_CLEAN     1.70
#define TURB_VOLTAGE_DIRTY     1.34

#define SAL_VOLTAGE_LOW        2.28
#define SAL_VOLTAGE_HIGH       2.55

#define PH_MIN_SAFE            6.5
#define PH_MAX_SAFE            8.5

float fixedTemperature = 22.0;   // Fixed until thermistor wiring is verified
float fixedPH          = 7.23;   // Fixed until real pH probe calibration is done

// ---------------- Live Sensor Values ----------------
float tdsValue          = 0;
float turbidityVoltage  = 0;
float turbidityClarity  = 0;
String turbidityStatus  = "";
float salinityVoltage   = 0;
float salinityPercent   = 0;
String salinityStatus   = "";
float phValue           = 0;
float tempValue         = 0;

bool   isDrinkable = true;
String highParams  = "";

// ---------------- WiFi status ----------------
bool wifiConnected = false;

// ---------------- LCD screen cycling ----------------
unsigned long lastScreenChange = 0;
int screenIndex = 0;
const long screenInterval = 2000;   // each screen shown for 2 sec

// ---------------- LED blink timing ----------------
unsigned long lastLedBlink = 0;
bool ledBlinkState = false;
const long blinkInterval = 400;

// =========================================================
void setup() {
  Serial.begin(115200);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER, LOW);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Wire.begin();
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("Smart Water");
  lcd.setCursor(0, 1);
  lcd.print("Quality Monitor");
  delay(2000);

  connectWiFi();
  if (wifiConnected) {
    setupFirebase();
    ThingSpeak.begin(client);
  }
}

// =========================================================
void loop() {
  readAllSensors();
  evaluateWaterQuality();
  updateLCD();
  handleOutputs();
  uploadData();
}

// ---------------- WiFi Connect ----------------
void connectWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected");
    delay(1000);
  } else {
    wifiConnected = false;
    Serial.println("\nWiFi Connection Failed");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed");
    lcd.setCursor(0, 1);
    lcd.print("Offline Mode");
    delay(1500);
  }
}

// ---------------- Firebase Setup ----------------
void setupFirebase() {
  fbConfig.database_url = DATABASE_URL;
  fbConfig.signer.tokens.legacy_token = DATABASE_SECRET;

  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);

  firebaseConnected = Firebase.ready();
  Serial.println(firebaseConnected ? "Firebase Ready" : "Firebase Not Ready");
}

// ---------------- Read All Sensors ----------------
void readAllSensors() {
  // ---- TDS ----
  float tdsVoltage = readAveragedVoltage(TDS_PIN, 20);
  tdsValue = getTDSValue(tdsVoltage, fixedTemperature);

  // ---- Turbidity ----
  turbidityVoltage = readAveragedVoltage(TURBIDITY_PIN, 10);
  turbidityStatus  = classifyTurbidity(turbidityVoltage);
  turbidityClarity = getClarityPercent(turbidityVoltage);

  // ---- Salinity ----
  salinityVoltage  = readAveragedVoltage(SALINITY_PIN, 15);
  salinityStatus   = classifySalinity(salinityVoltage);
  salinityPercent  = getSalinityPercent(salinityVoltage);

  // ---- pH (fixed placeholder) ----
  phValue = readPH();

  // ---- Temperature (fixed placeholder) ----
  tempValue = readTemperature();
}

float readAveragedVoltage(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(10);
  }
  float avgRaw = sum / (float)samples;
  return avgRaw * (3.3 / 4095.0);
}

// ---- TDS conversion (DFRobot-style polynomial + temp compensation) ----
float getTDSValue(float voltage, float tempC) {
  float compensationCoefficient = 1.0 + 0.02 * (tempC - 25.0);
  float compensatedVoltage = voltage / compensationCoefficient;

  float tds = (133.42 * pow(compensatedVoltage, 3)
             - 255.86 * pow(compensatedVoltage, 2)
             + 857.39 * compensatedVoltage) * 0.5;

  if (tds < 0) tds = 0;
  return tds;
}

// ---- Turbidity classification ----
String classifyTurbidity(float voltage) {
  if (voltage > (TURB_VOLTAGE_AIR + 0.05)) {
    return "CLEAN";
  } else if (voltage < (TURB_VOLTAGE_DIRTY + 0.15)) {
    return "DIRTY";
  } else {
    return "MEDIUM";
  }
}

float getClarityPercent(float voltage) {
  float clarity = (voltage - TURB_VOLTAGE_DIRTY) / (TURB_VOLTAGE_CLEAN - TURB_VOLTAGE_DIRTY) * 100.0;
  if (clarity < 0) clarity = 0;
  if (clarity > 100) clarity = 100;
  return clarity;
}

// ---- Salinity classification (voltage proportional to salinity) ----
String classifySalinity(float voltage) {
  if (voltage <= SAL_VOLTAGE_LOW + 0.05) {
    return "LOW";
  } else if (voltage >= SAL_VOLTAGE_HIGH - 0.05) {
    return "HIGH";
  } else {
    return "MODERATE";
  }
}

float getSalinityPercent(float voltage) {
  float salinity = (voltage - SAL_VOLTAGE_LOW) / (SAL_VOLTAGE_HIGH - SAL_VOLTAGE_LOW) * 100.0;
  if (salinity < 0) salinity = 0;
  if (salinity > 100) salinity = 100;
  return salinity;
}

// ---- pH placeholder ----
float readPH() {
  return fixedPH;   // Replace with real calibration formula later
}

// ---- Temperature placeholder ----
float readTemperature() {
  return fixedTemperature;   // Replace with real thermistor formula later
}

// ---------------- Evaluate Overall Water Quality ----------------
void evaluateWaterQuality() {
  highParams = "";
  isDrinkable = true;

  if (tdsValue >= TDS_HIGH_THRESHOLD) {
    highParams += "TDS ";
    isDrinkable = false;
  }
  if (turbidityStatus == "DIRTY") {
    highParams += "Turbidity ";
    isDrinkable = false;
  }
  if (salinityStatus == "HIGH") {
    highParams += "Salinity ";
    isDrinkable = false;
  }
  if (phValue < PH_MIN_SAFE || phValue > PH_MAX_SAFE) {
    highParams += "pH ";
    isDrinkable = false;
  }

  if (highParams == "") {
    highParams = "None";
  }
}

// ---------------- LCD Screen Sequence ----------------
void updateLCD() {
  if (millis() - lastScreenChange >= screenInterval) {
    lastScreenChange = millis();
    screenIndex = (screenIndex + 1) % 8;
    lcd.clear();

    switch (screenIndex) {
      case 0:
        lcd.setCursor(0, 0);
        lcd.print("Smart Water");
        lcd.setCursor(0, 1);
        lcd.print("Quality Monitor");
        break;

      case 1:
        lcd.setCursor(0, 0);
        lcd.print("WiFi: ");
        lcd.print(wifiConnected ? "Connected" : "Offline");
        lcd.setCursor(0, 1);
        lcd.print("Firebase: ");
        lcd.print(firebaseConnected ? "OK" : "NO");
        break;

      case 2:
        lcd.setCursor(0, 0);
        lcd.print("TDS: ");
        lcd.print(tdsValue, 0);
        lcd.print(" ppm");
        lcd.setCursor(0, 1);
        lcd.print("WHO: <500 ppm");
        break;

      case 3:
        lcd.setCursor(0, 0);
        lcd.print("Turbidity:");
        lcd.setCursor(0, 1);
        lcd.print(turbidityStatus);
        lcd.print(" ");
        lcd.print(turbidityClarity, 0);
        lcd.print("%");
        break;

      case 4:
        lcd.setCursor(0, 0);
        lcd.print("Salinity:");
        lcd.setCursor(0, 1);
        lcd.print(salinityStatus);
        lcd.print(" ");
        lcd.print(salinityPercent, 0);
        lcd.print("%");
        break;

      case 5:
        lcd.setCursor(0, 0);
        lcd.print("pH Value:");
        lcd.setCursor(0, 1);
        lcd.print(phValue, 2);
        break;

      case 6:
        lcd.setCursor(0, 0);
        lcd.print("Temperature:");
        lcd.setCursor(0, 1);
        lcd.print(tempValue, 1);
        lcd.print(" C");
        break;

      case 7:
        lcd.setCursor(0, 0);
        lcd.print("High: ");
        lcd.print(highParams);
        lcd.setCursor(0, 1);
        if (isDrinkable) {
          lcd.print("Water OK to");
        } else {
          lcd.print("Water NOT");
        }
        break;
    }
  }
}

// ---------------- LED + Buzzer Output ----------------
void handleOutputs() {
  if (millis() - lastLedBlink >= blinkInterval) {
    lastLedBlink = millis();
    ledBlinkState = !ledBlinkState;

    if (isDrinkable) {
      digitalWrite(GREEN_LED, ledBlinkState);
      digitalWrite(RED_LED, LOW);
      digitalWrite(BUZZER, LOW);
    } else {
      digitalWrite(RED_LED, ledBlinkState);
      digitalWrite(BUZZER, ledBlinkState);
      digitalWrite(GREEN_LED, LOW);
    }
  }
}

// ---------------- Upload to Firebase + ThingSpeak ----------------
void uploadData() {
  if (!wifiConnected) return;

  // ---- Firebase ----
  if (firebaseConnected) {
    Firebase.RTDB.setFloat(&fbdo, "/sensor/tds", tdsValue);
    Firebase.RTDB.setFloat(&fbdo, "/sensor/turbidity", turbidityClarity);
    Firebase.RTDB.setFloat(&fbdo, "/sensor/salinity", salinityPercent);
    Firebase.RTDB.setFloat(&fbdo, "/sensor/ph", phValue);
    Firebase.RTDB.setFloat(&fbdo, "/sensor/temperature", tempValue);
    Firebase.RTDB.setBool(&fbdo, "/sensor/drinkable", isDrinkable);
  }

  // ---- ThingSpeak (respects 15+ sec rate limit) ----
  if (millis() - lastThingSpeakMillis >= THINGSPEAK_INTERVAL) {
    lastThingSpeakMillis = millis();
    ThingSpeak.setField(1, tdsValue);
    ThingSpeak.setField(2, turbidityClarity);
    ThingSpeak.setField(3, salinityPercent);
    ThingSpeak.setField(4, phValue);
    ThingSpeak.setField(5, tempValue);
    ThingSpeak.setField(6, isDrinkable ? 1 : 0);
    ThingSpeak.writeFields(channelID, writeAPIKey);
  }
}
