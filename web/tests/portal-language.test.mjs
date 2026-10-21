import test from 'node:test';
import assert from 'node:assert/strict';
import {portalMessages} from '../lib/portal-messages.ts';
import {employerText} from '../lib/employer-text.ts';
test('edited portal messages use short complete sentences without contractions',()=>{
 for(const [key,message] of Object.entries(portalMessages)){
  assert.doesNotMatch(message,/\b(?:can't|don't|won't|isn't|doesn't|couldn't|it's)\b/i,key);
  for(const sentence of message.split(/[.!?]+/).filter(value=>value.trim()))assert.ok(sentence.trim().split(/\s+/).length<=25,key);
 }
});
test('employer HTML is readable text while the source remains unchanged',()=>{
 const source='<h3>Requirements</h3><p>Java &amp; AWS.</p><ul><li>0–2 years</li><li>Bachelor&#39;s degree</li></ul><script>alert(1)</script>';
 assert.equal(employerText(source),"Requirements\nJava & AWS.\n• 0–2 years\n• Bachelor's degree");
 assert.ok(source.includes('<script>'));
 assert.equal(employerText('&#x110000; &#55296; text'),'text');
 assert.equal(employerText('&lt;script&gt;example&lt;/script&gt;'),'<script>example</script>');
});

test('employer text decodes entities once and handles quoted attributes without executing markup',()=>{
 assert.equal(employerText('&amp;lt;script&amp;gt;'), '&lt;script&gt;');
 assert.equal(employerText('&#38;lt;b&#38;gt;'), '&lt;b&gt;');
 assert.equal(employerText('<p title="a > b">Java</p><script type="text/javascript">private()</script><style>body{}</style>'), 'Java');
 assert.equal(employerText('<SCRIPT>private()<\/SCRIPT><p>0&ndash;2 years</p>'), '0–2 years');
 assert.equal(employerText('<!-- hidden -->Cloud<br/>AWS'), 'Cloud\nAWS');
});
