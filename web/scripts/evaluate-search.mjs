import {readFile} from 'node:fs/promises';
import {createJobSearchIndex} from '../lib/job-search.ts';
import {matchesCareerView} from '../lib/job-view.ts';
const data=JSON.parse(await readFile(new URL('../tests/fixtures/real-search-review.json',import.meta.url)));
const candidates=data.jobs.filter(job=>matchesCareerView(job,'Dashboard',0,3,false));
const index=createJobSearchIndex(candidates);
const dcg=(grades)=>grades.reduce((sum,g,i)=>sum+(2**g-1)/Math.log2(i+2),0);
const rows=data.queries.map(({query,relevance})=>{
 const hits=[...index.search(query).keys()].slice(0,5);
 const grades=hits.map(job=>relevance[job.key]||0);
 const found=grades.filter(Boolean).length;
 const relevant=Object.keys(relevance).length;
 const ideal=dcg(Object.values(relevance).sort((a,b)=>b-a).slice(0,5));
 return {query,precision:found/Math.max(1,hits.length),recall:found/relevant,ndcg:ideal?dcg(grades)/ideal:0,results:hits.map(job=>job.key),missed:Object.keys(relevance).filter(key=>!hits.some(job=>job.key===key))};
});
console.log(JSON.stringify({records:data.jobs.length,candidates:candidates.length,queries:rows.length,macroPrecision:rows.reduce((s,r)=>s+r.precision,0)/rows.length,macroRecall:rows.reduce((s,r)=>s+r.recall,0)/rows.length,macroNdcg:rows.reduce((s,r)=>s+r.ndcg,0)/rows.length,rows},null,2));
