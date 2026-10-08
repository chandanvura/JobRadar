export function boardAttribution(job:{company:string;application_url:string;career_page_url?:string}) {
 try {
  const url=new URL(job.application_url);
  if(job.company==='Juniper Networks'&&url.hostname==='hpe.wd5.myworkdayjobs.com'&&/\/jobsathpe\/job\//i.test(url.pathname))return {employer:'HPE',careerUrl:'https://hpe.wd5.myworkdayjobs.com/Jobsathpe',note:'Published on the shared HPE careers board; Juniper discovery source. Hiring team: verify description.'};
 }catch{/* Invalid URLs remain subject to the existing source checks. */}
 return {employer:job.company,careerUrl:job.career_page_url,note:null};
}
