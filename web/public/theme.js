try {
 const theme=localStorage.getItem('jobradar-theme');
 document.documentElement.dataset.theme=theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
} catch {document.documentElement.dataset.theme='light';}
