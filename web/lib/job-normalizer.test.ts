import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostedInput, normalizeRawJob, stripHtml } from './job-normalizer';

test('stripHtml preserves readable line breaks and decodes entities', () => {
  const html = '<p>Requirements:</p><ul><li>0-2 years in Java &amp; Spring Boot</li><li>AWS</li></ul>';
  const clean = stripHtml(html);
  assert.match(clean, /Requirements:/);
  assert.match(clean, /Java & Spring Boot/);
});

test('normalizePostedInput handles relative Workday labels and epoch timestamps', () => {
  const fixed = Date.parse('2026-11-14T12:00:00Z');
  const today = normalizePostedInput('Posted Today', fixed);
  assert.equal(today.posted_precision, 'day');

  const old = normalizePostedInput('Posted 5 Days Ago', fixed);
  assert.equal(old.reported_age_hours, 120);

  const epoch = normalizePostedInput(fixed - 3600_000, fixed);
  assert.equal(epoch.posted_precision, 'exact');
  assert.equal(epoch.posted_at, new Date(fixed - 3600_000).toISOString());
});

test('normalizeRawJob classifies Bengaluru 0-2 YOE role as eligible and senior role as ineligible', () => {
  const fixed = Date.parse('2026-11-14T12:00:00Z');
  const eligible = normalizeRawJob(
    {
      external_job_id: '101',
      title: 'Backend Software Engineer I',
      company: 'Razorpay',
      location: 'Bengaluru, Karnataka, India',
      description: 'Requirements: 0-2 years of experience in Java, Spring Boot, Kafka, and AWS.',
      ats_provider: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/razorpay/jobs/101',
      application_url: 'https://boards.greenhouse.io/razorpay/jobs/101',
      career_page_url: 'https://razorpay.com/jobs/',
      posted_at: new Date(fixed - 2 * 3600_000).toISOString(),
      posted_precision: 'exact',
    },
    5,
    fixed,
  );
  assert.equal(eligible.city, 'Bengaluru');
  assert.equal(eligible.is_eligible, true);
  assert.ok(eligible.skills.includes('Java'));

  const senior = normalizeRawJob(
    {
      external_job_id: '102',
      title: 'Staff Software Engineer',
      company: 'Razorpay',
      location: 'Bengaluru, India',
      description: 'Requirements: 8+ years of experience.',
      ats_provider: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/razorpay/jobs/102',
      application_url: 'https://boards.greenhouse.io/razorpay/jobs/102',
      career_page_url: 'https://razorpay.com/jobs/',
      posted_at: new Date(fixed - 2 * 3600_000).toISOString(),
      posted_precision: 'exact',
    },
    5,
    fixed,
  );
  assert.equal(senior.is_eligible, false);
  assert.match(senior.eligibility_reason, /Senior|Experience/);
});

test('expanded PR #129 taxonomy & cross-domain guards classify hardware/software/consulting roles cleanly', () => {
  const fixed = Date.parse('2026-11-14T12:00:00Z');
  const base = {
    external_job_id: 'x',
    company: 'Qualcomm',
    location: 'Bengaluru, India',
    ats_provider: 'eightfold',
    job_url: 'https://example.com/j',
    application_url: 'https://example.com/j',
    career_page_url: 'https://example.com/c',
    posted_at: new Date(fixed - 3600_000).toISOString(),
    posted_precision: 'exact' as const,
  };

  const silicon = normalizeRawJob(
    { ...base, title: 'Design Engineer', description: '0-2 years with ASIC synthesis, Verilog RTL design and timing analysis.' },
    4,
    fixed,
  );
  assert.equal(silicon.role_category, 'Embedded / Hardware');
  assert.equal(silicon.is_eligible, true);

  const mechanical = normalizeRawJob(
    { ...base, title: 'Mechanical Design Engineer', description: 'Responsible for manufacturing quality and mechanical parts assembly.' },
    4,
    fixed,
  );
  assert.equal(mechanical.role_category, 'Other');
  assert.equal(mechanical.is_eligible, false);

  const retailProduct = normalizeRawJob(
    { ...base, title: 'Sales Associate', description: 'Retail store merchandising and physical product inspection in factory.' },
    4,
    fixed,
  );
  assert.equal(retailProduct.role_category, 'Other');

  const swProduct = normalizeRawJob(
    { ...base, title: 'Product Engineer', description: '0-2 years building full-stack services with Python, React, and REST APIs.' },
    4,
    fixed,
  );
  assert.equal(swProduct.role_category, 'Software Engineering');
  assert.equal(swProduct.is_eligible, true);

  const architect = normalizeRawJob(
    { ...base, title: 'Solutions Architect', description: '0-2 years AWS distributed systems.' },
    4,
    fixed,
  );
  assert.equal(architect.role_category, 'Cloud');
  assert.equal(architect.is_eligible, false);
  assert.match(architect.eligibility_reason, /leadership/i);

  const appsec = normalizeRawJob(
    { ...base, title: 'AppSec Engineer', description: '0-2 years in application security.' },
    4,
    fixed,
  );
  assert.equal(appsec.role_category, 'Security Engineering');
  assert.equal(appsec.is_eligible, true);
});
