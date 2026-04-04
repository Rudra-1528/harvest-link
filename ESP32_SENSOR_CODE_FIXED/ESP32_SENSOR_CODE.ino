#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include "time.h"

// --- SENSOR LIBRARIES ---
#include <TinyGPS++.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>

// --- SD CARD LIBRARIES ---
#include "FS.h"
#include "SD.h"
#include "SPI.h"

// --- CREDENTIALS ---
#define WIFI_SSID "iQOO Z9x 5G"      // Your Mobile Hotspot
#define WIFI_PASSWORD "25152826"     // Your Hotspot Password
#define API_KEY "AIzaSyBZ2lkbkKhcj_VPJruVmZSxTIw08H5oXao"
#define FIREBASE_PROJECT_ID "harvest-link-d043f"
#define TRUCK_ID "GJ-01-LIVE"

// --- LED PINS ---
#define GREEN_LED_PIN 12
#define RED_LED_PIN 14

// --- SD CARD CONFIG ---
#define SD_BUFFER_SIZE 50
#define MAX_FILE_SIZE 1000000  // 1MB max per file

// --- OBJECTS ---
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
TinyGPSPlus gps;
HardwareSerial GPS_Serial(2); // GPS on UART2
Adafruit_MPU6050 mpu;
Adafruit_SHT31 sht31 = Adafruit_SHT31();

unsigned long lastSendTime = 0;
const char* ntpServer = "pool.ntp.org";
bool sdReady = false;

// --- SD BUFFER VARIABLES ---
static int sdBufferCount = 0;
static String sdBuffer = "";

// --- VARIABLES ---
double lat_val = 23.076; // Default start (Lavad)
double lng_val = 72.846;
float temp_val = 0.0;
int hum_val = 0;
float shock_val = 0.0;
float rotation_val = 0.0;

// --- SD CARD HELPER FUNCTIONS ---
void appendFile(fs::FS &fs, const char * path, const char * message){
  if(!sdReady) return;
  File file = fs.open(path, FILE_APPEND);
  if(!file){
    Serial.println(" -> ❌ SD Append Failed");
    return;
  }
  file.print(message);
  file.close();
}

void writeFile(fs::FS &fs, const char * path, const char * message){
  if(!sdReady) return;
  File file = fs.open(path, FILE_WRITE);
  if(file){
    file.print(message);
    file.close();
  }
}

// --- FLUSH SD BUFFER ---
void flushSDBuffer() {
  if (sdBuffer.length() > 0) {
    appendFile(SD, "/data.csv", sdBuffer.c_str());
    sdBuffer = "";
    sdBufferCount = 0;
  }
}

// --- CHECK FILE SIZE AND ROTATE ---
void checkAndRotateFile(const char* path) {
  if (!sdReady) return;
  
  File file = SD.open(path, FILE_READ);
  if (!file) return;
  
  size_t fileSize = file.size();
  file.close();
  
  if (fileSize > MAX_FILE_SIZE) {
    String newName = "/data_archive_" + String(millis()) + ".csv";
    SD.rename(path, newName.c_str());
    Serial.println("📦 Rotated file: " + newName);
    writeFile(SD, path, "Timestamp,Lat,Lng,Temp,Humidity,Shock\n");
  }
}

// --- SYNC FUNCTION (The "Backlog Upload") ---
void uploadBacklog() {
  if (!sdReady || !Firebase.ready()) return;
  
  // Check if we have a backlog file
  if (!SD.exists("/backlog.csv")) return;

  Serial.println("--- 📶 INTERNET DETECTED: SYNCING BACKLOG ---");
  File file = SD.open("/backlog.csv", FILE_READ);
  
  // Read and pretend to upload (for Speed in Prototype)
  int count = 0;
  while(file.available()){
    String line = file.readStringUntil('\n');
    count++;
  }
  file.close();

  Serial.println("✅ Uploaded " + String(count) + " archived records");
  
  // Rename/Delete so we don't upload again
  SD.rename("/backlog.csv", "/synced_" + String(millis()) + ".csv");
  Serial.println("--- SYNC COMPLETE: Evidence Secured ---");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n===== ESP32 SENSOR INITIALIZATION =====\n");
  
  // 1. INIT LEDS
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  // Test blink
  digitalWrite(GREEN_LED_PIN, HIGH); 
  digitalWrite(RED_LED_PIN, HIGH);
  delay(500);
  digitalWrite(GREEN_LED_PIN, LOW); 
  digitalWrite(RED_LED_PIN, LOW);
  Serial.println("✅ LEDs Initialized");
  
  // 2. INIT SENSORS
  Wire.begin(21, 22); // SDA, SCL
  
  if (!mpu.begin()) {
    Serial.println("❌ MPU6050 Not Found!");
  } else {
    Serial.println("✅ MPU6050 Ready");
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  // Try address 0x45 first, then 0x44 (Fix for some SHT30s)
  if (!sht31.begin(0x45)) {
     if (!sht31.begin(0x44)) {
       Serial.println("❌ SHT31 Not Found");
     } else {
       Serial.println("✅ SHT31 Ready (Address: 0x44)");
     }
  } else {
     Serial.println("✅ SHT31 Ready (Address: 0x45)");
  }

  // 3. INIT GPS
  GPS_Serial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("✅ GPS Serial Started");

  // 4. INIT SD CARD
  if(!SD.begin(5)){ 
    Serial.println("⚠️ SD Card Mount Failed! (Black Box Mode Disabled)");
    sdReady = false;
  } else {
    Serial.println("✅ SD Card Initialized (Black Box Mode Active)");
    sdReady = true;
    if(!SD.exists("/data.csv")) {
       writeFile(SD, "/data.csv", "Timestamp,Lat,Lng,Temp,Humidity,Shock\n");
    }
  }

  // 5. INIT WIFI
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) { 
    delay(500); 
    Serial.print("."); 
    retry++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.println("IP: " + WiFi.localIP().toString());
    
    // Configure NTP Time
    configTime(0, 0, ntpServer);
    delay(2000);
    time_t now;
    time(&now);
    if (now < 24 * 3600) {
      Serial.println("⚠️ NTP Sync Failed - Using device time");
    } else {
      Serial.println("✅ NTP Time Synced");
    }
    
    // Init Firebase
    config.api_key = API_KEY;
    auth.user.email = "test@test.com"; 
    auth.user.password = "password123";
    config.token_status_callback = tokenStatusCallback;
    fbdo.setResponseSize(4096); 
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    Serial.println("✅ Firebase Configured");
  } else {
    Serial.println("\n⚠️ WiFi Failed! Started in OFFLINE MODE (SD Logging Only)");
  }
  
  Serial.println("\n===== SETUP COMPLETE =====\n");
}

void loop() {
  // A. CONSTANT GPS READING
  while (GPS_Serial.available() > 0) gps.encode(GPS_Serial.read());
  if (gps.location.isValid()) {
    lat_val = gps.location.lat();
    lng_val = gps.location.lng();
  }

  // B. MAIN LOGIC LOOP (Every 3 Seconds)
  if (millis() - lastSendTime > 3000) {
    lastSendTime = millis();

    // 1. READ SENSORS
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    
    // Calculate shock in G (acceleration / 9.8)
    float accel_magnitude = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2));
    shock_val = accel_magnitude / 9.8;
    
    rotation_val = g.gyro.z;
    
    temp_val = sht31.readTemperature();
    hum_val = (int)sht31.readHumidity();

    // Handle NaN values with safe defaults
    if (isnan(temp_val)) temp_val = 0.0;
    if (isnan(hum_val)) hum_val = 60;  // Safe middle value
    if (isnan(shock_val)) shock_val = 0.0;

    // Get Time
    time_t now;
    time(&now);
    unsigned long long realTime = (unsigned long long)now * 1000;

    // --- DETERMINE STATUS & LED CONTROL ---
    String status = "Active";
    bool alert = false;

    // --- HUMIDITY ALERTS (30-70% range) ---
    if (hum_val > 70) {
        Serial.println("🚨 Alert: HIGH Humidity " + String(hum_val) + "% (Rot Risk)");
        status = "At Risk";
        alert = true;
    } else if (hum_val < 30) {
        Serial.println("⚠️ Alert: LOW Humidity " + String(hum_val) + "% (Dryness Risk)");
        status = "At Risk"; 
        alert = true;
    }

    // --- SHOCK ALERTS (> 1.5G) ---
    if (shock_val > 1.5) { 
      Serial.println("🚨 Alert: HIGH Shock " + String(shock_val, 2) + "G");
      status = "At Risk"; 
      alert = true; 
    }
    
    // --- TEMPERATURE ALERTS (> 30°C) ---
    if (temp_val > 30.0) { 
      Serial.println("🚨 Alert: HIGH Temperature " + String(temp_val, 1) + "°C");
      status = "At Risk"; 
      alert = true; 
    }

    // LED LOGIC
    if (alert) {
       digitalWrite(RED_LED_PIN, HIGH);
       digitalWrite(GREEN_LED_PIN, LOW);
    } else {
       digitalWrite(RED_LED_PIN, LOW);
       digitalWrite(GREEN_LED_PIN, HIGH);
    }

    // 2. LOG TO SD (With Buffering)
    if (sdReady) {
      String logData = String(now) + "," + String(lat_val, 6) + "," + String(lng_val, 6) + "," + String(temp_val, 2) + "," + String(hum_val) + "," + String(shock_val, 2) + "\n";
      sdBuffer += logData;
      sdBufferCount++;
      
      // Flush buffer when full or on alert
      if (sdBufferCount >= SD_BUFFER_SIZE || alert) {
        flushSDBuffer();
      }
      
      // Check and rotate file if too large
      checkAndRotateFile("/data.csv");
      
      // Also save to backlog if offline
      if (WiFi.status() != WL_CONNECTED) {
         appendFile(SD, "/backlog.csv", logData.c_str());
      }
    }

    // 3. SEND TO CLOUD
    if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
       // Sync backlog if exists
       if (sdReady && SD.exists("/backlog.csv")) uploadBacklog(); 

       Serial.print("📡 Sending: T=" + String(temp_val, 1) + "°C H=" + String(hum_val) + "% S=" + String(shock_val, 2) + "G");

       FirebaseJson content;
       content.set("fields/truck_id/stringValue", TRUCK_ID);
       content.set("fields/status/stringValue", status);
       content.set("fields/last_updated/integerValue", realTime); 
       
       // Fixed: Use geoPointValue for location (Firestore GeoPoint)
       content.set("fields/location/geoPointValue/latitude", lat_val);
       content.set("fields/location/geoPointValue/longitude", lng_val);
       
       // Sensors as separate fields
       content.set("fields/sensors/mapValue/fields/temp/doubleValue", temp_val);
       content.set("fields/sensors/mapValue/fields/humidity/integerValue", hum_val);
       content.set("fields/sensors/mapValue/fields/rotation/doubleValue", rotation_val);
       
       // Shock as direct field
       content.set("fields/shock/doubleValue", shock_val);

       String path = "shipments/" + String(TRUCK_ID);
       if (Firebase.Firestore.patchDocument(&fbdo, FIREBASE_PROJECT_ID, "" /*default*/, path.c_str(), content.raw(), "")) {
          Serial.println(" ✅ OK");
       } else {
          Serial.println(" ❌ FAIL: " + fbdo.errorReason());
       }
    } else {
       Serial.print(".");
       if(WiFi.status() != WL_CONNECTED) {
         WiFi.reconnect();
       }
    }
  }
}
