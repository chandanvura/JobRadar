/** Show employer HTML as text. Never execute it or change the original evidence. */
export function employerText(value:string) {
 return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
  .replace(/<\s*br\s*\/?>|<\/(?:p|div|ul|ol|li|h[1-6])\s*>/gi,'\n')
  .replace(/<li\b[^>]*>/gi,'• ').replace(/<[^>]*>/g,' ')
  .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi,entity=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[entity.toLowerCase()]||entity))
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code:string)=>{const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'';})
  .replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
