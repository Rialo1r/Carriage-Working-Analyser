export const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function dateKey(d:Date|string){return new Date(d).toISOString().slice(0,10);}
export function operates(diagram:any,date:Date):boolean|null{
 const exception=diagram.calendarRules?.find((r:any)=>dateKey(r.date)===dateKey(date));if(exception)return exception.operates;
 if(!diagram.operatingDays?.length)return null;return diagram.operatingDays.includes(weekdays[date.getUTCDay()]);
}
export function timeline(movements:any[]){
 const entries:any[]=[];let previous:any=null;
 for(const m of [...movements].sort((a,b)=>a.sequence-b.sequence)){
  const start=m.departureMinutes,end=m.arrivalMinutes;
  if(previous&&previous.arrivalMinutes!=null&&start!=null){const gap=start-previous.arrivalMinutes;entries.push({kind:gap<0?'Conflict':'Layover',start:previous.arrivalMinutes,end:start,minutes:gap,stationId:previous.destinationId,locationGap:previous.destinationId!==m.originId});}
  entries.push({kind:'Movement',id:m.id,trainNumber:m.trainNumber,start,end,originId:m.originId,destinationId:m.destinationId,unknown:start==null||end==null,conflict:start!=null&&end!=null&&end<start,dayOffset:start==null?null:Math.floor(start/1440)});previous=m;
 }
 return entries;
}
export function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value='';}else value+=c;}
 if(quoted)throw new Error('Unclosed quoted CSV field');if(value||row.length){row.push(value);rows.push(row);}return rows;
}
export function csvCell(value:unknown){let s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
