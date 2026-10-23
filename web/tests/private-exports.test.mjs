import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingCsv,followUpDue,followUpCalendar,displaySkill} from '../lib/private-exports.ts';
const row={saved:true,status:'Applied',followUpOn:'2026-10-23',job:{company:'=HYPERLINK("unsafe")',title:'Java, Engineer',normalized_location:'Bengaluru',application_url:'https://employer.test/job/1'}};
test('CSV exports select the requested private records, quote cells and neutralize formulas',()=>{
 const csv=trackingCsv([row,{...row,saved:false,status:'New'}],'Saved');
 assert.equal(csv.split('\r\n').length,3);
 assert.match(csv,/"'=HYPERLINK\(""unsafe""\)"/);
 assert.match(csv,/"Java, Engineer"/);
 assert.equal(trackingCsv([{...row,status:'New'}],'Applications').split('\r\n').length,2);
});
test('follow-up reminders are date-based, actionable-stage only, and cannot inject calendar records',()=>{
 assert.equal(followUpDue(row,'2026-10-23'),true);
 assert.equal(followUpDue({...row,status:'Rejected'},'2026-10-23'),false);
 assert.equal(followUpDue(row,'2026-10-22'),false);
 const ics=followUpCalendar({...row,job:{...row.job,title:'Role\nEND:VEVENT\nBEGIN:VEVENT'}});
 assert.equal(ics.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);
 assert.match(ics,/DTSTART;VALUE=DATE:20261023/);
 assert.throws(()=>followUpCalendar({...row,followUpOn:'bad'}));
 assert.throws(()=>followUpCalendar({...row,followUpOn:'2026-02-31'}));
 assert.equal(followUpDue({...row,followUpOn:'2026-99-99'},'2027-01-01'),false);
});
test('skill display preserves canonical case without changing unknown employer terms',()=>{
 assert.equal(displaySkill('python'),'Python');assert.equal(displaySkill('ci/cd'),'CI/CD');assert.equal(displaySkill('SpecialPlatform'),'SpecialPlatform');
});
