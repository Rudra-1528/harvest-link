import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, X, LogOut, Globe, AlertTriangle, Thermometer, Droplets, Zap, WifiOff } from 'lucide-react';
import { translations } from '../translations'; 
import { useUser } from '../UserContext';
import { useNotifications } from '../NotificationContext';

const Layout = () => {
  const { user, logout } = useUser();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('harvest_lang');
    return saved || 'en';
  }); 
  const [showLangModal, setShowLangModal] = useState(() => {
    const langSet = localStorage.getItem('harvest_lang');
    return !langSet; // Show modal if no language is set yet
  });
  const [selectedLangForModal, setSelectedLangForModal] = useState(null);
  const [savedAsDefault, setSavedAsDefault] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!showNotifications) return;

    const handleOutsideClick = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showNotifications]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768; // Phones only
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true); else setIsSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { if (isMobile) setIsSidebarOpen(false); }, [location, isMobile]);

  // Listen for language changes from Settings or other components
  useEffect(() => {
    const handleLanguageChange = (e) => {
      setLang(e.detail.lang);
    };
    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  // Force language modal to show on first visit to admin domain
  useEffect(() => {
    const hasSelectedLang = localStorage.getItem('admin_lang_modal_shown');
    if (!hasSelectedLang) {
      setShowLangModal(true);
      localStorage.setItem('admin_lang_modal_shown', 'true');
    }
  }, []);

  const handleLanguageSelectFromButton = (newLang) => {
    setSelectedLangForModal(newLang);
    setLang(newLang);
    localStorage.setItem('harvest_lang', newLang);
    setSavedAsDefault(false);
  };

  const handleSaveAsDefault = () => {
    localStorage.setItem('default_harvest_lang', selectedLangForModal);
    setSavedAsDefault(true);
  };

  const handleContinue = () => {
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: selectedLangForModal || lang } }));
    setShowLangModal(false);
  };

  const languages = [
    { code: 'en', label: '🇬🇧 English' },
    { code: 'hi', label: '🇮🇳 Hindi (हिंदी)' },
    { code: 'gj', label: '🇮🇳 Gujarati (ગુજરાતી)' },
    { code: 'pa', label: '🇮🇳 Punjabi (ਪੰਜਾਬੀ)' },
    { code: 'mr', label: '🇮🇳 Marathi (मराठी)' },
    { code: 'ta', label: '🇮🇳 Tamil (தமிழ்)' },
    { code: 'te', label: '🇮🇳 Telugu (తెలుగు)' },
    { code: 'bn', label: '🇮🇳 Bengali (বাংলা)' },
  ];

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'temperature': return <Thermometer size={18} color="#d32f2f" />;
      case 'humidity': return <Droplets size={18} color="#f57c00" />;
      case 'shock': return <Zap size={18} color="#d32f2f" />;
      case 'connection': return <WifiOff size={18} color="#d32f2f" />;
      default: return <AlertTriangle size={18} color="#f57c00" />;
    }
  };

  const t = translations.layout[lang] || translations.layout['en'];

  const auth = translations.auth?.[lang] || translations.auth?.en || {};
  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: '#f4f1ea' }}>
      
      {/* LANGUAGE MODAL FOR BUTTON */}
      {showLangModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '16px', textAlign: 'center', width: '90%', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '20px', color: '#2e7d32', fontSize: '22px' }}>Select Language / भाषा चुनें</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', maxHeight: '300px', overflowY: 'auto' }}>
              {languages.map((l) => (
                <button key={l.code} onClick={() => handleLanguageSelectFromButton(l.code)} style={{ padding: '12px', fontSize: '14px', cursor: 'pointer', background: selectedLangForModal === l.code ? '#a5d6a7' : '#f5f5f5', color: '#333', border: selectedLangForModal === l.code ? '2px solid #2e7d32' : 'none', borderRadius: '8px', transition: 'background 0.2s', fontWeight: selectedLangForModal === l.code ? '600' : '400' }}>
                  {l.label}
                </button>
              ))}
            </div>
            
            {selectedLangForModal && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '10px 0', color: '#555', fontSize: '13px' }}>
                  Selected: <strong>{languages.find(l => l.code === selectedLangForModal)?.label}</strong>
                </p>
                <button 
                  onClick={handleSaveAsDefault} 
                  style={{ 
                    padding: '10px 20px', 
                    background: savedAsDefault ? '#4caf50' : '#ff9800', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '6px', 
                    cursor: 'pointer', 
                    fontSize: '14px', 
                    fontWeight: '600',
                    marginBottom: '15px',
                    width: '100%'
                  }}
                >
                  {savedAsDefault ? '✓ Saved as Default' : 'Save as Default Language'}
                </button>
              </div>
            )}
            
            <button 
              onClick={handleContinue} 
              disabled={!selectedLangForModal}
              style={{ 
                padding: '10px 20px', 
                background: selectedLangForModal ? '#2e7d32' : '#ccc', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: selectedLangForModal ? 'pointer' : 'not-allowed', 
                fontSize: '14px', 
                fontWeight: '600',
                width: '100%'
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* --- SIDEBAR CONTAINER --- */}
      {/* KEY FIX: 'relative' pushes content. 'fixed' overlaps content. */}
      <div style={{
          position: isMobile ? 'fixed' : 'relative', 
          width: '240px', 
          height: '100%', 
          zIndex: 1000,
          transition: 'margin-left 0.3s ease',
          marginLeft: isSidebarOpen ? '0' : '-240px', // Slide logic
          flexShrink: 0
      }}>
          <Sidebar lang={lang} />
          {/* Close Button (Mobile Only) */}
          {isMobile && isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(false)} style={{ position: 'absolute', top: '20px', right: '-40px', background: 'white', border: 'none', borderRadius: '50%', padding: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <X size={20} color="#333" />
            </button>
          )}
      </div>

      {/* OVERLAY (Mobile Only) */}
      {isMobile && isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 999 }}></div>
      )}

      {/* --- MAIN CONTENT --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: '0' }}>
        
        {/* TOP BAR */}
        <div style={{ height: '65px', background: 'white', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {isMobile && <button onClick={() => setIsSidebarOpen(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><Menu size={28} color="#2d5a27" /></button>}
            <h3 style={{ margin: 0, color: '#2d5a27', fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px' }}>KRISHIPATH</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div ref={notificationRef} style={{ position: 'relative' }}>
              <div onClick={() => setShowNotifications(!showNotifications)} style={{ cursor: 'pointer', color: '#5d4037', position: 'relative' }}>
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#d32f2f', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', border: '2px solid white' }}>
                    {unreadCount}
                  </span>
                )}
              </div>

              {showNotifications && (
                <div style={{ position: 'absolute', top: '35px', right: '0', width: '350px', maxHeight: '400px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, border: '1px solid #e0e0e0' }}>
                  <div style={{ padding: '15px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Notifications</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {notifications.length > 0 && (
                        <>
                          <button onClick={markAllAsRead} style={{ background: 'transparent', border: 'none', color: '#2e7d32', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Mark all read</button>
                          <button onClick={clearNotifications} style={{ background: 'transparent', border: 'none', color: '#d32f2f', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Clear all</button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                        <Bell size={40} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                        <p style={{ margin: 0, fontSize: '14px' }}>No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => markAsRead(notif.id)}
                          style={{ padding: '12px 15px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', background: notif.isRead ? 'white' : '#fff3e0', transition: 'background 0.2s' }}
                          onMouseOver={(e) => (e.currentTarget.style.background = '#f5f5f5')}
                          onMouseOut={(e) => (e.currentTarget.style.background = notif.isRead ? 'white' : '#fff3e0')}
                        >
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <div style={{ marginTop: '2px' }}>{getNotificationIcon(notif.type)}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', color: '#333', fontWeight: notif.isRead ? '400' : '600', marginBottom: '4px' }}>{notif.message}</div>
                              <div style={{ fontSize: '11px', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{notif.truck}</span>
                                <span>{new Date(notif.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                <div style={{ fontSize: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{user.name || 'User'}</div>
                  <div style={{ fontSize: '10px', color: '#999' }}>{user.email || user.role}</div>
                </div>
                <button onClick={() => setShowLangModal(true)} style={{ background: '#2e7d32', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#1b5e20'} onMouseOut={(e) => e.currentTarget.style.background = '#2e7d32'}>
                  <Globe size={14} /> {auth.changeLanguage || 'Language'}
                </button>
                <button onClick={handleLogout} style={{ background: '#d32f2f', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#b71c1c'} onMouseOut={(e) => e.currentTarget.style.background = '#d32f2f'}>
                  <LogOut size={14} /> {auth.logout || 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PAGE */}
        <div style={{ padding: isMobile ? '15px' : '25px', flex: 1, overflowY: 'auto' }}>
           <Outlet context={{ lang, isMobile }} />
        </div>
      </div>
    </div>
  );
};

export default Layout;