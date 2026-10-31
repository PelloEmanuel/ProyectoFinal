/**
 * Archivo: mobile/app.config.js
 * Descripción: Configuración dinámica de Expo para Campus.
 * Se ejecuta al inicio de `npx expo start` y prioriza automáticamente la interfaz Wi-Fi real
 * (192.168.x.x / 10.x.x.x / 172.16-31.x.x) por encima de adaptadores virtuales como Radmin VPN,
 * VirtualBox, Hamachi o WSL, garantizando que el código QR apunte siempre a la red Wi-Fi activa.
 */
const os = require('os');
const appJson = require('./app.json');

const origNetworkInterfaces = os.networkInterfaces.bind(os);

function isVirtualAdapter(name = '', address = '') {
  const n = String(name).toLowerCase();
  if (
    n.includes('radmin') ||
    n.includes('hamachi') ||
    n.includes('virtualbox') ||
    n.includes('vmware') ||
    n.includes('vethernet') ||
    n.includes('wsl') ||
    n.includes('hyper-v') ||
    n.includes('tailscale') ||
    n.includes('zerotier') ||
    n.includes('loopback') ||
    n.includes('teredo')
  ) {
    return true;
  }
  // Radmin VPN / Hamachi usan el rango 26.x.x.x o 25.x.x.x
  if (address.startsWith('26.') || address.startsWith('25.') || address.startsWith('169.254.')) {
    return true;
  }
  return false;
}

function detectRealWifiIp() {
  const interfaces = origNetworkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4;
      if (!isIPv4 || addr.internal) continue;
      if (isVirtualAdapter(name, addr.address)) continue;

      const isWifi = /wi-?fi|wlan|wireless|inal[aá]mbric/i.test(name);
      candidates.push({
        name,
        address: addr.address,
        priority: isWifi ? 1 : 2,
      });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.address || null;
}

// Reordenar os.networkInterfaces() para que Expo CLI siempre tome Wi-Fi primero y descarte Radmin VPN
os.networkInterfaces = function patchedNetworkInterfaces() {
  const raw = origNetworkInterfaces();
  const ordered = {};
  const virtuals = {};

  // 1. Primero Wi-Fi
  for (const [name, addrs] of Object.entries(raw)) {
    const firstIp = (addrs || []).find((a) => a.family === 'IPv4' || a.family === 4)?.address || '';
    if (isVirtualAdapter(name, firstIp)) {
      virtuals[name] = addrs;
    } else if (/wi-?fi|wlan|wireless/i.test(name)) {
      ordered[name] = addrs;
    }
  }

  // 2. Luego otras placas físicas (Ethernet)
  for (const [name, addrs] of Object.entries(raw)) {
    if (!ordered[name] && !virtuals[name]) {
      ordered[name] = addrs;
    }
  }

  return ordered;
};

const detectedWifiIp = detectRealWifiIp();
if (detectedWifiIp && !process.env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = detectedWifiIp;
}

module.exports = () => ({
  ...appJson.expo,
});
