import dns from 'node:dns/promises';
import net from 'node:net';

function parseIpv4Int(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

function inIpv4Cidr(ip: number, base: string, prefixLen: number): boolean {
  const baseInt = parseIpv4Int(base);
  if (baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!ip) return true;

  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
  }

  if (net.isIPv4(ip)) {
    const num = parseIpv4Int(ip);
    if (num === null) return true;
    return (
      inIpv4Cidr(num, '0.0.0.0', 8) ||
      inIpv4Cidr(num, '10.0.0.0', 8) ||
      inIpv4Cidr(num, '100.64.0.0', 10) ||
      inIpv4Cidr(num, '127.0.0.0', 8) ||
      inIpv4Cidr(num, '169.254.0.0', 16) ||
      inIpv4Cidr(num, '172.16.0.0', 12) ||
      inIpv4Cidr(num, '192.0.0.0', 24) ||
      inIpv4Cidr(num, '192.0.2.0', 24) ||
      inIpv4Cidr(num, '192.168.0.0', 16) ||
      inIpv4Cidr(num, '198.18.0.0', 15) ||
      inIpv4Cidr(num, '198.51.100.0', 24) ||
      inIpv4Cidr(num, '203.0.113.0', 24) ||
      inIpv4Cidr(num, '224.0.0.0', 4) ||
      inIpv4Cidr(num, '240.0.0.0', 4)
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.split('%')[0];
    if (normalized === '::' || normalized === '::1') return true;
    if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true; // ULA fc00::/7
    if (/^ff[0-9a-f]{2}:/i.test(normalized)) return true; // multicast
    return false;
  }

  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

const dnsSafeCache = new Map<string, { safe: boolean; expiresAt: number }>();

export async function assertPublicHttpsUrl(
  rawUrl: string,
  options: { resolveDns?: boolean } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid careers URL');
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Only public https:// URLs without credentials are allowed');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error(`Blocked internal hostname: ${host}`);
  }

  const bareHost = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bareHost)) {
    if (isPrivateOrReservedIp(bareHost)) {
      throw new Error(`Blocked private or reserved IP address: ${bareHost}`);
    }
    return url;
  }

  if (options.resolveDns !== false) {
    const cached = dnsSafeCache.get(host);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.safe) throw new Error(`Blocked host resolving to private network: ${host}`);
      return url;
    }
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      const unsafe = records.some((r) => isPrivateOrReservedIp(r.address));
      dnsSafeCache.set(host, { safe: !unsafe, expiresAt: Date.now() + 5 * 60_000 });
      if (unsafe) {
        throw new Error(`Blocked host resolving to private network: ${host}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Blocked ')) throw err;
      // Transient DNS lookup errors are handled by fetchWithRetry directly
    }
  }

  return url;
}
