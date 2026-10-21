import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedJson,BodyTooLarge} from '../worker/request-json.ts';

test('chunked body without Content-Length cannot bypass the byte budget',async()=>{
 let cancelled=false;
 const request=new Request('https://example.test',{method:'POST',duplex:'half',body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"x":"'));controller.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}})});
 await assert.rejects(boundedJson(request,32),BodyTooLarge);assert.equal(cancelled,true);
});
test('JSON limit counts UTF-8 bytes, preserves valid payloads and rejects malformed bytes',async()=>{
 const make=text=>new Request('https://example.test',{method:'POST',body:text});
 const text=JSON.stringify({x:'界'}),size=new TextEncoder().encode(text).length;
 assert.deepEqual(await boundedJson(make(text),size),{x:'界'});
 await assert.rejects(boundedJson(make(text),size-1),BodyTooLarge);
 await assert.rejects(boundedJson(make('{'),32),SyntaxError);
 await assert.rejects(boundedJson(new Request('https://example.test'),32),SyntaxError);
});
