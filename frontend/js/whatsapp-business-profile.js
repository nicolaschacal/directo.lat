(() => {
  const load = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  load('/js/whatsapp-business-profile-core.js')
    .then(() => load('/js/location-cascade.js'))
    .then(() => load('/js/ui-polish.js'))
    .catch((error) => console.error('No se pudo cargar la interfaz:', error));
})();
