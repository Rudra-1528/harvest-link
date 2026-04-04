/**
 * Trip History Helper - Processes SD card data, generates CSV reports
 * Supports automatic data extraction and multi-language CSV generation
 */

/**
 * Generate mock/demo SD card trip data
 * Simulates real ESP32 uploaded data
 */
export const generateDemoTripData = () => {
  const today = new Date();
  const trips = [];

  for (let i = 0; i < 5; i++) {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - i);
    startDate.setHours(Math.floor(Math.random() * 12) + 6);
    startDate.setMinutes(Math.floor(Math.random() * 60));

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + Math.floor(Math.random() * 4) + 2);

    const tempVariation = Math.random() * 4 - 2;
    trips.push({
      id: `TRIP_${Date.now()}_${i}`,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      duration: Math.floor((endDate - startDate) / 1000 / 60), // minutes
      distance: (Math.random() * 80 + 20).toFixed(2), // km
      avgTemp: (18 + tempVariation).toFixed(1), // °C
      maxTemp: (25 + tempVariation).toFixed(1),
      minTemp: (12 + tempVariation).toFixed(1),
      humidity: Math.floor(Math.random() * 30 + 50), // %
      startLocation: 'Farm A - Village',
      endLocation: 'Market Hub - City',
      vehicleId: 'TRUCK_001',
      driverId: 'DRV_123',
      farmerId: 'FARM_001',
      complianceStatus: 'PASSED', // PASSED, FAILED, WARNING
      notes: 'Automatic SD card upload from ESP32'
    });
  }

  return trips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
};

/**
 * List of real trucks - these are actual devices that should connect to backend API
 */
const REAL_TRUCKS = ['GJ-01-LIVE', 'VAC13143', 'MH-12-9988', 'GJ-05-1122', 'MH-04-5544'];

/**
 * Check if device is a real truck (not demo)
 */
const isRealTruck = (deviceId) => {
  return REAL_TRUCKS.includes(deviceId);
};

/**
 * Get real trip data from Firebase or backend
 * Connects to actual SD card data from devices like gj-01
 */
export const fetchTripHistory = async (filters = {}) => {
  const { deviceId = 'demo', dateFrom, dateTo, limit = 50 } = filters;
  
  // If demo device is requested, return demo data
  if (deviceId === 'demo') {
    return {
      trips: generateDemoTripData(),
      connected: false,
      status: 'Demo Data'
    };
  }

  // Check if this is a real truck
  const realTruck = isRealTruck(deviceId);

  try {
    // Try to fetch from backend API for specific device
    // Example endpoint: /api/v1/trips/history?deviceId=GJ-01-LIVE
    const queryParams = new URLSearchParams({
      deviceId,
      limit: limit.toString()
    });
    if (dateFrom) queryParams.append('dateFrom', dateFrom);
    if (dateTo) queryParams.append('dateTo', dateTo);

    const response = await fetch(`/api/v1/trips/history?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        trips: data.trips || [],
        connected: true,
        status: `Connected to ${deviceId}`
      };
    } else if (response.status === 404) {
      // Device not found or no data
      console.warn(`Device ${deviceId} not found`);
      
      if (realTruck) {
        // Real truck: show NOT CONNECTED, no demo fallback
        return {
          trips: [],
          connected: false,
          status: `${deviceId} - Not Connected (Waiting for data)`
        };
      } else {
        // Demo truck: fallback to demo data
        return {
          trips: generateDemoTripData(),
          connected: false,
          status: `${deviceId} - Demo Data`
        };
      }
    } else {
      console.warn('API error for', deviceId);
      
      if (realTruck) {
        // Real truck: show NOT CONNECTED, no demo fallback
        return {
          trips: [],
          connected: false,
          status: `${deviceId} - Connection Failed`
        };
      } else {
        // Demo truck: fallback to demo data
        return {
          trips: generateDemoTripData(),
          connected: false,
          status: `${deviceId} - Demo Data`
        };
      }
    }
  } catch (error) {
    console.warn(`Error connecting to ${deviceId}:`, error.message);
    
    if (realTruck) {
      // Real truck: show NOT CONNECTED, no demo fallback
      return {
        trips: [],
        connected: false,
        status: `${deviceId} - Not Connected (No data available)`
      };
    } else {
      // Demo truck: fallback to demo data
      return {
        trips: generateDemoTripData(),
        connected: false,
        status: `${deviceId} - Demo Data`
      };
    }
  }
};

/**
 * Filter trips by date range
 */
export const filterTripsByDateRange = (trips, startDate, endDate) => {
  return trips.filter(trip => {
    const tripStart = new Date(trip.startTime);
    return tripStart >= startDate && tripStart <= endDate;
  });
};

/**
 * Format date for display
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Format time for display
 */
export const formatTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Format datetime for display
 */
export const formatDateTime = (dateString) => {
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
};

/**
 * Translate column headers based on language
 */
const getColumnHeaders = (lang = 'en') => {
  const headers = {
    en: {
      tripId: 'Trip ID',
      startTime: 'Start Time',
      endTime: 'End Time',
      duration: 'Duration (min)',
      distance: 'Distance (km)',
      avgTemp: 'Avg Temp (°C)',
      maxTemp: 'Max Temp (°C)',
      minTemp: 'Min Temp (°C)',
      humidity: 'Humidity (%)',
      startLocation: 'Start Location',
      endLocation: 'End Location',
      vehicleId: 'Vehicle ID',
      driverId: 'Driver ID',
      farmerId: 'Farmer ID',
      complianceStatus: 'Compliance Status',
      notes: 'Notes'
    },
    hi: {
      tripId: 'यात्रा आईडी',
      startTime: 'शुरुआत का समय',
      endTime: 'समाप्ति का समय',
      duration: 'अवधि (मिनट)',
      distance: 'दूरी (किमी)',
      avgTemp: 'औसत तापमान (°C)',
      maxTemp: 'अधिकतम तापमान (°C)',
      minTemp: 'न्यूनतम तापमान (°C)',
      humidity: 'आर्द्रता (%)',
      startLocation: 'प्रारंभ स्थान',
      endLocation: 'समाप्ति स्थान',
      vehicleId: 'वाहन आईडी',
      driverId: 'ड्राइवर आईडी',
      farmerId: 'किसान आईडी',
      complianceStatus: 'अनुपालन स्थिति',
      notes: 'नोट्स'
    },
    gu: {
      tripId: 'ટ્રિપ આઈડી',
      startTime: 'શરૂઆતનો સમય',
      endTime: 'સમાપ્તિનો સમય',
      duration: 'અવધિ (મિનિટ)',
      distance: 'અંતર (કિમી)',
      avgTemp: 'સરેરાશ તાપમાન (°C)',
      maxTemp: 'મહત્તમ તાપમાન (°C)',
      minTemp: 'ન્યૂનતમ તાપમાન (°C)',
      humidity: 'આર્દ્રતા (%)',
      startLocation: 'શરૂઆતનું સ્થાન',
      endLocation: 'સમાપ્તિનું સ્થાન',
      vehicleId: 'વાહન આઈડી',
      driverId: 'ડ્રાઈવર આઈડી',
      farmerId: 'કૃષક આઈડી',
      complianceStatus: 'સમર્થન સ્થિતિ',
      notes: 'નોટ્સ'
    },
    pa: {
      tripId: 'ਯਾਤਰਾ ਆਈਡੀ',
      startTime: 'ਸ਼ੁਰੂਆਤ ਦਾ ਸਮਾਂ',
      endTime: 'ਸਮਾਪਤੀ ਦਾ ਸਮਾਂ',
      duration: 'ਮਿਆਦ (ਮਿੰਟ)',
      distance: 'ਦੂਰੀ (ਕਿਮੀ)',
      avgTemp: 'ਔਸਤ ਤਾਪਮਾਨ (°C)',
      maxTemp: 'ਵੱਧ ਤੋਂ ਵੱਧ ਤਾਪਮਾਨ (°C)',
      minTemp: 'ਘੱਟ ਤੋਂ ਘੱਟ ਤਾਪਮਾਨ (°C)',
      humidity: 'ਨਮੀ (%)',
      startLocation: 'ਸ਼ੁਰੂਆਤ ਦੀ ਥਾਂ',
      endLocation: 'ਸਮਾਪਤੀ ਦੀ ਥਾਂ',
      vehicleId: 'ਵਾਹਨ ਆਈਡੀ',
      driverId: 'ਡਰਾਈਵਰ ਆਈਡੀ',
      farmerId: 'ਕਿਸਾਨ ਆਈਡੀ',
      complianceStatus: 'ਪਾਲਣਾ ਸਥਿਤੀ',
      notes: 'ਨੋਟ'
    },
    mr: {
      tripId: 'ट्रिप आयडी',
      startTime: 'सुरुवातीन वेळ',
      endTime: 'समाप्तीची वेळ',
      duration: 'कालावधी (मिनिट)',
      distance: 'अंतर (किमी)',
      avgTemp: 'सरासरी तापमान (°C)',
      maxTemp: 'जास्तीत जास्त तापमान (°C)',
      minTemp: 'किमानचे तापमान (°C)',
      humidity: 'आर्द्रता (%)',
      startLocation: 'सुरुवातीचे स्थान',
      endLocation: 'समाप्तीचे स्थान',
      vehicleId: 'वाहन आयडी',
      driverId: 'ड्राइव्हर आयडी',
      farmerId: 'शेतकरी आयडी',
      complianceStatus: 'अनुपालन स्थिती',
      notes: 'नोट्स'
    },
    bn: {
      tripId: 'ট্রিপ আইডি',
      startTime: 'শুরুর সময়',
      endTime: 'শেষ সময়',
      duration: 'সময়কাল (মিনিট)',
      distance: 'দূরত্ব (কিমি)',
      avgTemp: 'গড় তাপমাত্রা (°C)',
      maxTemp: 'সর্বাধিক তাপমাত্রা (°C)',
      minTemp: 'সর্বনিম্ন তাপমাত্রা (°C)',
      humidity: 'আর্দ্রতা (%)',
      startLocation: 'শুরুর অবস্থান',
      endLocation: 'শেষ অবস্থান',
      vehicleId: 'গাড়ির আইডি',
      driverId: 'ড্রাইভার আইডি',
      farmerId: 'কৃষক আইডি',
      complianceStatus: 'সম্মতি স্থিতি',
      notes: 'নোটস'
    }
  };

  return headers[lang] || headers['en'];
};

/**
 * Translate compliance status based on language
 */
const getComplianceStatusTranslation = (status, lang = 'en') => {
  const translations = {
    en: {
      'PASSED': 'Passed',
      'FAILED': 'Failed',
      'WARNING': 'Warning'
    },
    hi: {
      'PASSED': 'पास',
      'FAILED': 'विफल',
      'WARNING': 'चेतावनी'
    },
    gu: {
      'PASSED': 'પાસ',
      'FAILED': 'નિષ્ફળ',
      'WARNING': 'ચેતવણી'
    },
    pa: {
      'PASSED': 'ਪਾਸ',
      'FAILED': 'ਅਸਫਲ',
      'WARNING': 'ਚੇતਾਵਨੀ'
    },
    mr: {
      'PASSED': 'पास',
      'FAILED': 'अपयश',
      'WARNING': 'चेतावणी'
    },
    bn: {
      'PASSED': 'পাস',
      'FAILED': 'ব্যর্থ',
      'WARNING': 'সতর্কতা'
    }
  };

  const langTranslations = translations[lang] || translations['en'];
  return langTranslations[status] || status;
};

/**
 * Generate CSV content with language support and connection status
 */
export const generateCSVContent = (trips, lang = 'en', connectionStatus = 'Connected') => {
  if (!trips || trips.length === 0) {
    return `"Connection Status","${connectionStatus}"\n\n"No data available"`;
  }

  const headers = getColumnHeaders(lang);
  const columnOrder = [
    'tripId', 'startTime', 'endTime', 'duration', 'distance',
    'avgTemp', 'maxTemp', 'minTemp', 'humidity',
    'startLocation', 'endLocation', 'vehicleId', 'driverId',
    'farmerId', 'complianceStatus', 'notes'
  ];

  // Add connection status at the top
  let csvContent = `"Connection Status","${connectionStatus}"\n`;
  csvContent += `"Generated Date","${new Date().toLocaleString()}"\n\n`;

  // Create header row
  const headerRow = columnOrder.map(col => `"${headers[col]}"`).join(',');

  // Create data rows
  const dataRows = trips.map(trip => {
    return columnOrder.map(col => {
      let value = trip[col];

      // Format datetime fields
      if (col === 'startTime' || col === 'endTime') {
        value = formatDateTime(value);
      }

      // Translate compliance status based on language
      if (col === 'complianceStatus' && value) {
        value = getComplianceStatusTranslation(value, lang);
      }

      // Ensure string values are quoted and escape quotes
      if (typeof value === 'string') {
        value = `"${value.replace(/"/g, '""')}"`;
      } else if (value === null || value === undefined) {
        value = '""';
      }

      return value;
    }).join(',');
  });

  return csvContent + headerRow + '\n' + dataRows.join('\n');
};

/**
 * Download CSV file
 */
export const downloadCSV = (csvContent, filename = 'trip_history.csv') => {
  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return true;
  } catch (error) {
    console.error('Error downloading CSV:', error);
    return false;
  }
};

/**
 * Generate CSV and trigger download with connection status
 */
export const generateAndDownloadCSV = (trips, lang = 'en', filename = 'trip_history.csv', connectionStatus = 'Connected') => {
  const csvContent = generateCSVContent(trips, lang, connectionStatus);
  return downloadCSV(csvContent, filename);
};

/**
 * Calculate trip statistics
 */
export const calculateTripStats = (trips) => {
  if (!trips || trips.length === 0) {
    return {
      totalTrips: 0,
      totalDistance: 0,
      totalDuration: 0,
      avgTemp: 0,
      maxTemp: -Infinity,
      minTemp: Infinity,
      compliancePassed: 0
    };
  }

  return {
    totalTrips: trips.length,
    totalDistance: trips.reduce((sum, t) => sum + parseFloat(t.distance || 0), 0),
    totalDuration: trips.reduce((sum, t) => sum + (t.duration || 0), 0),
    avgTemp: (trips.reduce((sum, t) => sum + parseFloat(t.avgTemp || 0), 0) / trips.length).toFixed(1),
    maxTemp: Math.max(...trips.map(t => parseFloat(t.maxTemp || 0))).toFixed(1),
    minTemp: Math.min(...trips.map(t => parseFloat(t.minTemp || 0))).toFixed(1),
    compliancePassed: trips.filter(t => t.complianceStatus === 'PASSED').length
  };
};
