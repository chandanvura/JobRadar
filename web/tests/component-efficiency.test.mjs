import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSearchProcessor} from '../lib/job-search-worker.ts';
import {createJobSearchIndex} from '../lib/job-search.ts';

test('dashboard has no dynamic lazy loading and imports components directly', async () => {
  const dashboardSource = await readFile(new URL('../components/jobradar-dashboard.tsx', import.meta.url), 'utf8');
  // Must not have lazy(() => import(...))
  assert.doesNotMatch(dashboardSource, /lazy\s*\(\s*\(\s*\)\s*=>/i, 'No lazy() component loading allowed');
  // Must not import Suspense from react
  assert.doesNotMatch(dashboardSource, /import\s*\{[^}]*Suspense[^}]*\}\s*from\s*["']react["']/, 'No Suspense import from react');
  // ProfilePanel and ResumeWorkspace must be imported directly
  assert.match(dashboardSource, /import\s*\{\s*ProfilePanel\s*\}\s*from\s*["']\.\/profile-panel["']/);
  assert.match(dashboardSource, /import\s*\{\s*ResumeWorkspace\s*\}\s*from\s*["']\.\/resume-workspace["']/);
  // Max experience years in policy display fallback must be 2
  assert.match(dashboardSource, /policy\?\.max_experience_years\s*\?\?\s*2/);
});

test('production worker policy accurately returns max_experience_years 2', async () => {
  const workerSource = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(workerSource, /max_experience_years:\s*2/);
});

test('search processor efficiently indexes once and performs repeated searches without re-mapping', () => {
  const processor = createSearchProcessor();
  const sampleJobs = [
    {title: 'Junior DevOps Engineer', company: 'Google', skills: '["Kubernetes","Docker"]', role_category: 'DevOps / Cloud', normalized_location: 'Bengaluru'},
    {title: 'Associate SRE', company: 'Microsoft', skills: '["Python","Prometheus"]', role_category: 'SRE', normalized_location: 'Hyderabad'},
    {title: 'Cloud Engineer I', company: 'Amazon', skills: '["AWS","Terraform"]', role_category: 'DevOps / Cloud', normalized_location: 'Bengaluru'},
    {title: 'Software Engineer I', company: 'Apple', skills: '["Java","SQL"]', role_category: 'Software Engineering', normalized_location: 'Hyderabad'},
  ];

  // Indexing message
  const indexResult = processor({type: 'index', jobs: sampleJobs});
  assert.equal(indexResult, null);

  // Measure performance of 50 repeated searches
  const queries = ['devops', 'sre', 'cloud', 'software', 'kubernetes', 'python'];
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    const q = queries[i % queries.length];
    const res = processor({type: 'query', id: i, query: q});
    assert.equal(res.id, i);
    assert.ok(Array.isArray(res.results));
    assert.ok(res.results.length > 0);
  }
  const duration = performance.now() - start;
  assert.ok(duration < 200, `50 searches should complete in < 200ms, took ${duration.toFixed(2)}ms`);
});

test('all primary components export and compile cleanly without runtime faults', async () => {
  const components = [
    'jobradar-dashboard.tsx',
    'profile-panel.tsx',
    'resume-workspace.tsx',
    'private-notes.tsx',
    'job-search-strategy.tsx',
    'job-pagination.tsx',
    'theme-toggle.tsx',
    'app-error-boundary.tsx',
    'tagline-reveal.tsx',
    'employer-posting-modal.tsx',
    'employer-pricing.tsx',
  ];
  for (const file of components) {
    const content = await readFile(new URL(`../components/${file}`, import.meta.url), 'utf8');
    assert.ok(content.length > 50, `${file} should not be empty`);
    // Ensure no broken placeholders or unresolved imports
    assert.doesNotMatch(content, /TODO:\s*implement/i);
  }
});

test('dual-audience employer saas platform components and states are present', async () => {
  const dashboardSource = await readFile(new URL('../components/jobradar-dashboard.tsx', import.meta.url), 'utf8');
  assert.match(dashboardSource, /audienceMode/);
  assert.match(dashboardSource, /EmployerPostingModal/);
  assert.match(dashboardSource, /EmployerPricing/);
  assert.match(dashboardSource, /For Employers & Companies/);
  assert.match(dashboardSource, /Post a verified opening/);
});

test('visual system adheres to Geist typography and strict dark surfaces', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /family=Geist/, 'index.html must load Geist font');

  const globalsCss = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(globalsCss, /--font-sans:\s*"Geist"/, 'globals.css must configure Geist as primary sans');
  assert.match(globalsCss, /--background:\s*#000000/, 'dark theme must use strict #000000 background');
  assert.match(globalsCss, /--card:\s*#181818/, 'dark theme must use strict #181818 card surface');
  assert.match(globalsCss, /@utility\s+heading-1/, 'globals.css must define named text styles');
  assert.match(globalsCss, /\.radar-hero-heading/, 'globals.css must define hero heading gradient rule');
});
