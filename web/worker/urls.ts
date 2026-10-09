// Legacy employer pages sometimes publish HTTP links to Workday boards.
// Normalize only the known HTTPS-capable Workday host family before storage.
export function safeUrl(value:unknown){
  try{
    const url=new URL(String(value));
    if(url.protocol==='http:' && url.hostname.endsWith('.myworkdayjobs.com'))url.protocol='https:';
    return url.protocol==='https:' && url.hostname && !url.username && !url.password?url.toString():null;
  }catch{return null;}
}
