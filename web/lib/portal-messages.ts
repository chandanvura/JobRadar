// Project writing profile based on ASD-STE100 Issue 9 principles.
// This is not a full dictionary or a certification of STE compliance.
export const portalMessages={
 refreshFailedTitle:'Job update failed',
 refreshFailed:'JobRadar could not update the job list. Select Refresh to try again.',
 storageFull:'This browser cannot save your changes. Export your tracking before you close this page.',
 backupTitle:'Use the saved job list',
 backupIntro:'JobRadar cannot load live data. You can use the saved job list.',
 backupCheck:'Check the employer website before you apply. The saved jobs and scan details can be out of date.',
 backupLocal:'You can still save jobs and update your applications in this browser.',
 backupRetry:'Select Refresh to try live data again.',
 review:'Check the posting date and experience requirements before you apply. These jobs do not send automatic alerts.',
 unknownExperience:'The available job description does not state required experience. Check the employer website for the full description.',
 openExperience:'The employer does not state an upper experience limit. This requirement is not limited to three years.',
 conflictingExperience:'The experience requirements contain alternatives or conflicts. Check the employer description before you apply.',
 feedback:'This job is hidden from Recommended. Change your feedback in All Jobs to restore it.',
 evidence:'These statements come from the job description. Check the education and graduation requirements before you apply.'
} as const;
