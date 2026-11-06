import {dateKey,operates} from './domain.js';
export type Check={name:string;state:'Pass'|'Fail'|'Unknown';reason:string};
function composition(d:any,ending:boolean):{known:boolean;valid:boolean;counts:Record<string,number>}{
 const counts:Record<string,number>={};let known=!!d.requirements?.length,valid=true;
 for(const r of d.requirements||[]){if(!r.typeCode||r.quantity==null){known=false;continue;}counts[r.typeCode]=(counts[r.typeCode]||0)+r.quantity;}
 const movements=[...(d.movements||[])].sort((a,b)=>a.sequence-b.sequence);
 for(let i=0;i<movements.length;i++)for(const c of movements[i].changes||[]){if(!ending&&(i!==0||c.afterMovement))continue;if(!c.typeCode||c.quantity==null){known=false;continue;}counts[c.typeCode]=(counts[c.typeCode]||0)+(c.action==='Attach'?1:-1)*c.quantity;if(counts[c.typeCode]<0)valid=false;}
 for(const k of Object.keys(counts))if(counts[k]===0)delete counts[k];return {known,valid,counts};
}
export function assessConnection(from:any,to:any,dayOffset:number,scenario:any,transfer?:any){
 const a=from.movements?.at(-1),b=to.movements?.[0];const checks:Check[]=[];
 const add=(name:string,state:Check['state'],reason:string)=>checks.push({name,state,reason});
 let kind='Direct';
 if(!a?.destinationId||!b?.originId)add('Location','Unknown','Endpoint station unknown');
 else if(a.destinationId===b.originId)add('Location','Pass','Finishing and starting stations match; continuity still requires review');
 else if(transfer&&transfer.originId===a.destinationId&&transfer.destinationId===b.originId){kind='Documented transfer';add('Location','Pass','A source-linked recorded transfer joins the stations');}
 else {kind='Unresolved gap';add('Location','Unknown','Different stations; no documented connecting movement. No ECS movement has been invented.');}
 if(a?.arrivalMinutes==null||b?.departureMinutes==null)add('Timing','Unknown','Finishing or starting time unknown');
 else {const end=a.arrivalMinutes,start=dayOffset*1440+b.departureMinutes;let okay=start>=end;if(transfer)okay=okay&&transfer.departureMinutes!=null&&transfer.arrivalMinutes!=null&&transfer.departureMinutes>=end&&transfer.arrivalMinutes<=start&&transfer.arrivalMinutes>=transfer.departureMinutes;add('Timing',okay?'Pass':'Fail',okay?`${start-end} minutes available between workings`:'Overlapping workings or transfer timing incompatible / unknown');}
 const dates:{fromDate:string;toDate:string;fromOperates:boolean|null;toOperates:boolean|null}[]=[];
 const end=new Date(scenario.endDate),start=new Date(scenario.startDate);
 for(let day=new Date(start);day<=end;day=new Date(day.getTime()+86400000)){const next=new Date(day.getTime()+dayOffset*86400000);if(next>end)break;dates.push({fromDate:dateKey(day),toDate:dateKey(next),fromOperates:operates(from,day),toOperates:operates(to,next)});}
 const compatible=dates.filter(d=>d.fromOperates===true&&d.toOperates===true),unknown=dates.some(d=>d.fromOperates!==false&&d.toOperates!==false&&(d.fromOperates==null||d.toOperates==null));
 add('Calendar',compatible.length?'Pass':unknown?'Unknown':'Fail',compatible.length?`${compatible.length} supported date pairing(s) inside this scenario`:unknown?'Operating days insufficiently specified':'No compatible dates within the selected scenario');
 const ac=composition(from,true),bc=composition(to,false);const canon=(o:Record<string,number>)=>JSON.stringify(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
 add('Composition',!ac.valid||!bc.valid?'Fail':!ac.known||!bc.known?'Unknown':canon(ac.counts)===canon(bc.counts)?'Pass':'Fail',!ac.valid||!bc.valid?'Recorded detachment exceeds recorded stock':!ac.known||!bc.known?'Starting or finishing composition incomplete':canon(ac.counts)===canon(bc.counts)?'Type and quantity agree after recorded changes':'Known carriage compositions differ');
 add('Source period',from.documentId&&from.documentId===to.documentId?'Pass':'Unknown',from.documentId&&from.documentId===to.documentId?'Same source document; scenario assumptions still apply':'Different or unknown source editions; explicit cross-period review required');
 const confidence=checks.some(c=>c.state==='Fail')?'Conflict':checks.every(c=>c.state==='Pass')?'Probable':checks.filter(c=>c.state==='Pass').length>=2?'Possible':'Unknown';
 return {checks,confidence,kind,dates};
}
export function buildRotation(startId:string,links:any[],diagrams:Map<string,any>,scenario:any){
 const steps:any[]=[];const seen=new Map<string,number>();let current=startId,day=0;
 const issues:string[]=[];let periodDays:number|null=null,closed=false;
 for(let n=0;n<1000;n++){
  if(seen.has(current)){if(current===startId){closed=true;periodDays=day;}else issues.push('Path enters a different cycle');break;}
  seen.set(current,day);const d=diagrams.get(current);if(!d){issues.push('Diagram missing');break;}steps.push({diagramId:current,dayOffset:day,publishedNumber:d.publishedNumber});
  const incoming=links.filter(l=>l.toId===current);if(incoming.length>1)issues.push('Competing incoming stock connections for '+(d.publishedNumber||current));
  const options=links.filter(l=>l.fromId===current);if(options.length===0){issues.push('No approved continuation for '+(d.publishedNumber||current));break;}if(options.length>1){issues.push('Competing outgoing stock connections for '+(d.publishedNumber||current));break;}
  if(options[0].confidence==='Conflict'||options[0].kind==='Unresolved gap'){issues.push('Conflict or unresolved stock-transfer gap');break;}
  current=options[0].toId;day+=options[0].dayOffset;
 }
 if(!closed&&!issues.length)issues.push('Traversal limit reached');
 let calendarSupported=false;const start=new Date(scenario.startDate),end=new Date(scenario.endDate);
 if(closed&&periodDays){
  // A three-day cycle can repeat with daily calendars; a Monday-only diagram
  // cannot recur on Thursday. Compare all seven weekday states under the shift.
  const period=periodDays;
  calendarSupported=!!period&&start.getTime()+period*2*86400000<=end.getTime()&&steps.every(s=>{
   const d=diagrams.get(s.diagramId);
   if(!d.operatingDays?.length)return false;
   for(let weekday=0;weekday<7;weekday++){const a=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][weekday],b=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][(weekday+period)%7];if(d.operatingDays.includes(a)!==d.operatingDays.includes(b))return false;}
   for(let offset=0;start.getTime()+(s.dayOffset+offset)*86400000<=end.getTime();offset+=period){if(operates(d,new Date(start.getTime()+(s.dayOffset+offset)*86400000))!==true)return false;}return true;
  });
  if(!calendarSupported)issues.push('Closed stock circuit found; recurring calendar not established in this scenario');
 }
 const usedLinks=links.filter(l=>steps.some(s=>s.diagramId===l.fromId));
 if(closed&&usedLinks.some(l=>Array.isArray(l.checks)&&l.checks.some((c:any)=>c.state!=='Pass')))issues.push('Connection constraints remain uncertain; recurrence not established');
 const allConfirmed=links.filter(l=>steps.some(s=>s.diagramId===l.fromId)).every(l=>l.confidence==='Confirmed');
 return {steps,periodDays,repeats:closed&&calendarSupported&&issues.length===0,status:issues.length?'Needs review':allConfirmed?'Confirmed':'Approved hypothesis',issues};
}
