import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateSlugsForCompany,
  decodeHtmlEntities,
  discoverAtsFromText,
  discoverWorkdayIndiaFacets,
  extractEmbeddedStateJobs,
  extractJsonLdJobs,
  parseAtlassianListings,
  parseGoogleCareersPayload,
  parseNextFlightRecords,
  parsePhenomConfig,
  parseXmlJobs,
} from './ats-engine';

test('discoverAtsFromText detects escaped JS URLs and embedded ATS boards', () => {
  const escaped = '<script>window.__ATS="https:\\/\\/jobs.lever.co\\/dreamsports"</script>';
  const lever = discoverAtsFromText(escaped);
  assert.equal(lever?.ats_provider, 'lever');
  assert.equal(lever?.ats_identifier, 'dreamsports');

  const ghEmbed = '<iframe src="https://boards.greenhouse.io/embed/job_board?for=razorpaysoftwareprivatelimited"></iframe>';
  const gh = discoverAtsFromText(ghEmbed);
  assert.equal(gh?.ats_provider, 'greenhouse');
  assert.equal(gh?.ats_identifier, 'razorpaysoftwareprivatelimited');

  const darwin = '<a href="https://pinelabs.darwinbox.in/ms/candidate/careers">Apply</a>';
  const db = discoverAtsFromText(darwin);
  assert.equal(db?.ats_provider, 'darwinbox');
  assert.equal(db?.ats_identifier, 'pinelabs');

  const mnh = '<a href="https://sharechat.mynexthire.com/employer/jobs/careers">Careers</a>';
  assert.equal(discoverAtsFromText(mnh)?.ats_provider, 'mynexthire');
});

test('candidateSlugsForCompany derives clean slugs from company names and domains', () => {
  const slugs = candidateSlugsForCompany('Dream Sports', 'https://www.dreamsports.group/careers/');
  assert.ok(slugs.includes('dreamsports'));
  assert.ok(slugs.includes('dream-sports'));
});

test('extractJsonLdJobs parses schema.org JobPosting objects including @graph', () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "JobPosting",
            "title": "Software Engineer I",
            "datePosted": "2026-11-14",
            "description": "<p>0-2 years experience in Java</p>",
            "url": "/jobs/swe-1",
            "jobLocation": {
              "@type": "Place",
              "address": { "addressLocality": "Bengaluru", "addressCountry": "IN" }
            }
          }
        ]
      }
    </script>
  `;
  const jobs = extractJsonLdJobs(html, 'ExampleCo', 'https://example.com/careers');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Software Engineer I');
  assert.equal(jobs[0].location, 'Bengaluru, IN');
  assert.equal(jobs[0].job_url, 'https://example.com/jobs/swe-1');
});

test('extractEmbeddedStateJobs extracts Next.js __NEXT_DATA__ job listings', () => {
  const html = `
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"openings":[{"id":"j1","title":"DevOps Engineer","location":"Hyderabad, India","url":"/careers/j1"}]}}}
    </script>
  `;
  const jobs = extractEmbeddedStateJobs(html, 'NextCo', 'https://nextco.example/careers');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].external_job_id, 'j1');
  assert.equal(jobs[0].location, 'Hyderabad, India');
});

test('parseXmlJobs parses Jobvite/RSS XML job feeds', () => {
  const xml = `
    <jobs>
      <job>
        <id>JV-9</id>
        <title>Cloud Engineer</title>
        <location>Bengaluru, India</location>
        <detail-url>https://jobs.jobvite.com/nutanix/job/JV-9</detail-url>
        <apply-url>https://jobs.jobvite.com/nutanix/job/JV-9/apply</apply-url>
        <description>0-2 years with Kubernetes and AWS</description>
      </job>
    </jobs>
  `;
  const jobs = parseXmlJobs(xml, 'Nutanix', 'https://jobs.jobvite.com/nutanix', 'jobvite');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].external_job_id, 'JV-9');
  assert.equal(jobs[0].ats_provider, 'jobvite');
});

test('discoverWorkdayIndiaFacets parses minified Workday country and city facets (PR #129)', () => {
  const facets = [
    {
      facetParameter: 'a',
      values: [
        { id: 'ind_id', descriptor: 'India' },
        { id: 'us_id', descriptor: 'United States' },
      ],
    },
    {
      facetParameter: 'b',
      values: [
        { id: 'blr_id', descriptor: 'Bangalore' },
        { id: 'lon_id', descriptor: 'London' },
      ],
    },
  ];
  assert.deepEqual(discoverWorkdayIndiaFacets(facets), { a: ['ind_id'] });

  const cityOnly = [
    {
      facetParameter: 'c',
      values: [
        { id: 'hyd_id', descriptor: 'Hyderabad, India' },
        { id: 'nyc_id', descriptor: 'New York' },
      ],
    },
  ];
  assert.deepEqual(discoverWorkdayIndiaFacets(cityOnly), { c: ['hyd_id'] });
});

test('parsePhenomConfig, parseGoogleCareersPayload, parseAtlassianListings, and parseNextFlightRecords', () => {
  const phHtml = `<script>var phApp = phApp || {"refNum":"PANWUS","baseUrl":"https://jobs.paloaltonetworks.com/en","widgetApiEndpoint":"https://jobs.paloaltonetworks.com/widgets","country":"us","locale":"en_us"};</script>`;
  const ph = parsePhenomConfig(phHtml);
  assert.equal(ph?.refNum, 'PANWUS');
  assert.equal(ph?.widgetApiEndpoint, 'https://jobs.paloaltonetworks.com/widgets');

  const gHtml = `<script>AF_initDataCallback({key:'ds:1', hash:'1', data:[[["101","Software Engineer I","https://careers.google.com/apply/101",["", "<p>Build systems</p>"],["", "<p>0-2 years</p>"],null,null,null,null,[["Bengaluru, Karnataka, India"]],["", "<p>About Google</p>"],null,[1760000000]]],null,1,20]});</script>`;
  const gPayload = parseGoogleCareersPayload(gHtml);
  assert.equal(gPayload.total, 1);
  assert.equal(gPayload.rows[0][1], 'Software Engineer I');

  const atJobs = parseAtlassianListings(
    [
      {
        id: 5001,
        title: 'Backend Engineer',
        locations: ['Bengaluru, India'],
        overview: '<p>Build Jira services</p>',
        portalJobPost: { portalUrl: 'https://careers-apac-atlassian.icims.com/jobs/5001/job' },
      },
      {
        id: 5001,
        title: 'Backend Engineer',
        locations: ['Hyderabad, India'],
        overview: '<p>Build Jira services</p>',
        portalJobPost: { portalUrl: 'https://careers-apac-atlassian.icims.com/jobs/5001/job' },
      },
    ],
    'Atlassian',
    'https://www.atlassian.com/company/careers/all-jobs',
  );
  assert.equal(atJobs.length, 1);
  assert.equal(atJobs[0].location, 'Bengaluru, India · Hyderabad, India');

  const flightHtml = `<script>self.__next_f.push([1,"1:{\\"jobs\\":[{\\"id\\":42,\\"title\\":\\"SDE I\\",\\"ats_job\\":{\\"job_description\\":\\"$2\\"}}]}\\n2:T12,Java backend roles\\n"])</script>`;
  const recs = parseNextFlightRecords(flightHtml);
  assert.equal((recs['1'] as { jobs: Array<{ id: number }> }).jobs[0].id, 42);
  assert.equal(recs['2'], 'Java backend roles');

  assert.equal(decodeHtmlEntities('&amp;lt;p&amp;gt;Hello&#39;s&amp;lt;/p&amp;gt;'), "<p>Hello's</p>");
});

