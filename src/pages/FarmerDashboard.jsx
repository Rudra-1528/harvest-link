import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from "firebase/firestore";
import { db } from '../firebase'; 
import { AlertTriangle, CheckCircle, Thermometer, Droplets, Leaf, WifiOff, Zap } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNotifications } from '../NotificationContext';
import { translations } from '../translations';
import { useOutletContext } from 'react-router-dom';

// --- 1. STATIC DUMMY SHIPMENTS ---
const staticShipments = [
  { 
    id: "MH-12-9988", 
    truck_id: "MH-12-9988",
    route: "Pune → Mumbai", 
    crop: "Alphonso Mangoes",
    status: "Active",
    sensors: { temp: 24, humidity: 60 },
    shock: 0.5,
    last_updated: Date.now() // Always online
  },
  { 
    id: "GJ-05-1122", 
    truck_id: "GJ-05-1122",
    route: "Surat → Vadodara", 
    crop: "Organic Bananas",
    status: "Active",
    sensors: { temp: 22, humidity: 55 },
    shock: 0.1,
    last_updated: Date.now() 
  }
];

const heroIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -10],
});

const normalizeTruckId = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const isHeroTruckId = (truckId) => normalizeTruckId(truckId).startsWith('GJ01');

const findHeroTruckKey = (liveDataMap) => {
  const keys = Object.keys(liveDataMap || {});
  if (!keys.length) return null;

  const heroCandidates = keys.filter(isHeroTruckId);
  if (!heroCandidates.length) return null;

  const livePreferred = heroCandidates.find((key) => normalizeTruckId(key).includes('LIVE'));
  if (livePreferred) return livePreferred;

  return heroCandidates[0];
};

const FarmerDashboard = () => {
  const [currentTime, setCurrentTime] = useState(Date.now()); 
  const [liveDataMap, setLiveDataMap] = useState({});
  const [deviceLocation, setDeviceLocation] = useState(null);
  const { notifications } = useNotifications();
  const { lang } = useOutletContext();
  const t = translations.dashboard?.[lang] || translations.dashboard?.['en'] || {};

  // --- 2. DATA LISTENER (Connects Once, Never Re-connects) ---
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "shipments"), (snapshot) => {
       const newMap = {};
       snapshot.docs.forEach(doc => {
          newMap[doc.data().truck_id] = doc.data();
       });
       setLiveDataMap(newMap);
    });
    return () => unsubscribe();
  }, []);

  // --- 3. FAST TIMER (500ms) for Instant Offline Detection ---
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 500); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setDeviceLocation({ lat, lng });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- 4. CALCULATE STATUS (useMemo) ---
  const trucks = useMemo(() => {
      // A. Process HERO TRUCK (GJ-01-LIVE)
      const heroTruckKey = findHeroTruckKey(liveDataMap);
      const heroLive = heroTruckKey ? liveDataMap[heroTruckKey] : null;
      const lastUpdate = heroLive && heroLive.last_updated ? Number(heroLive.last_updated) : 0;
      const hasHeroLive = Boolean(heroLive);
      
      // 20 Second Timeout Logic
      const isOffline = hasHeroLive ? (currentTime - lastUpdate) > 20000 : false;
      const heroLabel = heroTruckKey || 'GJ-01';
      const heroRouteStart = hasHeroLive || deviceLocation ? 'Current Location' : 'IIITM Gwalior';

      const heroTruck = {
        id: heroLabel,
        truck_id: heroLabel,
          route: `${heroRouteStart} → Gandhinagar`,
          crop: "Fresh Tomatoes 🍅",
          
          // Force Offline Values if Timed Out
          status: isOffline ? "Signal Lost" : (heroLive?.status || "Active"),
          sensors: isOffline ? { temp: 0, humidity: 0 } : (heroLive?.sensors || { temp: 0, humidity: 0 }),
          shock: isOffline ? 0 : Math.min(heroLive?.shock || 0, 2.5),
          
          isOffline: isOffline // Flag for styling
      };

      // B. Combine with Static Trucks
      const processedStatic = staticShipments.map(t => ({...t, isOffline: false}));
      
      return [heroTruck, ...processedStatic];

  }, [liveDataMap, currentTime, deviceLocation]);

  const dummyAlerts = useMemo(() => ([
    { id: 'dummy-temp', title: `VAC13143 • ${t.tempSpiked || 'High Temp'}`, detail: t.tempHigh || 'Spiked to 31°C near Nashik', status: t.critical || 'Critical', icon: <Thermometer size={16} color="#d32f2f" /> },
    { id: 'dummy-humidity', title: `GJ-05-1122 • ${t.humidityLow || 'Low Humidity'}`, detail: t.humidityDropped || 'Dropped below 40% during loading', status: t.warning || 'Warning', icon: <Droplets size={16} color="#f57c00" /> },
  ]), [t]);

  const liveAlerts = useMemo(() => notifications.map((n) => ({
    id: `live-${n.id}`,
    title: `${n.truck || 'GJ-01-LIVE'} • ${n.message}`,
    detail: n.value || 'Sensor alert',
    status: n.severity === 'critical' ? 'Critical' : 'Warning',
    icon: n.type === 'temperature' ? <Thermometer size={16} color="#d32f2f" />
      : n.type === 'humidity' ? <Droplets size={16} color="#f57c00" />
      : n.type === 'shock' ? <Zap size={16} color="#d32f2f" />
      : <AlertTriangle size={16} color="#f57c00" />, // fallback
  })), [notifications]);

  const combinedAlerts = useMemo(() => [...liveAlerts, ...dummyAlerts], [liveAlerts, dummyAlerts]);

  const heroPosition = useMemo(() => {
    const heroTruckKey = findHeroTruckKey(liveDataMap);
    const hero = (heroTruckKey ? liveDataMap[heroTruckKey] : null) || {};
    const lat = hero.lat ?? hero.latitude ?? hero._lat ?? hero._latitude 
              ?? hero.location?.lat ?? hero.location?.latitude ?? hero.location?._lat ?? hero.location?._latitude 
              ?? deviceLocation?.lat
              ?? 26.2521;
    const lng = hero.lng ?? hero.lon ?? hero.longitude ?? hero._lng ?? hero._longitude 
              ?? hero.location?.lng ?? hero.location?.lon ?? hero.location?.longitude ?? hero.location?._lng ?? hero.location?._longitude 
              ?? deviceLocation?.lng
              ?? 78.1760;
    const safeLat = Number(lat) || deviceLocation?.lat || 26.2521;
    const safeLng = Number(lng) || deviceLocation?.lng || 78.1760;
    return [safeLat, safeLng];
  }, [liveDataMap, deviceLocation]);

  return (
    <div style={{ padding: '20px', background: '#f5f7f6', minHeight: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ color: '#1b5e20', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>🌾 Kisan Cargo View</h1>
      <p style={{ color: '#666' }}>Real-time quality monitoring for your produce.</p>

      {/* Critical Alerts (live + dummy) */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '14px', boxShadow: '0 3px 12px rgba(0,0,0,0.06)', margin: '12px 0 20px 0', borderLeft: '5px solid #d32f2f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <AlertTriangle size={18} color="#d32f2f" />
          <div style={{ fontWeight: '700', color: '#333' }}>{t.criticalAlerts || "Critical Alerts"}</div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>{combinedAlerts.length} {t.items || 'items'}</span>
        </div>
        {combinedAlerts.length === 0 ? (
          <div style={{ color: '#777', fontSize: '13px' }}>{t.noAlerts || "No alerts right now."}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
            {combinedAlerts.map((a) => (
              <div key={a.id} style={{ border: '1px solid #f0f0f0', borderRadius: '10px', padding: '10px 12px', background: a.status === 'Critical' ? '#fff5f5' : '#fff9f0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div>{a.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#333' }}>{a.title}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{a.detail}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '700', color: a.status === 'Critical' ? '#c62828' : '#ef6c00' }}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {trucks.map(truck => {
           // Logic for UI Colors based on calculated state
           const isRisk = truck.status === 'At Risk';
           const isOffline = truck.isOffline;
           
           let healthScore = 100;
           let healthColor = '#2e7d32'; // Green
           let statusText = "Fresh / Safe";

           if (isRisk) {
               healthScore = 65;
               healthColor = '#d32f2f'; // Red
               statusText = "Spoilage Risk!";
           }
           if (isOffline) {
               healthScore = 0;
               healthColor = '#757575'; // Grey
               statusText = "Connection Lost";
           }

           return (
            <div key={truck.id} style={{ background: 'white', padding: '30px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', textAlign: 'center', borderTop: `6px solid ${healthColor}` }}>
               
               {/* Header */}
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                   <h2 style={{ color: '#333', margin: 0, fontSize: '22px' }}>{truck.truck_id}</h2>
                   {isOffline ? <WifiOff size={20} color="grey"/> : <div style={{width:'10px', height:'10px', background:'green', borderRadius:'50%', boxShadow:'0 0 5px green'}}></div>}
               </div>
               
               <p style={{ color: '#666', fontSize: '14px', margin: '0 0 5px 0' }}>{truck.route}</p>
               
               {/* CROP NAME */}
               <div style={{ background: '#e8f5e9', color: '#1b5e20', padding: '5px 10px', borderRadius: '15px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 'bold', marginBottom: '20px' }}>
                  <Leaf size={14}/> {truck.crop}
               </div>

               <div style={{ marginBottom: '5px', color: '#666', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase' }}>{t.healthIndex || 'Cargo Health Index'}</div>
               
               {/* BIG PERCENTAGE */}
               <div style={{ fontSize: '80px', fontWeight: '800', color: healthColor, lineHeight: '1', marginBottom: '5px' }}>
                  {healthScore}%
               </div>
               <div style={{ color: healthColor, fontWeight: 'bold', fontSize: '16px', marginBottom: '25px' }}>
                   {statusText === "Fresh / Safe" ? t.fresh : (statusText === "Spoilage Risk!" ? t.risk : (statusText === "Connection Lost" ? t.offline : statusText))}
               </div>

               {/* Sensor Table */}
               <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '12px', textAlign: 'left', opacity: isOffline ? 0.5 : 1 }}>
                  <Row label={t.tempLabel || "Temp (SHT30)"} value={`${truck.sensors?.temp || 0}°C`} />
                  <Row label={t.shockLabel || "Shock (Accel)"} value={`${truck.shock || 0}G`} color={truck.shock > 2 ? 'red' : 'green'} bold />
                  <Row label={t.humidityLabel || "Humidity"} value={`${truck.sensors?.humidity || 0}%`} />
               </div>

               {/* AI Monitor Box */}
               <div style={{ marginTop: '15px', background: isOffline ? '#eee' : '#e3f2fd', padding: '12px', borderRadius: '10px', textAlign: 'left', borderLeft: isOffline ? '4px solid grey' : '4px solid #1976d2' }}>
                  <div style={{ color: isOffline ? '#666' : '#1565c0', fontWeight: 'bold', fontSize: '12px' }}>{t.aiMonitor || 'AI Monitor (SVM):'}</div>
                  <div style={{ color: isOffline ? '#666' : '#0d47a1', fontSize: '14px' }}>
                      {isOffline ? t.waiting : (isRisk ? t.riskDetected : t.safe)}
                  </div>
               </div>
            </div>
           );
        })}
      </div>

      {/* Live driver location map */}
      <div style={{ marginTop: '24px', background: 'white', borderRadius: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', overflow: 'hidden', borderLeft: '5px solid #2e7d32' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f0f0f0', gap: '10px' }}>
          <NavigationPill />
          <div style={{ fontWeight: '700', color: '#1b5e20' }}>Driver Live Location (GJ-01-LIVE)</div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>Auto-updates from telematics</span>
        </div>
        <div style={{ height: '320px' }}>
          <MapContainer center={heroPosition} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} zoomControl={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={heroPosition} icon={heroIcon}>
              <Popup>
                <div style={{ fontWeight: '700', color: '#333' }}>GJ-01-LIVE</div>
                <div style={{ fontSize: '12px', color: '#555' }}>Driver current location</div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

const NavigationPill = () => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#e8f5e9', color: '#1b5e20', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
    <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#1b5e20', borderRadius: '50%' }}></span>
    Live Map
  </div>
);

const Row = ({ label, value, color = '#333', bold = false }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #eee' }}>
        <span style={{ color: '#666', fontSize: '14px' }}>{label}</span>
        <span style={{ fontWeight: bold ? '700' : '500', color: color, fontSize: '14px' }}>{value}</span>
    </div>
);

export default FarmerDashboard;