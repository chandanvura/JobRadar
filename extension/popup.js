// Load and save local applicant profile
document.addEventListener('DOMContentLoaded', async () => {
  const fields = ['firstName', 'lastName', 'email', 'phone', 'linkedin', 'github', 'portfolio'];

  // Load saved profile
  chrome.storage.local.get(['applicantProfile'], (result) => {
    if (result.applicantProfile) {
      for (const field of fields) {
        if (result.applicantProfile[field]) {
          document.getElementById(field).value = result.applicantProfile[field];
        }
      }
    }
  });

  // Auto-save on edit
  for (const field of fields) {
    document.getElementById(field).addEventListener('input', () => {
      const profile = {};
      for (const f of fields) {
        profile[f] = document.getElementById(f).value.trim();
      }
      chrome.storage.local.set({ applicantProfile: profile });
    });
  }

  // Trigger autofill on active tab
  document.getElementById('autofillBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Autofilling...';

    const profile = {};
    for (const f of fields) {
      profile[f] = document.getElementById(f).value.trim();
    }
    chrome.storage.local.set({ applicantProfile: profile });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusEl.textContent = 'No active tab found';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', profile }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Please open a job application page';
        statusEl.style.color = '#f59e0b';
      } else if (response && response.status === 'success') {
        statusEl.textContent = `Autofilled ${response.filledCount} fields!`;
        statusEl.style.color = '#10b981';
      }
    });
  });
});
