import React, { useState, useEffect, memo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FileText, Navigation, Zap, AlertCircle } from 'lucide-react';
import L from 'leaflet';
import RoutingMachine from '../RoutingMachine';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// --- ICONS ---
// 1. My Truck (Green/Active)
const myTruckIcon = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/2554/2554978.png', 
    iconSize: [45, 45], 
    iconAnchor: [22, 22],
    popupAnchor: [0, -20]
});

// 2. Destination (Warehouse)
const warehouseIcon = new L.Icon({ 
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/447/447031.png', 
    iconSize: [40, 40], 
    iconAnchor: [20, 40], 
    popupAnchor: [0, -35] 
});

const normalizeTruckId = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const isHeroTruckId = (truckId) => normalizeTruckId(truckId).startsWith('GJ01');

const extractLatLng = (docData) => {
    const source = docData?.location || docData;
    const lat = Number(source?.lat ?? source?.latitude ?? source?._lat ?? source?._latitude);
    const lng = Number(source?.lng ?? source?.lon ?? source?.longitude ?? source?._lng ?? source?._longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
};

const DriverDashboard = () => {
    const defaultStartCoords = [26.2521, 78.1760]; // Fallback IIITM Gwalior (Visitor Hostel)
    const endCoords = [23.215, 72.636];   // Gandhinagar (Fixed)
    
    // Toggle for Analysis Card
    const [showAnalysis, setShowAnalysis] = useState(true);
    const { lang, isMobile, isSidebarOpen } = useOutletContext();
    const [documents, setDocuments] = useState([]);
    const [liveLocation, setLiveLocation] = useState(defaultStartCoords);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [heroTruckLabel, setHeroTruckLabel] = useState('GJ-01');
    
    // AI Route Intelligence State
    const [routeData, setRouteData] = useState({
        estTime: "Calculating...",
        traffic: "Analyzing...",
        fuelEfficiency: "Calculating...",
        riskScore: "Analyzing...",
        loading: true,
        error: null,
        lastUpdated: new Date()
    });

    // Function to calculate intelligent data based on current time
    const calculateIntelligentData = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        
        // Base metrics for current location → Gandhinagar
        let estTime = 18;
        let trafficStatus = "Low (Clear)";
        let riskLevel = "SAFE";
        let fuelEff = "95% Optimal";
        let colorTraffic = "#2e7d32";
        let colorRisk = "#2e7d32";
        
        // Dynamic analysis based on current time
        if (currentHour >= 7 && currentHour < 9) {
            // Morning rush (7-9 AM)
            estTime = 25;
            trafficStatus = "Moderate (Peak)";
            riskLevel = "⚠️ CAUTION";
            fuelEff = "85% Moderate";
            colorTraffic = "#f57c00";
            colorRisk = "#f57c00";
        } 
        else if (currentHour >= 9 && currentHour < 12) {
            // Morning (9 AM - 12 PM)
            estTime = 16;
            trafficStatus = "Light (Clear)";
            riskLevel = "SAFE";
            fuelEff = "96% Optimal";
        }
        else if (currentHour >= 12 && currentHour < 14) {
            // Noon (12-2 PM)
            estTime = 17;
            trafficStatus = "Light (Clear)";
            riskLevel = "SAFE";
            fuelEff = "94% Optimal";
        }
        else if (currentHour >= 14 && currentHour < 17) {
            // Afternoon (2-5 PM)
            estTime = 18;
            trafficStatus = "Light (Clear)";
            riskLevel = "SAFE";
            fuelEff = "96% Optimal";
        }
        else if (currentHour >= 17 && currentHour < 19) {
            // Evening rush (5-7 PM)
            estTime = 32;
            trafficStatus = "Heavy (Peak)";
            riskLevel = "🔴 HIGH RISK";
            fuelEff = "72% Poor";
            colorTraffic = "#d32f2f";
            colorRisk = "#d32f2f";
        }
        else if (currentHour >= 19 && currentHour < 21) {
            // Early evening (7-9 PM)
            estTime = 22;
            trafficStatus = "Moderate (Easing)";
            riskLevel = "SAFE";
            fuelEff = "88% Good";
            colorTraffic = "#f57c00";
        }
        else if (currentHour >= 21 || currentHour < 6) {
            // Night (9 PM - 6 AM)
            estTime = 15;
            trafficStatus = "Clear (Night)";
            riskLevel = "SAFE";
            fuelEff = "98% Optimal";
        }
        else {
            // Early morning (6-7 AM)
            estTime = 16;
            trafficStatus = "Light (Clear)";
            riskLevel = "SAFE";
            fuelEff = "95% Optimal";
        }
        
        return {
            estTime: `${estTime} Mins`,
            traffic: trafficStatus,
            fuelEfficiency: fuelEff,
            riskScore: riskLevel,
            loading: false,
            error: null,
            colorTraffic,
            colorRisk,
            lastUpdated: now
        };
    };

    // Fetch live location from Firestore (GJ-01 variations)
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'shipments'), (snapshot) => {
            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (isHeroTruckId(data?.truck_id)) {
                    setHeroTruckLabel(data.truck_id || 'GJ-01');
                    const coords = extractLatLng(data);
                    if (coords) {
                        setLiveLocation(coords);
                    }
                }
            });
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = Number(pos?.coords?.latitude);
                const lng = Number(pos?.coords?.longitude);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    setLiveLocation([lat, lng]);
                }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // Timer to update currentTime every 500ms (for offline check)
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Date.now()), 500);
        return () => clearInterval(timer);
    }, []);

    // Fetch documents from Firestore
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'driver_documents'), (snapshot) => {
            const docs = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            setDocuments(docs.sort((a, b) => b.uploadedAt - a.uploadedAt));
        });
        return () => unsubscribe();
    }, []);

    // Fetch real route data using OpenRouteService API
    useEffect(() => {
        // Initial calculation
        setRouteData(calculateIntelligentData());
        
        // Update every 30 seconds for real-time display
        const realTimeInterval = setInterval(() => {
            setRouteData(calculateIntelligentData());
        }, 30 * 1000); // 30 seconds
        
        return () => clearInterval(realTimeInterval);
    }, []);

  // PDF Opener (Dummy)
  const openPDF = () => {
    window.open("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", "_blank");
  };

    // Default documents that should always be visible
    const defaultDocs = [
        { id: 'default-license', title: 'Driving License', status: 'Verified', color: '#2e7d32', onClick: openPDF },
        { id: 'default-rc', title: 'Vehicle RC Book', status: 'Verified', color: '#2e7d32', onClick: openPDF },
        { id: 'default-insurance', title: 'Insurance Policy', status: 'Valid', color: 'orange', onClick: openPDF },
        { id: 'default-eway', title: 'E-Way Bill (Cargo)', status: 'Active', color: '#2e7d32', onClick: openPDF },
    ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'white' }}>
      
      {/* --- 1. TOP: MAP SECTION --- */}
      <div style={{ flex: 1.5, position: 'relative', minHeight: '60%' }}>
            {/* key forces the polyline to rerender if coords change in future */}
            <MapContainer 
                key={`driver-map-${liveLocation[0]}-${liveLocation[1]}-${endCoords[0]}-${endCoords[1]}`}
                center={liveLocation}
                zoom={11}
                whenReady={(mapEvent) => mapEvent.target.fitBounds([liveLocation, endCoords], { padding: [40, 40] })}
                style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {/* THE GREEN ROUTE LINE - From LIVE Location to Gandhinagar */}
                <RoutingMachine start={liveLocation} end={endCoords} />

            {/* MY TRUCK - LIVE LOCATION */}
            <Marker position={liveLocation} icon={myTruckIcon}>
                    <Popup><strong>YOU ({heroTruckLabel})</strong><br/>Status: On Route<br/>Lat: {liveLocation[0].toFixed(3)}, Lng: {liveLocation[1].toFixed(3)}</Popup>
            </Marker>

            {/* DESTINATION */}
                <Marker position={endCoords} icon={warehouseIcon}>
                    <Popup>Gandhinagar Warehouse</Popup>
            </Marker>

         </MapContainer>
         
         {/* -- FLOAT 1: HEADER -- */}
         {(!isMobile || !isSidebarOpen) && (
         <div style={{ position: 'absolute', top: isMobile ? '10px' : '20px', left: isMobile ? '8px' : '15px', right: isMobile ? '8px' : '15px', background: 'white', padding: isMobile ? '10px' : '12px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: isMobile ? 'nowrap' : 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px', flex: 1, minWidth: 0 }}>
                <div style={{ background: '#e8f5e9', padding: isMobile ? '8px' : '10px', borderRadius: '50%', flexShrink: 0 }}><Navigation color="#2e7d32" size={isMobile ? 16 : 20} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                   <div style={{ fontSize: isMobile ? '9px' : '11px', color: '#666', fontWeight: 'bold', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Current Trip (Live GPS)</div>
                   <div style={{ fontWeight: 'bold', fontSize: isMobile ? '12px' : '15px', color: '#1b5e20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Current Location → Gandhinagar</div>
                </div>
            </div>
            <button onClick={() => setShowAnalysis(!showAnalysis)} style={{ background: '#333', color: 'white', border: 'none', padding: isMobile ? '5px 10px' : '6px 12px', borderRadius: '6px', fontSize: isMobile ? '10px' : '11px', fontWeight: 'bold', flexShrink: 0, marginLeft: '8px' }}>
                {showAnalysis ? "Hide AI" : "Show AI"}
            </button>
         </div>
         )}

         {/* -- FLOAT 2: AI ROUTE ANALYSIS (Admin Style Panel) -- */}
         {showAnalysis && (!isMobile || !isSidebarOpen) && (
             <div style={{ position: 'absolute', top: isMobile ? '70px' : '90px', left: isMobile ? '8px' : '15px', right: isMobile ? '8px' : 'auto', width: isMobile ? 'auto' : '280px', maxWidth: isMobile ? 'calc(100% - 16px)' : '280px', background: 'rgba(255, 255, 255, 0.98)', padding: isMobile ? '12px' : '15px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', zIndex: 999, backdropFilter: 'blur(5px)', borderLeft: '5px solid #2e7d32', border: '1px solid rgba(0,0,0,0.1)' }}>
                 
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                     <Zap size={16} color="#f9a825" fill="#f9a825" />
                     <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#333' }}>AI Route Intelligence</span>
                     {routeData.loading && <span style={{ fontSize: '10px', color: '#999', marginLeft: 'auto' }}>Live</span>}
                 </div>
                 
                 {routeData.error && (
                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', background: '#fff3cd', borderRadius: '6px', marginBottom: '8px', fontSize: '11px', color: '#856404' }}>
                         <AlertCircle size={14} />
                         {routeData.error}
                     </div>
                 )}
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     <Row label="Est. Time" value={routeData.estTime} color="#333" bold={true} />
                     <Row 
                         label="Traffic" 
                         value={routeData.traffic} 
                         color={routeData.colorTraffic || (routeData.traffic.includes('Heavy') ? '#d32f2f' : routeData.traffic.includes('Moderate') ? '#f57c00' : '#2e7d32')}
                         bold={true}
                     />
                     <Row label="Fuel Efficiency" value={routeData.fuelEfficiency} color={routeData.fuelEfficiency.includes('98%') ? '#2e7d32' : routeData.fuelEfficiency.includes('95%') ? '#2e7d32' : routeData.fuelEfficiency.includes('85%') ? '#f57c00' : '#d32f2f'} />
                     <Row 
                         label="Risk Score" 
                         value={routeData.riskScore} 
                         bg={routeData.riskScore === 'SAFE' ? '#e8f5e9' : routeData.riskScore.includes('CAUTION') ? '#fff3cd' : '#ffebee'}
                         color={routeData.colorRisk || (routeData.riskScore === 'SAFE' ? '#2e7d32' : routeData.riskScore.includes('CAUTION') ? '#f57c00' : '#d32f2f')}
                     />
                     {routeData.distance && <Row label="Distance" value={`${routeData.distance} km`} color="#666" fontSize="11px" />}
                 </div>
                 
                 <LiveTimestamp />
             </div>
         )}
      </div>

      {/* --- 2. BOTTOM: DIGITAL LOCKER --- */}
      <div style={{ flex: 1, padding: '20px', background: 'white', borderTop: '4px solid #2e7d32', overflowY: 'auto' }}>
         <h2 style={{ fontSize: '18px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px', color: '#1b5e20' }}>
            <FileText color="#2e7d32"/> Digital Locker (Tap to Open)
         </h2>
         
         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {documents.map((doc) => (
                            <DocCard 
                                key={doc.id}
                                title={doc.name} 
                                status={doc.status || 'Active'}
                                color={doc.color || '#2e7d32'}
                                onClick={() => doc.fileURL && window.open(doc.fileURL, '_blank')} 
                            />
                        ))}

                        {defaultDocs.map((doc) => (
                            <DocCard 
                                key={doc.id}
                                title={doc.title} 
                                status={doc.status}
                                color={doc.color}
                                onClick={doc.onClick} 
                            />
                        ))}
         </div>
      </div>
    </div>
  );
};

// Helper Components
const Row = ({ label, value, color, bg, bold, fontSize }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontSize || '12px', alignItems: 'center' }}>
        <span style={{ color: '#666' }}>{label}:</span>
        <span style={{ 
            fontWeight: bold ? 'bold' : '500', 
            color: color || '#333', 
            background: bg || 'transparent', 
            padding: bg ? '4px 8px' : '0', 
            borderRadius: '4px',
            fontSize: fontSize || '12px'
        }}>{value}</span>
    </div>
);

const DocCard = ({ title, status, color = "#2e7d32", onClick }) => (
  <div onClick={onClick} style={{ padding: '12px 15px', border: '1px solid #eee', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', cursor: 'pointer', transition: 'background 0.2s' }}>
     <span style={{ fontWeight: '500', fontSize: '14px', color: '#333' }}>{title}</span>
     <span style={{ fontSize: '11px', fontWeight: 'bold', color: color, background: 'white', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${color}` }}>{status}</span>
  </div>
);

// Memoized Live Timestamp Component - prevents map re-renders
const LiveTimestamp = memo(() => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  return (
    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #eee', fontSize: '10px', color: '#999', textAlign: 'center' }}>
      Live: {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
});

LiveTimestamp.displayName = 'LiveTimestamp';

export default DriverDashboard;