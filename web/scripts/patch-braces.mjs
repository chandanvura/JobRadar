// Local mitigation for GHSA-vfj7-8cjw-p6xm; never changes package versions.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const patch = JSON.parse(readFileSync(resolve(root, 'security/braces-depth-patch.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
let count = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(directory, entry.name);
    if (entry.name === 'braces') {
      const pkg = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
      if (pkg.name === 'braces') {
        if (pkg.version !== '3.0.3') throw new Error('Review braces mitigation against new upstream version');
        for (const item of patch) {
          const target = resolve(path, item.path);
          const actual = hash(readFileSync(target));
          if (hash(item.content) !== item.after) throw new Error('Invalid braces patch integrity');
          if (actual === item.after) continue;
          if (actual !== item.before) throw new Error('Unrecognized braces source; refusing unsafe patch');
          writeFileSync(target, item.content);
        }
        count++;
      }
    }
    visit(path);
  }
}
visit(resolve(root, 'node_modules'));
if (!count) throw new Error('Expected braces dependency missing; review local mitigation');
console.log(`Verified braces depth mitigation in ${count} installation(s)`);
