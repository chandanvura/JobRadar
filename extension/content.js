/**
 * JobRadar 1-Click Application Autofill Content Script
 * Automatically detects and fills common applicant fields across:
 * - Greenhouse (boards.greenhouse.io)
 * - Lever (jobs.lever.co)
 * - Workday (*.myworkdayjobs.com)
 * - Ashby (jobs.ashbyhq.com)
 * - SmartRecruiters (careers.smartrecruiters.com)
 */

(function () {
  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null) return;
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value') ? element.value : null;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value') ? prototype.value : null;

    element.focus();
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  }

  function autofillProfile(profile) {
    if (!profile) return 0;
    let filledCount = 0;

    const mappings = [
      // First Name
      {
        selectors: [
          '#first_name',
          'input[name*="first_name" i]',
          'input[name*="firstName" i]',
          'input[data-automation-id*="legalNameSection_firstName" i]',
        ],
        value: profile.firstName,
      },
      // Last Name
      {
        selectors: [
          '#last_name',
          'input[name*="last_name" i]',
          'input[name*="lastName" i]',
          'input[data-automation-id*="legalNameSection_lastName" i]',
        ],
        value: profile.lastName,
      },
      // Full Name (used on Lever and simple forms)
      {
        selectors: [
          'input[name="name" i]',
          '#name',
          'input[name*="fullName" i]',
        ],
        value: profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
      },
      // Email
      {
        selectors: [
          '#email',
          'input[type="email" i]',
          'input[name*="email" i]',
          'input[data-automation-id*="email" i]',
        ],
        value: profile.email,
      },
      // Phone
      {
        selectors: [
          '#phone',
          'input[type="tel" i]',
          'input[name*="phone" i]',
          'input[data-automation-id*="phone" i]',
        ],
        value: profile.phone,
      },
      // LinkedIn
      {
        selectors: [
          'input[name*="linkedin" i]',
          'input[placeholder*="linkedin" i]',
          'input[data-automation-id*="linkedin" i]',
        ],
        value: profile.linkedin,
      },
      // GitHub
      {
        selectors: [
          'input[name*="github" i]',
          'input[placeholder*="github" i]',
          'input[data-automation-id*="github" i]',
        ],
        value: profile.github,
      },
      // Portfolio / Website
      {
        selectors: [
          'input[name*="website" i]',
          'input[name*="portfolio" i]',
          'input[placeholder*="portfolio" i]',
          'input[placeholder*="website" i]',
        ],
        value: profile.portfolio,
      },
      // City / Location
      {
        selectors: [
          'input[name*="city" i]',
          'input[placeholder*="city" i]',
          'input[data-automation-id*="addressSection_city" i]',
        ],
        value: profile.city || 'Bengaluru',
      },
    ];

    for (const item of mappings) {
      if (!item.value) continue;
      for (const selector of item.selectors) {
        const input = document.querySelector(selector);
        if (input && !input.value) {
          setNativeValue(input, item.value);
          filledCount++;
          break; // Stop after first match for this attribute
        }
      }
    }

    return filledCount;
  }

  // Listen for message from Extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'AUTOFILL') {
      const count = autofillProfile(request.profile);
      sendResponse({ status: 'success', filledCount: count });
    }
    return true;
  });
})();
