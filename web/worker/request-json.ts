export class BodyTooLarge extends Error {}
/** Enforce bytes from the stream, including requests without Content-Length. */
export async function boundedJson(request:Request,maxBytes:number):Promise<unknown>{
 const reader=request.body?.getReader();
 if(!reader)throw new SyntaxError('Missing JSON body');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){await reader.cancel();throw new BodyTooLarge('Payload too large');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
