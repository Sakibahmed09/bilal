// The dated HTML remains useful without JavaScript. This selects the current
// day from that same published snapshot; it never relabels expired times today.
const data=JSON.parse(document.querySelector('#pageData').textContent);
const names=['Fajr','Dhuhr','Asr','Maghrib','Isha'];
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function update(){
 const now=new Date(),day=dateFormat.format(now),row=data.days.find(r=>r.date===day);
 const notice=document.querySelector('#coverageNotice');
 if(!row||!row.times.some(Boolean)){notice.hidden=false;notice.textContent='Current times aren’t in this saved timetable. Check the source for the latest times.';document.querySelector('#nextPrayer').textContent='';return}
 notice.hidden=true;
 document.querySelector('#dateLabel').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(now);
 const rows=document.querySelectorAll('#prayerRows tr');
 row.times.forEach((value,i)=>{const cell=rows[i].querySelector('td');cell.replaceChildren();const el=document.createElement(value?'time':'span');el.textContent=value||'Not published';if(!value)el.className='muted';cell.append(el)});
 const time=timeFormat.format(now),next=row.times.findIndex((v,i)=>v&&v>time&&!(data.thm&&i===3));
 document.querySelector('#nextPrayer').textContent=next<0?'No later jama’ah is listed for today.':`Next listed jama’ah: ${names[next]} at ${row.times[next]}`;
}
update();setInterval(update,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
