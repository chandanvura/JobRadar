import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpsUrl, isPrivateOrReservedIp } from './net-guard.ts';

test('isPrivateOrReservedIp blocks loopback, link-local, RFC1918, and IPv6 ULA/loopback', () => {
  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIp('10.20.30.40'), true);
  assert.equal(isPrivateOrReservedIp('172.16.0.5'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('fe80::1'), true);
  assert.equal(isPrivateOrReservedIp('fc00::1'), true);
  assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);

  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedIp('1.1.1.1'), false);
  assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false);
});

test('assertPublicHttpsUrl rejects http, credentials, internal hostnames, and private IPs', async () => {
  await assert.rejects(() => assertPublicHttpsUrl('http://example.com', { resolveDns: false }));
  await assert.rejects(() => assertPublicHttpsUrl('https://user:pass@example.com', { resolveDns: false }));
  await assert.rejects(() => assertPublicHttpsUrl('https://metadata.google.internal/computeMetadata', { resolveDns: false }));
  await assert.rejects(() => assertPublicHttpsUrl('https://localhost:3000', { resolveDns: false }));
  await assert.rejects(() => assertPublicHttpsUrl('https://169.254.169.254/latest', { resolveDns: false }));
  await assert.rejects(() => assertPublicHttpsUrl('https://10.0.0.1/jobs', { resolveDns: false }));

  const valid = await assertPublicHttpsUrl('https://careers.atlassian.com/jobs', { resolveDns: false });
  assert.equal(valid.hostname, 'careers.atlassian.com');
});
