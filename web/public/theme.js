try {
 const theme=localStorage.getItem('jobradar-theme');
 const scheme=theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
 document.documentElement.dataset.theme=scheme;
 const meta=document.querySelector('meta[name="color-scheme"]');
 if(meta)meta.setAttribute('content',theme?scheme:'light dark');
} catch {document.documentElement.dataset.theme='light';}
