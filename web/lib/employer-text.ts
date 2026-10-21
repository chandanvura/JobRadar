/** Plain-text extraction for React text nodes, never an HTML sanitizer. */
const namedEntities:Record<string,string>={nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',ndash:'–',mdash:'—',plus:'+'};
export function decodeEmployerEntities(value:string):string {
 // A single pass preserves encoded evidence: &amp;lt; never becomes <.
 return value.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|quot|apos|lt|gt|ndash|mdash|plus);/gi,(_entity,code:string)=>{
  if(code[0]!=='#')return namedEntities[code.toLowerCase()];
  const point=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
  return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'';
 });
}

export function employerText(value:string):string {
 const chunks:string[]=[];let offset=0,hidden:string|null=null;
 while(offset<value.length){
  const open=value.indexOf('<',offset);
  if(open<0){if(!hidden)chunks.push(value.slice(offset));break;}
  if(!hidden)chunks.push(value.slice(offset,open));
  if(value.startsWith('<!--',open)){
   const end=value.indexOf('-->',open+4);offset=end<0?value.length:end+3;continue;
  }
  // Read quoted attributes without treating an embedded > as a tag boundary.
  let end=open+1,quote='';
  for(;end<value.length;end++){
   const char=value[end];
   if(quote){if(char===quote)quote='';}
   else if(char==='"'||char==="'")quote=char;
   else if(char==='>')break;
  }
  if(end===value.length){if(!hidden)chunks.push(value.slice(open));break;}
  const tag=value.slice(open+1,end),match=/^\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(tag);
  if(!match){if(!hidden)chunks.push(value.slice(open,end+1));offset=end+1;continue;}
  const closing=Boolean(match[1]),name=match[2].toLowerCase();
  if(hidden){if(closing&&name===hidden)hidden=null;}
  else if(!closing&&(name==='script'||name==='style'))hidden=name;
  else chunks.push(name==='br'||(closing&&/^(?:p|div|ul|ol|li|h[1-6])$/.test(name))?'\n':name==='li'&&!closing?'• ':' ');
  offset=end+1;
 }
 return decodeEmployerEntities(chunks.join('')).replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
