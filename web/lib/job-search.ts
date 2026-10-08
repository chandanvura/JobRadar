/** Local BM25 retrieval: all query terms may match different fields, in any order. */
export type SearchableJob={title:string;company:string;skills:string;role_category:string;normalized_location?:string;description?:string|null;ats_provider?:string};
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase()
  .replace(/hewlett[ -]+packard enterprise/g,'hpe').replace(/amazon web services/g,'aws')
  .replace(/site reliability engineer(?:ing)?|\bsre\b/g,'site reliability engineer')
  .replace(/software development engineer|\bsde\b|\bswe\b/g,'software engineer')
  .replace(/\bback[ -]?end\b/g,'backend').replace(/\bfront[ -]?end\b/g,'frontend')
  .replace(/\bfull[ -]?stack\b/g,'fullstack').replace(/\bk8s\b/g,'kubernetes')
  .replace(/\bgolang\b/g,'go').replace(/\bnode[ .]?js\b/g,'nodejs')
  .replace(/\bdotnet\b|\.net\b/g,'dotnet').replace(/\bbangalore\b/g,'bengaluru')
  .replace(/[^a-z0-9+#]+/g,' ').trim();
const stop=new Set(['a','an','the','of','for','and','in','at','with','jobs','job','role','roles']);
const tokens=(text:string)=>normalize(text).split(/\s+/).filter(token=>token.length>1&&!stop.has(token));
function oneEdit(a:string,b:string) {
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>=b.length)i++;
    if(b.length>=a.length)j++;
  }
  return edits+(i<a.length||j<b.length?1:0)<=1;
}
export function createJobSearchIndex<T extends SearchableJob>(jobs:T[]) {
  const postings=new Map<string,Map<number,number>>(), lengths:number[]=[], texts:string[]=[];
  jobs.forEach((job,id)=>{
    const fields:[[string,number],...Array<[string,number]>]=[[job.title,5],[job.company,4],[job.skills,3],[job.role_category,3],[job.normalized_location||'',2],[job.ats_provider||'',1],[job.description?.slice(0,12000)||'',.6]];
    const frequencies=new Map<string,number>();let length=0;
    fields.forEach(([text,weight])=>tokens(text).forEach(token=>{frequencies.set(token,(frequencies.get(token)||0)+weight);length++;}));
    lengths[id]=length;texts[id]=normalize(fields.map(([text])=>text).join(' '));
    frequencies.forEach((frequency,token)=>{if(!postings.has(token))postings.set(token,new Map());postings.get(token)!.set(id,frequency);});
  });
  const average=Math.max(1,lengths.reduce((a,b)=>a+b,0)/Math.max(1,jobs.length));
  const vocabulary=[...postings.keys()];const byInitial=new Map<string,string[]>();
  vocabulary.forEach(word=>{const key=word[0];if(!byInitial.has(key))byInitial.set(key,[]);byInitial.get(key)!.push(word);});
  return {search(query:string):Map<T,number>{
    const bounded=query.slice(0,300);const terms=[...new Set(tokens(bounded))].slice(0,20);
    if(!terms.length)return new Map(jobs.map(job=>[job,0]));
    const phrases=[...bounded.matchAll(/"([^"\n]+)"/g)].map(match=>normalize(match[1]));
    let scores:Map<number,number>|null=null;
    for(const term of terms){
      const alternatives=new Map<string,number>();
      if(postings.has(term))alternatives.set(term,1);
      for(const word of byInitial.get(term[0])||[]){
        if(word!==term&&term.length>=3&&word.startsWith(term))alternatives.set(word,.8);
        else if(!postings.has(term)&&term.length>=5&&oneEdit(term,word))alternatives.set(word,.6);
      }
      const matches=new Map<number,number>();
      for(const [word,weight] of alternatives){
        const documents=postings.get(word)!;const idf=Math.log(1+(jobs.length-documents.size+.5)/(documents.size+.5));
        for(const [id,tf] of documents){
          const score=weight*idf*(tf*2.2)/(tf+1.2*(.25+.75*lengths[id]/average));
          matches.set(id,Math.max(matches.get(id)||0,score));
        }
      }
      if(scores===null)scores=matches;
      else {for(const [id,score] of scores){if(!matches.has(id))scores.delete(id);else scores.set(id,score+matches.get(id)!);}}
      if(!scores.size)return new Map();
    }
    return new Map([...(scores||[])].filter(([id])=>phrases.every(phrase=>texts[id].includes(phrase))).sort((a,b)=>b[1]-a[1]).map(([id,score])=>[jobs[id],score]));
  }};
}
