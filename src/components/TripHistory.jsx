import React, { useState, useEffect } from 'react';
import {
  Download,
  Calendar,
  Globe,
  X,
  Loader,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Truck
} from 'lucide-react';
import {
  fetchTripHistory,
  filterTripsByDateRange,
  generateAndDownloadCSV,
  calculateTripStats,
  formatDateTime,
  generateDemoTripData
} from '../tripHistoryHelper';

const TripHistory = ({ lang = 'en', isOpen, onClose, translations = {} }) => {
  const [trips, setTrips] = useState([]);
  const [filteredTrips, setFilteredTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [selectedLang, setSelectedLang] = useState(lang);
  const [connectionStatus, setConnectionStatus] = useState('Demo Data (Demo Data)');
  const [isConnected, setIsConnected] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState('demo'); // 'demo' or device ID like 'gj-01'
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [stats, setStats] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState(null);

  // Get translations for Trip History
  const t = translations?.tripHistory || {
    tripHistory: 'Trip History',
    loadingTrips: 'Loading trip data...',
    noTrips: 'No trips found in selected date range',
    dateFrom: 'From Date',
    dateTo: 'To Date',
    csvLanguage: 'CSV Language',
    generateCSV: 'Generate CSV',
    demoCSV: 'Demo CSV',
    downloadSuccess: 'CSV downloaded successfully!',
    downloadError: 'Error downloading CSV',
    statistics: 'Statistics',
    totalTrips: 'Total Trips',
    totalDistance: 'Total Distance (km)',
    totalDuration: 'Total Duration (hrs)',
    avgTemp: 'Avg Temperature',
    maxTemp: 'Max Temperature',
    minTemp: 'Min Temperature',
    compliancePassed: 'Compliance Passed',
    tripID: 'Trip ID',
    startTime: 'Start Time',
    endTime: 'End Time',
    duration: 'Duration',
    distance: 'Distance',
    temperature: 'Avg Temp',
    compliance: 'Compliance',
    passed: 'Passed',
    failed: 'Failed',
    warning: 'Warning'
  };

  // Load real trip data on component mount or when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Load demo data by default
      loadDemoData();
    }
  }, [isOpen]);

  // Sync language prop to selectedLang state when lang prop changes
  useEffect(() => {
    setSelectedLang(lang);
  }, [lang]);

  // Filter trips by date range when dates change
  useEffect(() => {
    if (trips.length > 0) {
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);

      const filtered = filterTripsByDateRange(trips, fromDate, toDate);
      setFilteredTrips(filtered);
      setStats(calculateTripStats(filtered));
    } else {
      // No trips - clear filtered trips and stats
      setFilteredTrips([]);
      setStats(null);
    }
  }, [dateFrom, dateTo, trips]);

  const loadDemoData = () => {
    const demoData = generateDemoTripData();
    setTrips(demoData);
    setShowDemo(true);
    setIsConnected(false);
    setConnectionStatus('Demo Data');
  };

  const loadTrips = async (deviceId = 'demo') => {
    setLoading(true);
    try {
      // If demo is selected, just load demo data
      if (deviceId === 'demo') {
        loadDemoData();
        return;
      }

      // For real trucks - NEVER show demo data, only real data
      const result = await fetchTripHistory({ deviceId });
      
      // Handle new return object format with { trips, connected, status }
      if (result && typeof result === 'object' && 'trips' in result) {
        setTrips(result.trips || []);
        setIsConnected(result.connected || false);
        setConnectionStatus(result.status || 'Unknown Status');
      } else {
        // Fallback for old format (array)
        setTrips(Array.isArray(result) ? result : []);
        setIsConnected(false);
        setConnectionStatus(`${deviceId} - Not Connected`);
      }
      setShowDemo(false);
    } catch (error) {
      console.error('Error loading trips:', error);
      // For real trucks: show empty data, NOT demo data
      setTrips([]);
      setIsConnected(false);
      setConnectionStatus(`${deviceId} - Connection Error (No Data)`);
      setShowDemo(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemo = () => {
    setSelectedDevice('demo');
    loadDemoData();
  };

  const handleDeviceChange = (deviceId) => {
    setSelectedDevice(deviceId);
    loadTrips(deviceId);
  };

  const handleGenerateCSV = (useDemo = false) => {
    const dataToExport = useDemo ? generateDemoTripData() : filteredTrips;
    
    if (dataToExport.length === 0) {
      setDownloadStatus('no-data');
      setTimeout(() => setDownloadStatus(null), 3000);
      return;
    }

    // Determine status string for CSV
    let csvConnectionStatus = connectionStatus;
    if (useDemo) {
      csvConnectionStatus = 'Demo Data (Not Connected)';
    } else if (!isConnected) {
      csvConnectionStatus = 'Not Connected';
    }

    const success = generateAndDownloadCSV(
      dataToExport,
      selectedLang,
      `trip_history_${dateFrom}_to_${dateTo}.csv`,
      csvConnectionStatus
    );

    if (success) {
      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus(null), 3000);
    } else {
      setDownloadStatus('error');
      setTimeout(() => setDownloadStatus(null), 3000);
    }
  };

  const getComplianceColor = (status) => {
    switch (status) {
      case 'PASSED':
        return '#4caf50';
      case 'FAILED':
        return '#f44336';
      case 'WARNING':
        return '#ff9800';
      default:
        return '#999';
    }
  };

  const getComplianceIcon = (status) => {
    if (status === 'PASSED') return <CheckCircle size={16} style={{ color: '#4caf50' }} />;
    if (status === 'FAILED') return <AlertCircle size={16} style={{ color: '#f44336' }} />;
    return <AlertCircle size={16} style={{ color: '#ff9800' }} />;
  };

  if (!isOpen) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: isMobile ? '10px' : '20px',
        overflow: 'auto'
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: isMobile ? '8px' : '12px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '900px',
          maxHeight: isMobile ? '95vh' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '12px' : '20px',
            borderBottom: '1px solid #eee',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            gap: isMobile ? '10px' : '0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '15px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: isMobile ? '5px' : '10px', fontSize: isMobile ? '14px' : '18px' }}>
              <TrendingUp size={isMobile ? 18 : 24} />
              {isMobile ? 'Trips' : t.tripHistory || 'Trip History'}
            </h2>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isMobile ? '4px 8px' : '6px 12px',
              borderRadius: '20px',
              background: isConnected ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
              border: `1px solid ${isConnected ? '#4caf50' : '#f44336'}`,
              fontSize: isMobile ? '10px' : '12px',
              fontWeight: '600',
              color: isConnected ? '#4caf50' : '#f44336'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isConnected ? '#4caf50' : '#f44336'
              }}></div>
              {isConnected ? 'Connected' : 'Not Connected'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '20px' }}>
          {/* Controls Section */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: isMobile ? '10px' : '15px',
              marginBottom: '25px',
              padding: isMobile ? '12px' : '15px',
              background: '#f5f5f5',
              borderRadius: '8px'
            }}
          >
            {/* Device/Vehicle Selector */}
            <div>
              <label style={{ display: 'block', fontSize: isMobile ? '11px' : '12px', fontWeight: '600', marginBottom: '5px', color: '#666' }}>
                <Truck size={14} style={{ marginRight: '5px' }} /> Vehicle/Device
              </label>
              <select
                value={selectedDevice}
                onChange={(e) => handleDeviceChange(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  background: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                <option value="demo">📊 Demo Data</option>
                <optgroup label="--- Real Trucks (Live) ---">
                  <option value="GJ-01-LIVE">🚛 GJ-01-LIVE (Rohit Sharma)</option>
                  <option value="VAC13143">🚛 VAC13143 (Rudra Pratap)</option>
                  <option value="MH-12-9988">🚛 MH-12-9988 (Shaurya Mudgal)</option>
                  <option value="GJ-05-1122">🚛 GJ-05-1122 (Vikram Singh)</option>
                  <option value="MH-04-5544">🚛 MH-04-5544 (Amit Sharma)</option>
                </optgroup>
              </select>
            </div>

            {/* Date From */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#666' }}>
                <Calendar size={14} style={{ marginRight: '5px' }} /> {t.dateFrom || 'From Date'}
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#666' }}>
                <Calendar size={14} style={{ marginRight: '5px' }} /> {t.dateTo || 'To Date'}
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Language Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: '#666' }}>
                <Globe size={14} style={{ marginRight: '5px' }} /> {t.csvLanguage || 'CSV Language'}
              </label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  background: 'white'
                }}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="gu">ગુજરાતી</option>
                <option value="pa">ਪੰਜਾਬੀ</option>
                <option value="mr">मराठी</option>
                <option value="bn">বাংলা</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: isMobile ? '8px' : '10px',
              marginBottom: '25px',
              flexWrap: 'wrap',
              justifyContent: isMobile ? 'stretch' : 'flex-start'
            }}
          >
            <button
              onClick={() => handleGenerateCSV(false)}
              disabled={loading || filteredTrips.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: isMobile ? '8px 12px' : '10px 16px',
                background: filteredTrips.length === 0 ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: filteredTrips.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                flex: isMobile ? 1 : 'auto'
              }}
              onMouseEnter={(e) => {
                if (filteredTrips.length > 0) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 5px 15px rgba(102, 126, 234, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              <Download size={16} /> {t.generateCSV || 'Generate CSV'}
            </button>

            <button
              onClick={() => loadTrips(selectedDevice)}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: isMobile ? '8px 12px' : '10px 16px',
                background: loading ? '#ccc' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                flex: isMobile ? 1 : 'auto'
              }}
            >
              {loading && <Loader size={isMobile ? 14 : 16} style={{ animation: 'spin 1s linear infinite' }} />}
              Refresh
            </button>

            {showDemo && (
              <button
                onClick={handleLoadDemo}
                style={{
                  padding: '10px 16px',
                  background: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.3s ease'
                }}
              >
                Load Demo Data
              </button>
            )}
          </div>

          {/* Status Messages */}
          {downloadStatus === 'success' && (
            <div style={{
              padding: '12px 16px',
              background: '#c8e6c9',
              color: '#2e7d32',
              borderRadius: '6px',
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <CheckCircle size={18} /> {t.downloadSuccess || 'CSV downloaded successfully!'}
            </div>
          )}

          {downloadStatus === 'error' && (
            <div style={{
              padding: '12px 16px',
              background: '#ffcdd2',
              color: '#c62828',
              borderRadius: '6px',
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={18} /> {t.downloadError || 'Error downloading CSV'}
            </div>
          )}

          {downloadStatus === 'no-data' && (
            <div style={{
              padding: '12px 16px',
              background: '#fff3cd',
              color: '#856404',
              borderRadius: '6px',
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={18} /> {t.noTrips || 'No trips found in selected date range'}
            </div>
          )}

          {/* Statistics Section */}
          {stats && !loading && (
            <div
              style={{
                background: '#f9f9f9',
                padding: isMobile ? '12px' : '20px',
                borderRadius: '8px',
                marginBottom: '25px',
                border: '1px solid #eee'
              }}
            >
              <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: isMobile ? '14px' : '16px', fontWeight: '600' }}>
                {t.statistics || 'Statistics'}
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: isMobile ? '10px' : '15px'
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: '#667eea' }}>{stats.totalTrips}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#666', marginTop: '5px' }}>{t.totalTrips || 'Total Trips'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: '#667eea' }}>{stats.totalDistance.toFixed(1)}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#666', marginTop: '5px' }}>{isMobile ? 'Distance (km)' : t.totalDistance || 'Total Distance (km)'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: '#667eea' }}>{(stats.totalDuration / 60).toFixed(1)}</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#666', marginTop: '5px' }}>{isMobile ? 'Duration (hrs)' : t.totalDuration || 'Total Duration (hrs)'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: '#667eea' }}>{stats.avgTemp}°C</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#666', marginTop: '5px' }}>{t.avgTemp || 'Avg Temp'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: 'bold', color: '#f44336' }}>{stats.maxTemp}°C</div>
                  <div style={{ fontSize: isMobile ? '10px' : '12px', color: '#666', marginTop: '5px' }}>{t.maxTemp || 'Max Temp'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4caf50' }}>{stats.minTemp}°C</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{t.minTemp || 'Min Temp'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px'
            }}>
              <Loader size={40} style={{
                animation: 'spin 1s linear infinite',
                color: '#667eea',
                marginBottom: '15px'
              }} />
              <p style={{ color: '#666' }}>{t.loadingTrips || 'Loading trip data...'}</p>
            </div>
          )}

          {/* Trips Table */}
          {!loading && filteredTrips.length > 0 && (
            <div style={{
              overflowX: 'auto',
              border: '1px solid #ddd',
              borderRadius: '8px',
              WebkitOverflowScrolling: 'touch'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: isMobile ? '11px' : '13px',
                minWidth: isMobile ? '600px' : 'auto'
              }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'left', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{isMobile ? 'ID' : t.tripID || 'Trip ID'}</th>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'left', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{isMobile ? 'Time' : t.startTime || 'Start Time'}</th>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'left', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{t.duration || 'Duration'}</th>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'left', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{t.distance || 'Distance'}</th>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'left', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{isMobile ? 'Temp' : t.temperature || 'Avg Temp'}</th>
                    <th style={{ padding: isMobile ? '8px' : '12px', textAlign: 'center', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>{t.compliance || 'Compliance'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip, idx) => (
                    <tr key={trip.id} style={{
                      borderBottom: '1px solid #eee',
                      background: idx % 2 === 0 ? '#fff' : '#f9f9f9'
                    }}>
                      <td style={{ padding: isMobile ? '8px' : '12px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: isMobile ? '9px' : '11px', color: '#667eea' }}>
                          {trip.id.substring(0, isMobile ? 8 : 12)}...
                        </span>
                      </td>
                      <td style={{ padding: isMobile ? '8px' : '12px', color: '#666', fontSize: isMobile ? '10px' : 'inherit', whiteSpace: 'nowrap' }}>{isMobile ? formatDateTime(trip.startTime).split(' ')[0] : formatDateTime(trip.startTime)}</td>
                      <td style={{ padding: isMobile ? '8px' : '12px', color: '#666', whiteSpace: 'nowrap' }}>{trip.duration} min</td>
                      <td style={{ padding: isMobile ? '8px' : '12px', color: '#666', whiteSpace: 'nowrap' }}>{trip.distance} km</td>
                      <td style={{ padding: isMobile ? '8px' : '12px', color: '#666', whiteSpace: 'nowrap' }}>{trip.avgTemp}°C</td>
                      <td style={{ padding: isMobile ? '8px' : '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? '2px' : '5px' }}>
                        {getComplianceIcon(trip.complianceStatus)}
                        {!isMobile && (
                          <span style={{ color: getComplianceColor(trip.complianceStatus) }}>
                            {t[trip.complianceStatus.toLowerCase()] || trip.complianceStatus}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No Trips Message */}
          {!loading && filteredTrips.length === 0 && trips.length > 0 && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#999'
            }}>
              <AlertCircle size={48} style={{ margin: '0 auto 15px', opacity: 0.5 }} />
              <p>{t.noTrips || 'No trips found in selected date range'}</p>
            </div>
          )}

          {/* Initial Empty State */}
          {!loading && trips.length === 0 && !showDemo && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: '#999'
            }}>
              <AlertCircle size={48} style={{ margin: '0 auto 15px', opacity: 0.5 }} />
              <p>Click "Refresh" to load trip data</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TripHistory;
