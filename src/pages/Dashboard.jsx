import React, { useEffect, useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from "firebase/firestore";
import { db } from '../firebase'; 
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import RoutingMachine from '../RoutingMachine'; 
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { translations } from '../translations'; 

// --- ICONS CONFIGURATION ---
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ 
    iconRetinaUrl: markerIcon2x, 
    iconUrl: markerIcon, 
    shadowUrl: markerShadow 
});

const truckIcon = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png', 
    iconSize: [40, 40], 
    iconAnchor: [20, 20], 
    popupAnchor: [0, -20] 
});

const truckIconOffline = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554936.png', 
    iconSize: [40, 40], 
    iconAnchor: [20, 20], 
    popupAnchor: [0, -20],
    className: 'grey-filter'
});

const warehouseIcon = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png', 
    iconSize: [35, 35], 
    iconAnchor: [17, 35], 
    popupAnchor: [0, -30] 
});

const WAREHOUSE_LOCATION = [23.215, 72.636];
const HERO_DEFAULT_LOCATION = { lat: 26.2521, lng: 78.1760 };

const normalizeTruckId = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const isHeroTruckId = (truckId) => {
    const normalized = normalizeTruckId(truckId);
    return normalized.startsWith('GJ01');
};

const findHeroTruckKey = (liveDataMap) => {
    const keys = Object.keys(liveDataMap || {});
    if (!keys.length) return null;

    const heroCandidates = keys.filter(isHeroTruckId);
    if (!heroCandidates.length) return null;

    const livePreferred = heroCandidates.find((key) => normalizeTruckId(key).includes('LIVE'));
    if (livePreferred) return livePreferred;

    return heroCandidates[0];
};

const toLatLng = (location, fallback) => {
    if (!location) return fallback;
    const lat = location.lat ?? location.latitude ?? location._lat ?? location._latitude;
    const lng = location.lng ?? location.lon ?? location.longitude ?? location._lng ?? location._longitude;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        return { lat: latNum, lng: lngNum };
    }
    return fallback;
};

const hasValidLatLng = (location) => {
    if (!location) return false;
    const lat = location.lat ?? location.latitude ?? location._lat ?? location._latitude;
    const lng = location.lng ?? location.lon ?? location.longitude ?? location._lng ?? location._longitude;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    return Number.isFinite(latNum) && Number.isFinite(lngNum);
};

// STATIC FLEET (Moved outside to prevent re-renders)
const STATIC_FLEET = [
    { id: "VAC13143", startCity: "Mumbai", endCity: "Nashik", location: { lat: 19.2183, lng: 72.9781 }, destCoords: [19.9975, 73.7898] },
    { id: "MH-12-9988", startCity: "Pune", endCity: "Mumbai", location: { lat: 18.75, lng: 73.4 }, destCoords: [19.0760, 72.8777] },
    { id: "GJ-05-1122", startCity: "Surat", endCity: "Vadodara", location: { lat: 21.70, lng: 72.99 }, destCoords: [22.3072, 73.1812] },
    { id: "MH-04-5544", startCity: "Thane", endCity: "Pune", location: { lat: 19.033, lng: 73.029 }, destCoords: [18.5204, 73.8567] }
];

// Helper to smooth map movement
const RecenterMap = ({ lat, lng }) => {
    const map = useMap();
    useEffect(() => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            map.flyTo([lat, lng], map.getZoom());
        }
    }, [lat, lng, map]);
    return null;
};

const Dashboard = () => {
  const { lang, isMobile } = useOutletContext(); 
  // If no language is passed, default to English (No Popup Logic Here)
  const t = translations.dashboard[lang] || translations.dashboard['en'];

  // State
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [liveDataMap, setLiveDataMap] = useState({});
  const [selectedTruckId, setSelectedTruckId] = useState("GJ-01-LIVE");
    const [deviceLocation, setDeviceLocation] = useState(null);

  const translateCity = (city) => {
    if (translations.cities[city] && translations.cities[city][lang]) {
        return translations.cities[city][lang];
    }
    return city; 
  };

  // 1. DATABASE LISTENER (Run Once)
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

  // 2. TIMER (Updates every 500ms for offline check)
  useEffect(() => {
    const timer = setInterval(() => {
        setCurrentTime(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);

    useEffect(() => {
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = Number(pos?.coords?.latitude);
                const lng = Number(pos?.coords?.longitude);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    setDeviceLocation({ lat, lng, lastUpdated: Date.now() });
                }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

  // 3. PROCESS DATA (Merge Live + Static)
  const trucks = useMemo(() => {
      // Process Static
      const processedStatic = STATIC_FLEET.map(t => {
        const live = liveDataMap[t.id];
        return {
          ...t,
          status: live?.status || "Moving",
          location: toLatLng(live?.location, t.location),
          sensors: live?.sensors || { temp: 24, humidity: 50 },
          shock: Math.min(live?.shock || 0.05, 2.5),
          rotation: live?.rotation || 0,
          destCoords: t.destCoords,
          isOffline: false
        };
      });

      // Process Hero
            const heroTruckKey = findHeroTruckKey(liveDataMap);
            const heroLive = heroTruckKey ? liveDataMap[heroTruckKey] : null;
      const lastUpdate = heroLive?.last_updated ? Number(heroLive.last_updated) : 0;
            const hasHeroLive = Boolean(heroLive);
            const isHeroOffline = hasHeroLive ? (currentTime - lastUpdate) > 20000 : false; // 20s Timeout
            const heroLocation = deviceLocation || HERO_DEFAULT_LOCATION;
            const heroStartCity = "Current Location";

      const heroTruck = {
                id: heroTruckKey || "GJ-01",
                startCity: heroStartCity,
        endCity: "Gandhinagar",
        destCoords: WAREHOUSE_LOCATION,
                status: isHeroOffline ? "Signal Lost" : (heroLive?.status || (deviceLocation ? "Live (Device GPS)" : "Active")),
                location: heroLocation,
        sensors: isHeroOffline ? { temp: 0, humidity: 0 } : (heroLive?.sensors || { temp: 0, humidity: 0 }),
        shock: isHeroOffline ? 0 : Math.min(heroLive?.shock || 0, 2.5),
        rotation: isHeroOffline ? 0 : (heroLive?.rotation || 0),
        isOffline: isHeroOffline
      };

      return [heroTruck, ...processedStatic];
    }, [liveDataMap, currentTime, deviceLocation]);

  const selectedTruck = trucks.find(t => t.id === selectedTruckId) || trucks[0];
  const currentHealth = !selectedTruck.isOffline ? (100 - (selectedTruck.status === 'At Risk' ? 40 : 0)) : 0;
    const heroTruck = trucks[0];
    const isGlobalOnline = heroTruck ? !heroTruck.isOffline : false;

  // 4. MEMOIZE ROUTE COORDINATES (Fixes the Flashing Map Issue)
  const routeStart = useMemo(() => {
      if (!hasValidLatLng(selectedTruck?.location)) return null;
      const lat = selectedTruck.location.lat ?? selectedTruck.location.latitude ?? selectedTruck.location._lat ?? selectedTruck.location._latitude;
      const lng = selectedTruck.location.lng ?? selectedTruck.location.lon ?? selectedTruck.location.longitude ?? selectedTruck.location._lng ?? selectedTruck.location._longitude;
      return [Number(lat), Number(lng)];
  }, [selectedTruck?.location?.lat, selectedTruck?.location?.latitude, selectedTruck?.location?.longitude, selectedTruck?.location?.lng]);

  const routeEnd = useMemo(() => {
      const coords = selectedTruck?.destCoords;
      if (!Array.isArray(coords) || coords.length !== 2) return null;
      const latNum = Number(coords[0]);
      const lngNum = Number(coords[1]);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
      return [latNum, lngNum];
  }, [selectedTruck?.destCoords]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '25px', paddingBottom: '20px' }}>
        
        {/* HEADER - CLEAN (No Popup Logic) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', color: 'var(--primary-green)', fontWeight: 'bold' }}>{t.header}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isGlobalOnline ? '#e8f5e9' : '#ffebee', padding: '6px 12px', borderRadius: '20px', border: isGlobalOnline ? '1px solid #c8e6c9' : '1px solid #ffcdd2' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isGlobalOnline ? '#2e7d32' : '#d32f2f', boxShadow: isGlobalOnline ? '0 0 8px #2e7d32' : 'none' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: isGlobalOnline ? '#2e7d32' : '#d32f2f' }}>{isGlobalOnline ? t.online : t.offline}</span>
            </div>
        </div>

        {/* TOP SECTION */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '30px', minHeight: isMobile ? 'auto' : '520px' }}>
            
            <div style={{ flex: 2, height: isMobile ? '400px' : '100%', minHeight: '400px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid white', position: 'relative', zIndex: 0 }}>
                <MapContainer center={[23.15, 72.74]} zoom={10} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {/* Auto-center map when truck moves */}
                    {hasValidLatLng(selectedTruck?.location) && (
                        <RecenterMap 
                            lat={selectedTruck.location.lat ?? selectedTruck.location.latitude ?? selectedTruck.location._lat ?? selectedTruck.location._latitude} 
                            lng={selectedTruck.location.lng ?? selectedTruck.location.lon ?? selectedTruck.location.longitude ?? selectedTruck.location._lng ?? selectedTruck.location._longitude} 
                        />
                    )}

                    {trucks.filter((truck) => hasValidLatLng(truck.location)).map(truck => {
                        const lat = truck.location.lat ?? truck.location.latitude ?? truck.location._lat ?? truck.location._latitude;
                        const lng = truck.location.lng ?? truck.location.lon ?? truck.location.longitude ?? truck.location._lng ?? truck.location._longitude;
                        return (
                        <Marker 
                            key={truck.id} 
                            position={[Number(lat), Number(lng)]} 
                            icon={truck.isOffline ? truckIconOffline : truckIcon} 
                            eventHandlers={{ click: () => setSelectedTruckId(truck.id) }}
                        >
                            <Popup><strong>{truck.id}</strong><br/>{truck.status}</Popup>
                        </Marker>
                        );
                    })}

                    {routeEnd && (
                        <Marker position={routeEnd} icon={warehouseIcon}>
                            <Popup>Destination</Popup>
                        </Marker>
                    )}

                    {/* FIXED: Removed 'key' prop to stop flashing, used memoized coords */}
                    {routeStart && routeEnd && (
                         <RoutingMachine start={routeStart} end={routeEnd} /> 
                    )}
                </MapContainer>
            </div>

            {/* HEALTH CARD */}
            <div style={{ flex: 1, background: 'white', borderRadius: '16px', padding: '25px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '5px solid var(--primary-green)' }}>
                {selectedTruck ? (
                    <>
                        <div style={{ borderBottom: '1px solid #eee', paddingBottom: '15px', marginBottom: '10px' }}>
                           <h2 style={{ margin: 0, color: '#1b5e20' }}>{selectedTruck.id}</h2>
                           <span style={{ fontSize: '13px', color: '#666' }}>{translateCity(selectedTruck.startCity)} → {translateCity(selectedTruck.endCity)}</span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h4 style={{ margin: 0, color: '#666', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>{t.systemHealth}</h4>
                            <div style={{ fontSize: '64px', fontWeight: '800', color: !selectedTruck.isOffline && currentHealth > 80 ? 'var(--primary-green)' : '#d32f2f', margin: '5px 0', lineHeight: '1' }}>{currentHealth}%</div>
                            <span style={{ fontSize: '13px', color: '#888' }}>{selectedTruck.isOffline ? "CONNECTION LOST" : t.analysis}</span>
                        </div>
                        <div style={{ background: '#fcfcfc', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid #eee' }}>
                            <Row label={t.tempLabel || "Temp (SHT30)"} value={`${selectedTruck.sensors.temp}°C`} />
                            <Row label={t.shockLabel || "Shock (Accel)"} value={`${selectedTruck.shock}G`} color={selectedTruck.isOffline ? "#999" : "var(--primary-green)"} bold />
                            <Row label={t.rotationLabel || "Rotation"} value={`${selectedTruck.rotation}°/s`} />
                            <Row label={t.humidityLabel || "Humidity"} value={`${selectedTruck.sensors.humidity || 0}%`} />
                        </div>
                        <div style={{ background: selectedTruck.isOffline ? '#eeeeee' : selectedTruck.status === 'At Risk' ? '#ffebee' : '#e3f2fd', padding: '15px', borderRadius: '12px', borderLeft: selectedTruck.isOffline ? '4px solid #999' : selectedTruck.status === 'At Risk' ? '4px solid #d32f2f' : '4px solid #1976d2' }}>
                            <div style={{ fontSize: '12px', color: selectedTruck.isOffline ? '#666' : '#1565c0', fontWeight: '700', marginBottom: '4px' }}>AI Monitor (SVM):</div>
                            <div style={{ fontSize: '13px', color: selectedTruck.isOffline ? '#555' : '#0d47a1', fontWeight: '500' }}>
                                {selectedTruck.isOffline ? "Waiting for connection..." : selectedTruck.status === 'At Risk' ? "Anomaly Detected - Possible Tampering" : "Safe Transit"}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#666' }}>
                             <span style={{ fontWeight: '500' }}>{t.syncStatus || 'Sync Status:'}</span>
                             <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedTruck.isOffline ? 'grey' : '#2e7d32' }}></span>
                             <span style={{ color: selectedTruck.isOffline ? 'grey' : '#2e7d32', fontWeight: '700' }}>{selectedTruck.isOffline ? (t.disconnected || "Disconnected") : (t.connected || "Live")}</span>
                        </div>
                    </>
                ) : (
                    <div style={{textAlign: 'center', color: '#999', padding: '40px 0'}}>Select a truck</div>
                )}
            </div>
        </div>

        {/* TABLE */}
        <div style={{ flex: 1, minHeight: '400px', background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--primary-green)', fontSize: '18px', fontWeight: '700' }}>{t.liveShipments}</h3>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
            <thead>
                <tr>
                    <th style={thStyle}>{t.truckId}</th>
                    <th style={thStyle}>{t.route}</th>
                    <th style={thStyle}>{t.status}</th>
                    <th style={thStyle}>{t.temp}</th>
                </tr>
            </thead>
            <tbody>
              {trucks.map(truck => (
                    <tr key={truck.id} onClick={() => setSelectedTruckId(truck.id)} style={{ background: selectedTruck && selectedTruck.id === truck.id ? '#f1f8e9' : '#fff', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }} className="hover-row">
                      <td style={tdStyleFirst}><span style={{fontWeight: '700', color: '#2d5a27'}}>{truck.id}</span></td>
                      <td style={tdStyle}>{translateCity(truck.startCity)} → {translateCity(truck.endCity)}</td>
                      <td style={tdStyle}>
                          <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', background: truck.isOffline ? '#eee' : truck.status === 'At Risk' ? '#ffebee' : '#e8f5e9', color: truck.isOffline ? '#666' : truck.status === 'At Risk' ? '#c62828' : '#2e7d32' }}>
                              {truck.status}
                          </span>
                      </td>
                      <td style={tdStyleLast}>{truck.sensors.temp}°C</td>
                    </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <style>{`
          .hover-row:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; }
          .grey-filter { filter: grayscale(100%); opacity: 0.7; }
        `}</style>
    </div>
  );
};

const Row = ({ label, value, color = '#333', bold = false }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#666', fontSize: '14px' }}>{label}</span>
        <span style={{ fontWeight: bold ? '700' : '500', color: color, fontSize: '14px' }}>{value}</span>
    </div>
);

const thStyle = { padding: '12px 20px', textAlign: 'left', color: '#888', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' };
const tdStyle = { padding: '16px 20px', color: '#444', fontSize: '14px', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' };
const tdStyleFirst = { ...tdStyle, borderLeft: '1px solid #f0f0f0', borderRadius: '10px 0 0 10px' };
const tdStyleLast = { ...tdStyle, borderRight: '1px solid #f0f0f0', borderRadius: '0 10px 10px 0', fontWeight: 'bold' };

export default Dashboard;