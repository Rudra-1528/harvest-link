import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Navigation, Clock, MapPin, MoveRight, WifiOff, Route } from 'lucide-react';

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -10],
});

const warehouseIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png',
  iconSize: [36, 36],
  iconAnchor: [18, 32],
  popupAnchor: [0, -10],
});

const haversineKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
};

const normalizeTruckId = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const isHeroTruckId = (truckId) => normalizeTruckId(truckId).startsWith('GJ01');

const DriverNavigation = () => {
  const [liveData, setLiveData] = useState({});
  const [lastUpdated, setLastUpdated] = useState(0);
  const [deviceLocation, setDeviceLocation] = useState(null);

  const destination = [23.215, 72.636];

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shipments'), (snap) => {
      const doc = snap.docs.find((d) => isHeroTruckId(d.data().truck_id));
      if (doc) {
        const data = doc.data();
        setLiveData(data);
        setLastUpdated(Number(data.last_updated || Date.now()));
      }
    });
    return () => unsub();
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

  const heroPosition = useMemo(() => {
    const lat = liveData.lat ?? liveData.latitude ?? liveData._lat ?? liveData._latitude 
              ?? liveData.location?.lat ?? liveData.location?.latitude ?? liveData.location?._lat ?? liveData.location?._latitude 
              ?? 26.2521;
    const lng = liveData.lng ?? liveData.lon ?? liveData.longitude ?? liveData._lng ?? liveData._longitude 
              ?? liveData.location?.lng ?? liveData.location?.lon ?? liveData.location?.longitude ?? liveData.location?._lng ?? liveData.location?._longitude 
              ?? 78.1760;
    const safeLat = Number(lat) || deviceLocation?.lat || 26.2521;
    const safeLng = Number(lng) || deviceLocation?.lng || 78.1760;
    return [safeLat, safeLng];
  }, [liveData, deviceLocation]);

  const isOffline = useMemo(() => Date.now() - lastUpdated > 20000, [lastUpdated]);

  const distanceKm = useMemo(() => haversineKm(heroPosition, destination), [heroPosition, destination]);
  const etaMins = useMemo(() => Math.ceil((distanceKm / 40) * 60), [distanceKm]);

  const steps = useMemo(() => [
    { id: 1, title: 'Head north', detail: 'Exit current lane in 300m', dist: '0.3 km' },
    { id: 2, title: 'Merge on SH-71', detail: 'Stay for 8 km', dist: '8.0 km' },
    { id: 3, title: 'Turn right to Gandhinagar Rd', detail: 'Follow signs to warehouse', dist: '2.4 km' },
    { id: 4, title: 'Destination on left', detail: 'Check-in at gate 2', dist: 'Arriving' },
  ], []);

  const openGoogleMaps = () => {
    const [lat, lng] = heroPosition;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destination[0]},${destination[1]}&travelmode=driving`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '16px', padding: '16px', background: '#f7f8f6' }}>
      <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#e8f5e9', color: '#1b5e20', borderRadius: '12px', fontWeight: '700', fontSize: '12px' }}>
            <Navigation size={16} /> Live Navigation
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>{isOffline ? 'Offline >20s' : 'Updating every few seconds'}</span>
        </div>
        <div style={{ height: '100%', minHeight: '420px' }}>
          <MapContainer center={heroPosition} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true} zoomControl={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={heroPosition} icon={driverIcon}>
              <Popup>
                <div style={{ fontWeight: '700', color: '#333' }}>You • GJ-01-LIVE</div>
                <div style={{ fontSize: '12px', color: '#555' }}>{isOffline ? 'Signal lost' : 'Tracking live'}</div>
              </Popup>
            </Marker>
            <Marker position={destination} icon={warehouseIcon}>
              <Popup>
                <div style={{ fontWeight: '700', color: '#333' }}>Gandhinagar Warehouse</div>
                <div style={{ fontSize: '12px', color: '#555' }}>Drop-off point</div>
              </Popup>
            </Marker>
            <Polyline positions={[heroPosition, destination]} color="#2e7d32" weight={5} opacity={0.7} />
          </MapContainer>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ background: 'white', borderRadius: '14px', padding: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Route size={18} color="#2e7d32" />
            <div style={{ fontWeight: '700', color: '#1b5e20' }}>Trip Summary</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
            <Metric label="Distance" value={`${distanceKm.toFixed(1)} km`} />
            <Metric label="ETA" value={`${etaMins} mins`} />
            <Metric label="Signal" value={isOffline ? 'Offline' : 'Live'} icon={isOffline ? <WifiOff size={14} color="#d32f2f" /> : <Navigation size={14} color="#2e7d32" />} />
            <Metric label="Truck" value="GJ-01-LIVE" />
          </div>
          <button onClick={openGoogleMaps} style={{ marginTop: '14px', width: '100%', padding: '12px', background: '#1b5e20', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
            Start in Google Maps
          </button>
        </div>

        <div style={{ background: 'white', borderRadius: '14px', padding: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', flex: 1, minHeight: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <MapPin size={18} color="#ef6c00" />
            <div style={{ fontWeight: '700', color: '#1b5e20' }}>Turn-by-Turn</div>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>Auto-updated route</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {steps.map((s) => (
              <div key={s.id} style={{ padding: '10px', border: '1px solid #f0f0f0', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center', background: '#fdfdfb' }}>
                <MoveRight size={16} color="#2e7d32" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', color: '#333', fontSize: '13px' }}>{s.title}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{s.detail}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#666' }}>{s.dist}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Metric = ({ label, value, icon }) => (
  <div style={{ padding: '10px', border: '1px solid #f5f5f5', borderRadius: '10px', background: '#f9faf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
    {icon}
    <div>
      <div style={{ fontSize: '11px', color: '#777', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontWeight: '700', color: '#2e7d32', fontSize: '14px' }}>{value}</div>
    </div>
  </div>
);

export default DriverNavigation;
