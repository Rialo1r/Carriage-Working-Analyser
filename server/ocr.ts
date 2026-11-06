import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const exec=promisify(execFile);
export async function processOcrJob(db:PrismaClient,storage:string){
 const job=await db.ocrJob.findFirst({where:{status:'Queued'},orderBy:{createdAt:'asc'},include:{page:{include:{file:true}}}});
 if(!job)return false;
 const claim=await db.ocrJob.updateMany({where:{id:job.id,status:'Queued'},data:{status:'Running',lockedAt:new Date(),error:null}});if(!claim.count)return false;
 const dir=await mkdtemp(path.join(tmpdir(),'lner-ocr-'));
 try{
  await mkdir(storage,{recursive:true});
  await exec('pdftoppm',['-f',String(job.page.pdfPage),'-l',String(job.page.pdfPage),'-singlefile','-scale-to','3500','-png',path.join(storage,job.page.file.storageKey),path.join(dir,'page')],{timeout:120000,maxBuffer:1024*1024});
  let image=await sharp(path.join(dir,'page.png')).rotate(job.rotation).toBuffer();
  if(job.region){const r=job.region as {x:number;y:number;width:number;height:number};const meta=await sharp(image).metadata();const w=meta.width!,h=meta.height!;const left=Math.floor(r.x*w),top=Math.floor(r.y*h);image=await sharp(image).extract({left,top,width:Math.min(w-left,Math.max(1,Math.floor(r.width*w))),height:Math.min(h-top,Math.max(1,Math.floor(r.height*h)))}).toBuffer();}
  const imageKey=`${job.id}.png`;await sharp(image).normalize().png().toFile(path.join(storage,imageKey));
  await exec('tesseract',[path.join(storage,imageKey),path.join(dir,'ocr'),'-l','eng','--psm',String(job.layout),'txt','tsv'],{timeout:180000,maxBuffer:1024*1024});
  const text=await readFile(path.join(dir,'ocr.txt'),'utf8');const tsv=await readFile(path.join(dir,'ocr.tsv'),'utf8');
  const blocks=tsv.trim().split('\n').slice(1).map(line=>{const c=line.split('\t');return {level:Number(c[0]),left:Number(c[6]),top:Number(c[7]),width:Number(c[8]),height:Number(c[9]),confidence:Number(c[10]),text:c.slice(11).join('\t')};}).filter(b=>b.text&&b.confidence>=0);
  const confidence=blocks.length?blocks.reduce((a,b)=>a+b.confidence,0)/blocks.length:null;
  await db.ocrJob.update({where:{id:job.id},data:{status:'Completed',rawText:text,blocks,confidence,imageKey,finishedAt:new Date()}});
 }catch(e:any){await db.ocrJob.update({where:{id:job.id},data:{status:'Failed',error:String(e.message).slice(0,2000),finishedAt:new Date()}});}finally{await rm(dir,{recursive:true,force:true});}
 return true;
}
