import {jakePreamble} from './jake-preamble.ts';
export const escapeTex=(s:string)=>s.replace(/[\\{}$&#%_~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]!));
export function buildJakeResume(name:string,contact:string,sections:string[][]){
 return jakePreamble+`\\begin{document}\n\\begin{center}{\\Huge\\scshape ${escapeTex(name)}}\\\\\n${escapeTex(contact)}\\end{center}\n${sections.map(([title,value])=>`\\section{${escapeTex(title)}}\n${value.split('\n').map(l=>escapeTex(l)||'\\medskip').join('\\par\n')}`).join('\n')}\n\\end{document}\n`;
}
