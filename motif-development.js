/* FretAttack Motif Development · Pro-only practice module.
   Independent key/scale selection, no changes to global context. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const names=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const patterns={"Major":[0,2,4,5,7,9,11],"Natural Minor":[0,2,3,5,7,8,10],
"Major Pentatonic":[0,2,4,7,9],"Minor Pentatonic":[0,3,5,7,10],
"Dorian":[0,2,3,5,7,9,10],"Mixolydian":[0,2,4,5,7,9,10]};
const guides={
 ending:["Change the ending","Keep the first notes and give the phrase a different final note."],
 reverse:["Reverse the notes","Play the original pitches in reverse order."],
 one:["Change one note","Keep the rhythm and replace exactly one pitch."],
 rhythm:["Change the rhythm","Keep every pitch in order, but change at least one note duration."],
 transpose:["Transpose the motif","Move every note up or down by the same number of scale steps, keeping the melodic shape."],
 answer:["Question and answer","Create a different but related phrase. Repeat at least one pitch and change at least one other pitch."]
};
const store="fretattack_motif_progress_v1";
let original=[],variation=[],pool=[],audio=null,scheduled=[],playing=false,playToken=0;
let stats={completed:0,attempts:0,byChallenge:{}};
try{const v=JSON.parse(localStorage.getItem(store)||"null");if(v&&typeof v.completed==="number"&&typeof v.attempts==="number"&&v.byChallenge&&typeof v.byChallenge==="object")stats=v;}catch(_){}
const canUse=()=>!!window.FretAttackDevEntitlement?.isPro();
function save(){try{localStorage.setItem(store,JSON.stringify(stats));}catch(_){}}
function showStats(){
 const parts=Object.entries(stats.byChallenge).filter(([,n])=>n>0).map(([k,n])=>(guides[k]?.[0]||k)+": "+n);
 $("motifStats").textContent=stats.completed+" objectives completed from "+stats.attempts+" checks. "+(parts.length?"Completed: "+parts.join(" · "):"Try a challenge to begin.");
}
function scalePool(){
 const root=names.indexOf($("motifKey").value);
 pool=patterns[$("motifScale").value].map(n=>(root+n)%12);
}
function size(){return {beginner:3,intermediate:4,advanced:5}[$("motifDifficulty").value]||3;}
function generate(){
 stop();scalePool();
 const count=size(),offset=Math.floor(Math.random()*pool.length);
 original=Array.from({length:count},(_,i)=>({index:(offset+[0,2,3,4,5][i])%pool.length,duration:1}));
 variation=original.map(n=>({...n}));
 render();
 $("motifFeedback").textContent="Listen to the original, edit your variation, then check the objective.";
}
function render(){
 const mode=$("motifChallenge").value;
 $("motifGoal").textContent="Goal: "+guides[mode][0];
 $("motifInstructions").textContent=guides[mode][1];
 const show=(id,seq,editable)=>{
  const el=$(id);el.replaceChildren();
  seq.forEach((n,i)=>{
   const wrap=document.createElement("div");wrap.className="motif-note";wrap.dataset.index=i;
   const button=document.createElement("button");button.type="button";
   button.textContent=names[pool[n.index]];button.setAttribute("aria-label","Note "+(i+1)+": "+names[pool[n.index]]+(editable?", tap to choose the next scale note":""));
   if(editable)button.onclick=()=>{if(!canUse())return;variation[i].index=(variation[i].index+1)%pool.length;render();};
   else button.disabled=true;
   const duration=document.createElement("select");duration.setAttribute("aria-label",(editable?"Change":"Original")+" duration of note "+(i+1));
   [[.5,"½ beat"],[1,"1 beat"],[2,"2 beats"]].forEach(([value,label])=>{const opt=document.createElement("option");opt.value=value;opt.textContent=label;duration.appendChild(opt);});
   duration.value=String(n.duration);duration.disabled=!editable;
   if(editable)duration.onchange=()=>{if(!canUse())return;variation[i].duration=Number(duration.value);};
   wrap.append(button,duration);el.appendChild(wrap);
  });
 };
 show("motifOriginal",original,false);show("motifVariation",variation,true);
}
function objective(){
 const mode=$("motifChallenge").value;
 const pitchChanges=variation.map((v,i)=>v.index!==original[i].index);
 const changed=pitchChanges.filter(Boolean).length;
 const durationChanges=variation.some((v,i)=>v.duration!==original[i].duration);
 const samePitches=variation.every((v,i)=>v.index===original[i].index);
 if(mode==="ending")return [changed===1&&pitchChanges[pitchChanges.length-1]&&!durationChanges,"Keep the opening notes and change only the final pitch."];
 if(mode==="reverse")return [variation.every((v,i)=>v.index===original[original.length-i-1].index),"Try reversing the order of the original notes."];
 if(mode==="one")return [changed===1&&!durationChanges,"Change exactly one pitch, keeping the same rhythm."];
 if(mode==="rhythm")return [samePitches&&durationChanges,"Keep the same notes in order, and change one or more durations."];
 if(mode==="transpose"){
  const steps=variation.map((v,i)=>(v.index-original[i].index+pool.length)%pool.length);
  return [steps[0]!==0&&steps.every(n=>n===steps[0])&&!durationChanges,"Shift every note by the same number of scale steps. Tap each note until the same shift applies."];
 }
 return [changed>0&&changed<variation.length&&variation.some(v=>original.some(o=>o.index===v.index)),"Repeat at least one note from the call and change another to make your answer."];
}
function check(){
 if(!canUse())return;
 stats.attempts++;
 const mode=$("motifChallenge").value;
 const [pass,hint]=objective();
 if(pass){stats.completed++;stats.byChallenge[mode]=(stats.byChallenge[mode]||0)+1;}
 save();showStats();
 $("motifFeedback").textContent=pass?
 "Objective met! "+guides[mode][0]+" is a useful way to develop a recognizable musical idea. Listen to both versions and decide which phrasing you prefer.":
 "Not quite the selected objective: "+hint+" Your variation may still be musically useful—this check is about the exercise instructions, not whether the music sounds good.";
}
function stop(){
 playToken++;playing=false;
 scheduled.forEach(({osc,gain})=>{try{gain.gain.cancelScheduledValues(0);gain.gain.setValueAtTime(0,audio?.currentTime||0);osc.stop();}catch(_){}});
 scheduled=[];
 document.querySelectorAll(".motif-note.playing").forEach(el=>el.classList.remove("playing"));
}
async function play(seq,id){
 if(!canUse())return;
 stop();
 const token=playToken;
 try{
  if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
  await audio.resume();
  if(token!==playToken)return;
  const start=audio.currentTime+.04,beat=.42;
  let time=start;
  seq.forEach((n,i)=>{
   const midi=60+((pool[n.index]-0+12)%12); // pitches within octave C4–B4
   const osc=audio.createOscillator(),gain=audio.createGain();
   osc.type="triangle";osc.frequency.value=440*Math.pow(2,(midi-69)/12);
   gain.gain.setValueAtTime(.0001,time);
   gain.gain.exponentialRampToValueAtTime(.15,time+.015);
   gain.gain.exponentialRampToValueAtTime(.0001,time+Math.max(.06,n.duration*beat-.025));
   osc.connect(gain);gain.connect(audio.destination);
   osc.start(time);osc.stop(time+n.duration*beat);
   scheduled.push({osc,gain});
   const element=$(id).children[i];
   // Visual playback follows the scheduled audio clock.
   const wait=Math.max(0,(time-audio.currentTime)*1000);
   setTimeout(()=>{if(token===playToken)element?.classList.add("playing");},wait);
   setTimeout(()=>{if(token===playToken)element?.classList.remove("playing");},Math.max(0,(time+n.duration*beat-audio.currentTime)*1000));
   time+=n.duration*beat;
  });
 }catch(e){$("motifFeedback").textContent="Audio playback is unavailable in this browser. You can still edit and check your motif.";}
}
function init(){
 names.forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;$("motifKey").appendChild(o);});
 Object.keys(patterns).forEach(n=>{const o=document.createElement("option");o.value=n;o.textContent=n;$("motifScale").appendChild(o);});
 $("motifKey").value="A";$("motifScale").value="Natural Minor";
 ["motifKey","motifScale","motifDifficulty","motifChallenge"].forEach(id=>$(id).addEventListener("change",generate));
 $("motifNew").onclick=generate;
 $("motifReset").onclick=()=>{if(!canUse())return;stop();variation=original.map(n=>({...n}));render();$("motifFeedback").textContent="Variation reset. Try another idea.";};
 $("motifCheck").onclick=check;
 $("motifPlayOriginal").onclick=()=>play(original,"motifOriginal");
 $("motifPlayVariation").onclick=()=>play(variation,"motifVariation");
 $("motifStop").onclick=stop;
 $("motifResetStats").onclick=()=>{if(!canUse())return;if(!confirm("Reset Motif Development progress on this device?"))return;stats={completed:0,attempts:0,byChallenge:{}};save();showStats();};
 document.querySelectorAll(".ptab").forEach(button=>button.addEventListener("click",()=>{if(button.dataset.ex!=="motifEx")stop();}));
 document.querySelectorAll(".tab[data-page]").forEach(button=>button.addEventListener("click",stop));
 $("devEdition").addEventListener("change",()=>{if(!canUse())stop();});
 generate();showStats();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
