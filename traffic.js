(() => {
  try {
    const path = location.pathname || '/';
    if (/^\/(admin|reports|notify)(\/|$|\.html)/i.test(path)) return;
    let visitorId = localStorage.getItem('nivara-visitor-id');
    if (!visitorId) {
      visitorId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('nivara-visitor-id', visitorId);
    }
    let referrer = 'Direct';
    if (document.referrer) {
      try { referrer = new URL(document.referrer).hostname.replace(/^www\./,'') || 'Direct'; } catch (_) {}
    }
    const width = Math.min(screen.width || innerWidth || 1200, screen.height || innerHeight || 800);
    const device = width < 768 ? 'Mobile' : width < 1100 ? 'Tablet' : 'Desktop';
    fetch('/api/traffic', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, path, referrer, device })
    }).catch(() => {});
  } catch (_) {}
})();
