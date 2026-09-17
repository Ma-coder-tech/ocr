// Disconnected native evidence adapter. No RateReveal runtime imports.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {getDocument,Util} from 'pdfjs-dist/legacy/build/pdf.mjs';
const [input,output]=process.argv.slice(2);
const bytes=readFileSync(input!);const doc=await getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:false,isEvalSupported:false}).promise;
const pages=[];
for(let n=1;n<=doc.numPages;n++){
 const p=await doc.getPage(n);const view=p.getViewport({scale:1});const content=await p.getTextContent();
 const fragments=content.items.flatMap((item,i)=>{
  if(!('str' in item)||!item.str.trim())return [];
  const t=Util.transform(view.transform,item.transform);const height=Math.hypot(t[2]!,t[3]!);
  return [{id:`p${n}-f${i}`,text:item.str,x:t[4],y:t[5]! - height,width:item.width,height,baseline:t[5],font:item.fontName,dir:item.dir}];
 });
 pages.push({page:n,width:view.width,height:view.height,fragments});p.cleanup();
}
await doc.destroy();
writeFileSync(output!,JSON.stringify({schema:'positioned-native-evidence-v1',sourceSha256:createHash('sha256').update(bytes).digest('hex'),extractor:{name:'pdfjs',version:'5.6.205',ocr:false},pages}));
