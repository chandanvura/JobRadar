type Result={meta?:{rows_read?:number;rows_written?:number;duration?:number}};
export function d1Metrics(route:string,results:Result[]){
 const value=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:0;
 const summary=results.reduce((total,row)=>({rows_read:total.rows_read+value(row.meta?.rows_read),rows_written:total.rows_written+value(row.meta?.rows_written),query_ms:total.query_ms+value(row.meta?.duration)}),{rows_read:0,rows_written:0,query_ms:0});
 console.log(JSON.stringify({event:'d1_usage',route,...summary}));
 return {...summary,headers:{'X-JobRadar-D1-Rows-Read':String(summary.rows_read),'Server-Timing':`d1;dur=${summary.query_ms.toFixed(2)}`}};
}
