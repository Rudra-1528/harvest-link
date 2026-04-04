import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import { Search, Phone, User, Battery, Signal, MapPin, Truck, Map } from 'lucide-react';
import { collection, onSnapshot } from "firebase/firestore"; 
import { db } from '../firebase'; 
import { translations } from '../translations';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- TRUCK ICON FOR MAP ---
const truckIcon = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png', 
    iconSize: [40, 40], 
    iconAnchor: [20, 20], 
    popupAnchor: [0, -20] 
});

const truckIconOffline = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png', 
    iconSize: [40, 40], 
    iconAnchor: [20, 20], 
    popupAnchor: [0, -20],
    className: 'grayscale-icon'
});

const HERO_FALLBACK_COORDS = { lat: 26.2521, lng: 78.1760 }; // IIITM Visitor Hostel

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

const Fleet = () => {
  const { lang, isMobile } = useOutletContext(); 
  const location = useLocation();
  const t = translations.menu[lang] || translations.menu['en'];
  const isMapView = location.pathname === '/transporter-map';

  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(Date.now()); 
  // FIX 1: Store raw data separately to prevent connection resets
  const [liveDataMap, setLiveDataMap] = useState({}); 
  const [deviceLocation, setDeviceLocation] = useState(null);

  const toLatLngString = (location, fallback) => {
    if (!location) return fallback;
    const lat = location.lat ?? location.latitude ?? location._lat ?? location._latitude;
    const lng = location.lng ?? location.lon ?? location.longitude ?? location._lng ?? location._longitude;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      return `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`;
    }
    return fallback;
  };

  const staticTrucks = [
    { 
      id: "VAC13143", 
      driver: "Rudra Pratap", 
      driverId: "DRV-101",
      phone: "+919580214142", 
      route: "Mumbai → Nashik",
      img: "https://randomuser.me/api/portraits/men/32.jpg",
      defaultLocation: "19.0868, 72.8885" 
    },
    { 
      id: "MH-12-9988", 
      driver: "Shaurya Mudgal", 
      driverId: "DRV-102",
      phone: "+919354937688", 
      route: "Pune → Mumbai",
      img: "https://randomuser.me/api/portraits/men/45.jpg",
      defaultLocation: "18.5204, 73.8567"
    },
    { 
      id: "GJ-05-1122", 
      driver: "Vikram Singh", 
      driverId: "DRV-103",
      phone: "+919988777665", 
      route: "Surat → Vadodara",
      img: "https://randomuser.me/api/portraits/men/11.jpg",
      defaultLocation: "21.1702, 72.8311"
    },
    { 
      id: "MH-04-5544", 
      driver: "Amit Sharma", 
      driverId: "DRV-104",
      phone: "+919000011111", 
      route: "Thane → Pune",
      img: "https://randomuser.me/api/portraits/men/64.jpg",
      defaultLocation: "19.2183, 72.9781"
    },
  ];

  // --- FIX 2: RUN DATABASE LISTENER ONCE ONLY ---
  // The empty array [] means "Connect once and stay connected"
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

  // --- FIX 3: SEPARATE TIMER FOR OFFLINE CHECK ---
  // This updates the screen every 2 seconds without resetting the database
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 2000);
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

  // --- FIX 4: MERGE DATA ON THE FLY ---
  const fleetData = useMemo(() => {
      
      // A. Process Static Trucks
      const mergedStatic = staticTrucks.map(t => {
        const live = liveDataMap[t.id];
        
        // Check Offline Status using CURRENT TIME
        const lastUpdate = live && live.last_updated ? Number(live.last_updated) : 0;
        const isOffline = (currentTime - lastUpdate) > 20000; // 20s Timeout

        let status = "Stopped";
        let loc = t.defaultLocation; 
        let bat = 0;
        let sig = "Offline";

        if (live) {
           status = isOffline ? "Signal Lost" : (live.status || "Moving");
           if (live.location) {
             loc = toLatLngString(live.location, t.defaultLocation);
           }
           bat = isOffline ? 0 : 85; 
           sig = isOffline ? "Offline" : "Strong";
        }
        
        return { ...t, status, location: loc, battery: bat, signal: sig };
      });

      // B. Process HERO TRUCK (GJ-01-LIVE)
      const heroTruckKey = findHeroTruckKey(liveDataMap);
      const heroLive = heroTruckKey ? liveDataMap[heroTruckKey] : null;
      const heroLastUpdate = heroLive && heroLive.last_updated ? Number(heroLive.last_updated) : 0;
      const isHeroOffline = heroLive ? (currentTime - heroLastUpdate) > 20000 : false;
      const heroCoords = deviceLocation || HERO_FALLBACK_COORDS;
      const heroLocationString = `${heroCoords.lat.toFixed(4)}, ${heroCoords.lng.toFixed(4)}`;

      const heroTruck = {
        id: heroTruckKey || "GJ-01",
        driver: "Rohit Sharma", 
        driverId: "DRV-999",
        phone: "+916204773940", 
        img: "https://randomuser.me/api/portraits/men/75.jpg",
        route: "Current Location → Gandhinagar",
        
        status: isHeroOffline ? "Signal Lost" : (heroLive?.status || "Active"),
        location: heroLocationString,
        battery: isHeroOffline ? 0 : 92,
        signal: isHeroOffline ? "Offline" : "Strong"
      };

      return [heroTruck, ...mergedStatic];

  }, [liveDataMap, currentTime, deviceLocation]); // Re-runs ONLY when data arrives OR time changes

  const handleCall = (name, number) => {
    const cleanNumber = number.replace(/\s/g, '');
    window.location.href = `tel:${cleanNumber}`;
  };

  const filteredTrucks = fleetData.filter(t => 
    t.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.driver.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // MAP VIEW
  if (isMapView) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px', background: 'white', borderBottom: '2px solid #2e7d32' }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', color: '#1b5e20' }}>Live Fleet Map</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Real-time vehicle tracking</p>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer 
            center={[20.5937, 78.9629]} 
            zoom={5}
            style={{ height: '100%', width: '100%' }} 
            zoomControl={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {fleetData.map(truck => {
              if (typeof truck.location !== 'string') return null;
              const coords = truck.location.split(',').map(c => parseFloat(c.trim()));
              if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
              const isOffline = truck.signal === 'Offline';
              
              return (
                <Marker 
                  key={truck.id} 
                  position={coords} 
                  icon={isOffline ? truckIconOffline : truckIcon}>
                  <Popup>
                    <div style={{ minWidth: '200px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px', color: '#1b5e20' }}>
                        {truck.id}
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Driver:</strong> {truck.driver}
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Route:</strong> {truck.route}
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Status:</strong> <span style={{ 
                          color: truck.status === 'Signal Lost' ? '#757575' : truck.status === 'At Risk' ? '#d32f2f' : '#2e7d32',
                          fontWeight: 'bold' 
                        }}>{truck.status}</span>
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Battery:</strong> {truck.battery}%
                      </div>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Signal:</strong> {truck.signal}
                      </div>
                      <button 
                        onClick={() => handleCall(truck.driver, truck.phone)} 
                        style={{ 
                          marginTop: '10px', 
                          width: '100%', 
                          padding: '8px', 
                          background: '#2e7d32', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '6px', 
                          cursor: 'pointer', 
                          fontWeight: 'bold' 
                        }}>
                        Call Driver
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    );
  }

  // LIST VIEW (DEFAULT)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '20px', padding: isMobile ? '12px' : '0' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', color: '#1b5e20' }}>Gaadi Maalik Dashboard</h1>
                <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Fleet & Driver Management (ट्रांसपोर्टर व्यू)</p>
            </div>
            <div style={{ position: 'relative', width: isMobile ? '100%' : 'auto' }}>
                <Search size={18} color="#888" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '12px 12px 12px 45px', borderRadius: '10px', border: '1px solid #ddd', width: isMobile ? '100%' : '280px', outline: 'none', fontSize: '14px' }} />
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? '12px' : '20px', overflowY: 'auto', paddingBottom: '20px' }}>
            {filteredTrucks.map(truck => (
                <div key={truck.id} style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderTop: truck.status === 'Signal Lost' ? '4px solid #757575' : truck.status === 'At Risk' ? '4px solid #d32f2f' : '4px solid #2e7d32' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#333' }}><Truck size={20} color="#004d40" />{truck.id}</div>
                        <span style={{ 
                            padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', 
                            background: truck.status === 'Signal Lost' ? '#eee' : truck.status === 'At Risk' ? '#ffebee' : '#e8f5e9', 
                            color: truck.status === 'Signal Lost' ? '#555' : truck.status === 'At Risk' ? '#d32f2f' : '#2e7d32' 
                        }}>
                            {truck.status}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                        <img src={truck.img} alt="Driver" style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #eee' }} />
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{truck.driver}</div>
                            <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> ID: {truck.driverId}</div>
                        </div>
                    </div>

                    <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '10px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '4px' }}>
                            <span style={{ color: '#666', display: 'flex', gap: '6px' }}><Map size={16}/> Route</span>
                            <span style={{ fontWeight: 'bold', color: '#1b5e20' }}>{truck.route}</span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#666', display: 'flex', gap: '6px' }}><MapPin size={16}/> GPS</span>
                            <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{truck.location}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666', display: 'flex', gap: '6px' }}><Battery size={16}/> Battery</span><span style={{ fontWeight: 'bold', color: truck.battery < 20 ? 'red' : 'green' }}>{truck.battery}%</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#666', display: 'flex', gap: '6px' }}><Signal size={16}/> Signal</span><span style={{ fontWeight: 'bold', color: truck.signal === 'Offline' ? 'red' : 'green' }}>{truck.signal}</span></div>
                    </div>

                    <button onClick={() => handleCall(truck.driver, truck.phone)} style={{ width: '100%', marginTop: '15px', padding: '12px', background: 'transparent', border: '1px solid #004d40', color: '#004d40', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <Phone size={18} /> Call Driver
                    </button>
                </div>
            ))}
        </div>
    </div>
  );
};

export default Fleet;