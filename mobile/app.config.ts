import os from 'os';
import appJson from './app.json';

// Conserva la referencia original a la función de interfaces de red del sistema operativo.
const origNetworkInterfaces = os.networkInterfaces.bind(os);

// Determina si un adaptador de red corresponde a una interfaz virtual o VPN (Radmin, VirtualBox, WSL, Hamachi).
function isVirtualAdapter(name = '', address = ''): boolean {
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
  if (address.startsWith('26.') || address.startsWith('25.') || address.startsWith('169.254.')) {
    return true;
  }
  return false;
}

// Detecta la dirección IPv4 real de la placa Wi-Fi o Ethernet física activa.
function detectRealWifiIp(): string | null {
  const interfaces = origNetworkInterfaces();
  const candidates: Array<{ name: string; address: string; priority: number }> = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      const isIPv4 = addr.family === 'IPv4' || (addr as any).family === 4;
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

// Reordena las interfaces de red para que Expo CLI priorice siempre la conexión Wi-Fi física.
os.networkInterfaces = function patchedNetworkInterfaces(): NodeJS.Dict<os.NetworkInterfaceInfo[]> {
  const raw = origNetworkInterfaces();
  const ordered: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {};
  const virtuals: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {};

  for (const [name, addrs] of Object.entries(raw)) {
    const firstIp = (addrs || []).find((a) => a.family === 'IPv4' || (a as any).family === 4)?.address || '';
    if (isVirtualAdapter(name, firstIp)) {
      virtuals[name] = addrs;
    } else if (/wi-?fi|wlan|wireless/i.test(name)) {
      ordered[name] = addrs;
    }
  }

  for (const [name, addrs] of Object.entries(raw)) {
    if (!ordered[name] && !virtuals[name]) {
      ordered[name] = addrs;
    }
  }

  return ordered;
};

// Asigna la dirección IP Wi-Fi detectada al empaquetador de React Native si no fue definida manualmente.
const detectedWifiIp = detectRealWifiIp();
if (detectedWifiIp && !process.env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = detectedWifiIp;
}

// Exporta la configuración dinámica de Expo basada en app.json.
export default () => ({
  ...appJson.expo,
});
