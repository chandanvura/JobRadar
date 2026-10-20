export function remoteEligibility(location:string,clauses:{text:string}[]) {
 const remote=/\b(?:remote|work from home)\b/i;
 const evidence=[location,...clauses.map(x=>x.text)].filter(x=>remote.test(x)&&!/\b(?:remote (?:customers|teams|systems|support)|not remote|no remote)\b/i.test(x));
 if(!evidence.length)return {status:'none',label:null,evidence:[]} as const;
 const india=/\b(?:remote[\s,()/–—:-]*india|india[\s,()/–—:-]*remote|remote.{0,35}(?:based|located|resid(?:e|ing)) in india|(?:based|located|resid(?:e|ing)) in india.{0,35}remote)\b/i;
 const restricted=/\b(?:remote.{0,50}(?:US|USA|United States|UK|United Kingdom|Canada|Australia|Europe|EMEA)[ -]only|(?:US|USA|United States|UK|United Kingdom|Canada|Australia|Europe|EMEA)[ -]only.{0,35}remote|remote[\s,()/–—:-]*(?:US|USA|United States|UK|United Kingdom|Canada|Australia|Europe|EMEA)\s*$)/i;
 const allowed=evidence.some(x=>india.test(x)),blocked=evidence.some(x=>restricted.test(x));
 const status=allowed&&blocked?'conflict':blocked?'restricted':allowed?'india':'unverified';
 const label=status==='conflict'?'Remote country requirements conflict — verify':status==='restricted'?'Remote restricted outside India — verify':status==='india'?'Remote India stated — check hiring conditions':'Remote country eligibility not confirmed';
 return {status,label,evidence:evidence.slice(0,4)};
}
