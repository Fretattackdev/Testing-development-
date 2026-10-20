/* FretAttack Supabase Auth v1: accounts are optional and never grant Pro. */
(()=>{
'use strict';

/* FretAttack v7.83: membership-based UI access.
   Supabase RLS protects membership rows. Frontend UI gates are not server-side protection
   for paid resources; server authorization is required before payments launch. */

 // No browser-controlled Pro entitlement. A future server-verified purchase will supply access.
 const FREE_SCALES=new Set(["Major","Natural Minor"]);
 const FREE_CHORDS=new Set(["Major","Minor"]);
 const PRO_PAGES=new Set(["songwriter","hum","savedSongsPage","savedRiffsPage"]);
 // Register all Pro Practice modes here; labels and access guards share this registry.
 const PRO_PRACTICE_MODES=new Map([
  ["masteryEx","Fretboard Mastery"],
  ["motifEx","Motif Development"]
 ]);
 const scaleIds=["st","prScale","riffScale","moveScale","speedScale","callScale","journeyScale"];
 const chordIds=["ct"];
 
 // Authenticated membership is retrieved from public.user_entitlements by the Supabase client.
 // Unknown/loading/error are never treated as Pro; browser storage cannot set the plan.
 let membership={status:"loading",plan:null};
 const isPro=()=>membership.status==="ready"&&membership.plan==="pro";
 const membershipLoading=()=>membership.status==="loading";
 function setMembership(next){
  membership={status:next.status,plan:next.status==="ready"&&next.plan==="pro"?"pro":next.status==="ready"?"free":null};
  apply();
  // A user may have clicked a Pro feature while membership was loading.
  // Reconcile the existing dialog as soon as the authoritative query completes.
  if(typeof modal!=="undefined"&&modal.classList.contains('visible')&&modal.dataset.waiting==='true'&&membership.status!=="loading"){
   const requested=modal.dataset.feature||'This feature';
   modal.dataset.waiting='false';
   if(isPro())close();else locked(requested);
  }
 }

 const modal=document.createElement("div");
 modal.id="editionLockNotice";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","editionLockTitle");
 modal.innerHTML='<div class="lock-card" tabindex="-1"><h2 id="editionLockTitle">FretAttack Pro</h2><p id="editionLockDescription"></p><p class="tiny" id="editionLockFinePrint">Purchases are not available during development testing.</p><div class="lock-actions"><button type="button" id="editionLockSignIn">Sign In</button><button type="button" id="editionLockCreate">Create Account</button><button type="button" class="lock-secondary" id="editionLockClose">Continue with Free</button></div></div>';
 document.body.appendChild(modal);
 let priorFocus=null;
 const close=()=>{modal.classList.remove("visible");document.body.style.removeProperty("overflow");if(priorFocus?.isConnected)priorFocus.focus();};
 const open=(title,description,mode)=>{
  priorFocus=document.activeElement;
  $('editionLockTitle').textContent=title;
  $('editionLockDescription').textContent=description;
  const loggedOut=mode==='guest';
  $('editionLockSignIn').hidden=!loggedOut;
  $('editionLockCreate').hidden=!loggedOut;
  $('editionLockClose').textContent=loggedOut?'Continue with Free':'Back to Free';
  $('editionLockFinePrint').textContent=mode==='checking'?'Your account is being verified. Pro features remain locked until verification finishes.':mode==='error'?'Open Account and select Retry membership check.': 'Purchases are not available during development testing.';
  modal.classList.add('visible');document.body.style.overflow='hidden';
  (loggedOut?$('editionLockSignIn'):$('editionLockClose')).focus();
 };
 $('editionLockClose').addEventListener('click',close);
 const openAccount=(view)=>{close();if(window.FretAttackAuthUI?.open)window.FretAttackAuthUI.open(view);else document.getElementById('openAccount')?.click();};
 $('editionLockSignIn').addEventListener('click',()=>openAccount('login'));
 $('editionLockCreate').addEventListener('click',()=>openAccount('signup'));
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{
  if(!modal.classList.contains('visible'))return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(e.key!=='Tab')return;
  const buttons=[...modal.querySelectorAll('button:not([hidden]):not([disabled])')];
  if(!buttons.length)return;
  const first=buttons[0],last=buttons[buttons.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 function locked(label){
  if(isPro())return;
  modal.dataset.feature=label;
  modal.dataset.waiting=membershipLoading()?'true':'false';
  const auth=window.FretAttackAuthUI;
  if(membershipLoading()||auth?.getAuthStatus?.()==='checking'){
   open('Checking Membership','Checking your Supabase membership. Please wait for verification to finish.','checking');return;
  }
  if(membership.status==='error'){
   open('Membership Unavailable','We could not verify your membership. Open Account to retry.','error');return;
  }
  if(auth?.getAuthStatus?.()==='signed_out'){
   open('Unlock FretAttack Pro','Already have Pro? Sign in to unlock your features. New here? Create an account to purchase Pro for $12.99 — or keep enjoying FretAttack Free without an account.','guest');return;
  }
  open('FretAttack Pro',label+' is included in FretAttack Pro — $12.99 USD, one-time lifetime purchase.','free');
 }
 function filterSelect(id,allowed,fallback){
  const sel=$(id);if(!sel)return;
  [...sel.options].forEach(o=>{
   const restricted=!allowed.has(o.value);
   o.disabled=!isPro()&&restricted;
   o.textContent=o.textContent.replace(/ 🔒 Pro$/,"")+(!isPro()&&restricted?" 🔒 Pro":"");
  });
  if(!isPro()&&!membershipLoading()&&!allowed.has(sel.value)){
   sel.value=fallback;
   sel.dispatchEvent(new Event("change",{bubbles:true}));
  }
 }
 function updateTunings(){
  const sel=$("tuningSelect");if(!sel)return;
  [...sel.options].forEach(o=>{
   const restricted=o.value!=="Standard";
   o.disabled=!isPro()&&restricted;
   o.textContent=o.textContent.replace(/ 🔒 Pro$/,"")+(!isPro()&&restricted?" 🔒 Pro":"");
  });
  if(!isPro()&&!membershipLoading()&&sel.value!=="Standard"){
   sel.value="Standard";
   sel.dispatchEvent(new Event("change",{bubbles:true}));
  }
  const custom=$("customTuning");
  if(custom&&!isPro())custom.style.display="none";
 }
 let updating=false;
 function apply(){
  if(updating)return;updating=true;
  try{
   // While checking, show locks and disable Pro choices. Never show a misleading unlocked state.
   scaleIds.forEach(id=>filterSelect(id,FREE_SCALES,"Major"));
   chordIds.forEach(id=>filterSelect(id,FREE_CHORDS,"Major"));
   updateTunings();
   // Free displays a lock; Pro automatically removes it.
   PRO_PRACTICE_MODES.forEach((label,id)=>{
    const button=document.querySelector('.ptab[data-ex="'+id+'"]');
    if(!button)return;
    const title=button.querySelector("strong");
    if(title)title.textContent=label+(isPro()?" · Pro":" 🔒 Pro");
    button.setAttribute("aria-label",label+(isPro()?", Pro feature":", locked, Pro feature"));
    button.title=isPro()?label+" — FretAttack Pro":label+" — requires FretAttack Pro";
   });
   // Make Pro-only tabs visibly locked in Free preview, and remove locks in Pro preview.
   [["songwriter","✍️ Songwriting"],["hum","🎙️ Hum a Riff"]].forEach(([page,label])=>{
    const tab=document.querySelector('.tab[data-page="'+page+'"]');
    if(!tab)return;
    tab.textContent=isPro()?label:label+" 🔒";
    tab.title=isPro()?label:label+" — FretAttack Pro $12.99 lifetime";
    tab.setAttribute("aria-label",isPro()?label:label+", locked, Pro feature");
    tab.classList.toggle("edition-tab-locked",!isPro());
   });
   if(typeof cfAccess==="function")cfAccess();
   if(!isPro()){
    const active=document.querySelector(".exercise.active");
    if(active&&PRO_PRACTICE_MODES.has(active.id)){
     document.querySelector('.ptab[data-ex="targetEx"]')?.click();
    }
    const page=document.querySelector(".page.active");
    if(page&&PRO_PAGES.has(page.id))document.querySelector('.tab[data-page="scales"]')?.click();
   }
  }finally{updating=false}
 }
 // Capture-phase guards prevent existing tab/menu handlers from opening Pro pages.
 document.addEventListener("click",e=>{
  if(isPro())return;
  if(membershipLoading()){
   const tab=e.target.closest('.tab[data-page="songwriter"],.tab[data-page="hum"],.ptab[data-ex="masteryEx"],.ptab[data-ex="motifEx"],#openSavedSongs,#openSavedRiffs,#backToHum,#backToSongwriting');
   if(tab){e.preventDefault();e.stopImmediatePropagation();locked("Membership is being checked. Please wait a moment");return;}
  }
  const tab=e.target.closest('.tab[data-page]');
  if(tab&&["songwriter","hum"].includes(tab.dataset.page)){
   e.preventDefault();e.stopImmediatePropagation();locked(tab.dataset.page==="hum"?"Hum a Riff":"Songwriting");return;
  }
  const practice=e.target.closest(".ptab[data-ex]");
  if(practice&&PRO_PRACTICE_MODES.has(practice.dataset.ex)){
   e.preventDefault();e.stopImmediatePropagation();
   locked(PRO_PRACTICE_MODES.get(practice.dataset.ex));return;
  }
  const menu=e.target.closest('#openSavedSongs,#openSavedRiffs,#backToHum,#backToSongwriting');
  if(menu){e.preventDefault();e.stopImmediatePropagation();locked("Saved Songs and Riffs");return}
 },true);
 // Guard dropdowns even when browser restores a previously selected Pro option.
 document.addEventListener("change",e=>{
  if(isPro()||updating||membershipLoading())return;
  const id=e.target.id;
  if(scaleIds.includes(id)&&!FREE_SCALES.has(e.target.value)){
   e.stopImmediatePropagation();e.target.value="Major";locked("Advanced scales and modes");
   setTimeout(apply,0);
  }else if(chordIds.includes(id)&&!FREE_CHORDS.has(e.target.value)){
   e.stopImmediatePropagation();e.target.value="Major";locked("Advanced chords");setTimeout(apply,0);
  }else if(id==="tuningSelect"&&e.target.value!=="Standard"){
   e.stopImmediatePropagation();e.target.value="Standard";locked("Alternate and custom tunings");setTimeout(apply,0);
  }
 },true);
 // Recheck after global key/mode synchronization or instrument changes.
 document.addEventListener("change",e=>{
  if(["instrumentSelect","sr","st","cr","ct","prScale","riffScale","moveScale","speedScale","callScale","journeyScale"].includes(e.target.id))setTimeout(apply,0);
 });
 // Existing app script initializes before this script; reconcile restored values now.
 // A reload starts locked until Supabase resolves the membership.
 apply();
 window.addEventListener("pageshow",apply);


 window.FretAttackMembership=Object.freeze({isPro:()=>isPro(),getStatus:()=>membership.status,getPlan:()=>membership.plan});

const $=id=>document.getElementById(id);
const config=window.FRETATTACK_SUPABASE_CONFIG||{};
let entitlementRequest=0;
let currentUserId=null, membershipTimer=null;
 let currentAuthGeneration=0, lastMembershipCheck=0;
let client=null, view='login', recovery=false, busy=false, linkError=false;
let authStatus='checking';
let displayedUser=null; // Account UI must reflect the actual Supabase session, not form navigation.
const status=(message,error=false)=>{const el=$('authStatus');el.textContent=message;el.style.color=error?'#ffb7b7':'';};
// Supabase is the only source of membership. Never trust localStorage or developer switches.
const membershipApi=()=>({getStatus:()=>membership.status});
function membershipDisplay(plan,message,retry=false){
 const label=$('membershipPlan'),detail=$('membershipMessage'),button=$('membershipRetry');
 if(label)label.textContent=plan;
 if(detail)detail.textContent=message;
 if(button)button.hidden=!retry;
}
function clearMembership(){
 entitlementRequest++;
 ++currentAuthGeneration;
 if(membershipTimer!==null){clearTimeout(membershipTimer);membershipTimer=null;}
 currentUserId=null;
 setMembership({status:'ready',plan:'free'});
 membershipDisplay('Free','Free features are available without an account.');
}
async function refreshMembership(user){
 const request=++entitlementRequest;
 const generation=currentAuthGeneration;
 currentUserId=user?.id||null;
 lastMembershipCheck=Date.now();
 if(!user?.id){clearMembership();return;}
 setMembership({status:'loading'});
 membershipDisplay('Checking…','Checking your Supabase membership. Pro features are temporarily locked.');
 try{
  if(!client)throw Error('Supabase connection is unavailable.');
  // Abort a stalled lookup instead of leaving the UI in 'Checking' indefinitely.
  const query=client.from('user_entitlements').select('plan').eq('user_id',user.id).single();
  const {data,error}=await Promise.race([
   query,
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Membership lookup timed out. Check your connection and retry.')),12000))
  ]);
  if(request!==entitlementRequest||generation!==currentAuthGeneration||user.id!==currentUserId)return;
  if(error)throw error;
  if(data?.plan!=='free'&&data?.plan!=='pro')throw Error('Membership record has an invalid plan.');
  setMembership({status:'ready',plan:data.plan});
  membershipDisplay(data.plan==='pro'?'Pro':'Free',data.plan==='pro'?'Lifetime Pro access is active.':'Your account currently has Free access.');
 }catch(e){
  if(request!==entitlementRequest||generation!==currentAuthGeneration||user.id!==currentUserId)return;
  setMembership({status:'error'});
  membershipDisplay('Unavailable','Could not verify your membership: '+readableError(e)+'. Pro remains locked until verification succeeds.',true);
 }
}
const callbackUrl=()=>{
 const here=window.location.origin;
 const allowed=(config.allowedOrigins||[]).some(origin=>{try{return new URL(origin).origin===here;}catch(_){return false;}});
 if(!allowed)throw Error('This site is not in the configured allowed redirect origins. Add its exact HTTPS origin to supabase-config.js and its redirect URL to the Supabase dashboard.');
 return here+window.location.pathname;
};
const setBusy=flag=>{busy=flag;['authSubmit','authLogout','authRecoverySubmit'].forEach(id=>{const el=$(id);if(el)el.disabled=flag;});};
const readableError=e=>{
 if(!e)return 'Something went wrong. Please try again.';
 const m=String(e.message||e);
 if(/invalid login credentials/i.test(m))return 'Email or password is incorrect, or the email has not been confirmed.';
 if(/email not confirmed/i.test(m))return 'Please confirm your email using the link we sent you.';
 if(/expired|invalid.*(token|link)|otp_expired/i.test(m))return 'This link is expired or invalid. Request a new email or password-reset link.';
 return m;
};
// Password visibility works for login, signup and recovery without changing entered values.
function initPasswordToggles(){
 document.querySelectorAll('[data-password-target]').forEach(button=>{
  const field=$(button.dataset.passwordTarget);if(!field)return;
  button.addEventListener('click',()=>{
   const reveal=field.type==='password';
   field.type=reveal?'text':'password';
   button.textContent=reveal?'Hide':'Show';
   button.setAttribute('aria-label',reveal?'Hide password':'Show password');
   button.setAttribute('aria-pressed',String(reveal));
  });
 });
}
// Clear only transient account-form values. Supabase's persisted session is untouched.
function clearAccountFields(){
 const form=$('authForm');if(form)form.reset();
 ['authInputEmail','authInputPassword','authNewPassword','authNewPasswordConfirm'].forEach(id=>{
  const field=$(id);if(field){field.value='';field.defaultValue='';field.removeAttribute('value');}
 });
 document.querySelectorAll('[data-password-target]').forEach(button=>{
  const field=$(button.dataset.passwordTarget);
  if(field)field.type='password';
  button.textContent='Show';button.setAttribute('aria-label','Show password');button.setAttribute('aria-pressed','false');
 });
}
function showView(next){
 clearAccountFields();
 view=next;recovery=false;
 $('authRecovery').hidden=true;
 $('authSignedOut').hidden=false;
 $('authSignedIn').hidden=true;
 $('authFormTitle').textContent={login:'Log In',signup:'Create Account',forgot:'Reset Your Password'}[view];
 $('authSubmit').textContent={login:'Log In',signup:'Create Account',forgot:'Send Reset Email'}[view];
 $('authPasswordGroup').hidden=view==='forgot';
 $('authInputPassword').required=view!=='forgot';
 $('authInputPassword').autocomplete=view==='signup'?'new-password':'current-password';
 $('authInputEmail').autocomplete=view==='signup'?'email':'username';
 // Start each account form with the password concealed.
 const field=$('authInputPassword'),toggle=document.querySelector('[data-password-target="authInputPassword"]');
 field.type='password';if(toggle){toggle.textContent='Show';toggle.setAttribute('aria-label','Show password');toggle.setAttribute('aria-pressed','false');}
 document.querySelectorAll('[data-auth-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.authView===view)));
}
function displaySession(session){
 if(recovery||linkError)return;
 const user=session?.user||null;
 displayedUser=user;
 authStatus=user?'signed_in':'signed_out';
 $('authSignedIn').hidden=!user;
 $('authSignedOut').hidden=!!user;
 $('authRecovery').hidden=true;
 if(user){
  $('authEmail').textContent=user.email||'Account';
  $('authVerified').textContent=user.email_confirmed_at?'Email verified':'Email confirmation pending';
  status('Signed in. Membership access is determined by Supabase.');
 }else{showView(view);status('Not signed in. Free features are available without an account.');}
}
// One signup-result dialog; only called after Supabase reports a successful signup.
let signupPriorFocus=null;
function signupPopup(needsConfirmation){
 let el=$('signupNotice');
 if(!el){
  el=document.createElement('div');el.id='signupNotice';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','signupNoticeTitle');
  el.innerHTML='<div class="signup-card" tabindex="-1"><h2 id="signupNoticeTitle"></h2><p id="signupNoticeMessage"></p><p id="signupNoticeTip" class="muted"></p><button type="button" id="signupNoticeDismiss">Got It!</button></div>';
  document.body.appendChild(el);
  $('signupNoticeDismiss').addEventListener('click',dismissSignupPopup);
  el.addEventListener('click',e=>{if(e.target===el)dismissSignupPopup();});
  el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dismissSignupPopup();}else if(e.key==='Tab'){e.preventDefault();$('signupNoticeDismiss').focus();}});
 }
 signupPriorFocus=document.activeElement;
 $('signupNoticeTitle').textContent=needsConfirmation?'Check Your Email!':'Account Created!';
 $('signupNoticeMessage').textContent=needsConfirmation?"We've sent you a confirmation email. Click the link inside to verify your email address and finish setting up your FretAttack account.":'Your account has been created. You can now use FretAttack with your new account.';
 $('signupNoticeTip').textContent=needsConfirmation?"Didn't receive it? Check your spam or junk folder.":'You can continue using FretAttack Free without purchasing Pro.';
 el.classList.add('visible');$('signupNoticeDismiss').focus();
}
function dismissSignupPopup(){
 $('signupNotice')?.classList.remove('visible');
 if(signupPriorFocus?.isConnected)signupPriorFocus.focus();
}
function enterRecovery(){
 clearAccountFields();
 recovery=true;$('authSignedIn').hidden=true;$('authSignedOut').hidden=true;$('authRecovery').hidden=false;
 status('Password recovery verified. Choose a new password below.');
}
function callbackFailure(){
 const query=new URLSearchParams(window.location.search),hash=new URLSearchParams(window.location.hash.slice(1));
 const error=query.get('error')||hash.get('error');
 if(error){
  const desc=query.get('error_description')||hash.get('error_description')||error;
  linkError=true;
  status('This confirmation or password-reset link is invalid or expired. Please request a new link from the Account screen.',true);
  history.replaceState(null,'',location.pathname);
  return true;
 }
 return false;
}
async function init(){
 initPasswordToggles();
 showView('login');
 // Account is a page in the hamburger navigation, not a modal.
 // Reset on every opening, and on leaving that page. Do not reset Supabase sessions.
 let wasOpen=$('menuAccountPage').classList.contains('active');
 document.getElementById('openAccount').addEventListener('click',()=>{
  // Never call showView() for an authenticated account: it explicitly hides
  // the signed-in panel and was causing the false 'log in again' display.
  clearAccountFields();
  if(recovery)return;
  if(displayedUser){
   displaySession({user:displayedUser});
  }else if(client){
   // Session can be restored asynchronously on first visit to Account.
   status('Checking account status…');
   $('authSignedIn').hidden=true;
   $('authSignedOut').hidden=true;
   client.auth.getSession().then(({data,error})=>{
    if(error){status('Could not check your session: '+readableError(error),true);return;}
    displaySession(data?.session||null);
   }).catch(e=>status('Could not check your session: '+readableError(e),true));
  }else{
   showView('login');
  }
 },true);
 new MutationObserver(()=>{
  const isOpen=$('menuAccountPage').classList.contains('active');
  if(wasOpen&&!isOpen)clearAccountFields();
  wasOpen=isOpen;
 }).observe($('menuAccountPage'),{attributes:true,attributeFilter:['class']});
 window.FretAttackAuthUI=Object.freeze({
  getAuthStatus:()=>authStatus,
  open:(mode='login')=>{
   document.getElementById('openAccount').click();
   if(!displayedUser&&!recovery){showView(mode==='signup'?'signup':'login');status('');}
   $('menuAccountPage').querySelector('h2')?.setAttribute('tabindex','-1');
   $('menuAccountPage').querySelector('h2')?.focus();
  }
 });
 document.querySelectorAll('[data-auth-view]').forEach(button=>button.addEventListener('click',()=>{if(displayedUser)return;showView(button.dataset.authView);status('');}));
 if(!window.supabase?.createClient){clearMembership();status('Account service could not load. Check your internet connection and reload. Free features still work.',true);return;}
 if(!/^https:\/\//.test(config.url||'')||!/^(sb_publishable_|eyJ)/.test(config.publishableKey||'')){
  clearMembership();status('Account setup is not complete. Add the Supabase Project URL and publishable key to supabase-config.js. Free features still work.',true);return;
 }
 try{callbackUrl();}catch(e){clearMembership();status(e.message,true);return;}
 client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
 // A reset link can carry a PKCE code; onAuthStateChange handles PASSWORD_RECOVERY.
 const scheduleMembership=(user)=>{
  if(membershipTimer!==null)clearTimeout(membershipTimer);
  const userId=user?.id||null;
  // Immediately enter a locked loading state for signed-in accounts.
  if(userId){setMembership({status:'loading'});membershipDisplay('Checking…','Checking membership for your signed-in account…');}
  membershipTimer=setTimeout(()=>{membershipTimer=null;refreshMembership(user);},0);
 };
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){enterRecovery();return;}
  if(event==='SIGNED_OUT'){
   if(membershipTimer!==null){clearTimeout(membershipTimer);membershipTimer=null;}
   recovery=false;clearMembership();displaySession(null);return;
  }
  if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='USER_UPDATED'){
   // Defer until the Supabase auth callback has returned; database calls inside it
   // can block on the auth client's internal lock.
   if(session?.user?.id!==currentUserId||membershipApi()?.getStatus()!=='ready')scheduleMembership(session?.user||null);
  }
  if(!recovery&&!linkError&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'))displaySession(session);
 });
 const invalid=callbackFailure();
 // onAuthStateChange emits INITIAL_SESSION when persisted auth state is ready.
 // Avoid a second simultaneous getSession + membership request on startup.
 // If initialization stalls, surface an error instead of showing Checking forever.
 setTimeout(()=>{
  if(membershipApi()?.getStatus()==='loading'&&membershipTimer===null&&currentUserId===null){
   setMembership({status:'error'});
   membershipDisplay('Unavailable','Account initialization is taking too long. Reload the page or retry membership verification.',true);
  }
 },15000);
 $('membershipRetry').addEventListener('click',async()=>{if(!client)return;++entitlementRequest;++currentAuthGeneration;setMembership({status:'loading'});membershipDisplay('Checking…','Retrying membership verification…');const {data,error}=await client.auth.getUser();if(error){setMembership({status:'error'});membershipDisplay('Unavailable','Could not check your session: '+readableError(error),true);return;}displaySession(data.user?{user:data.user}:null);await refreshMembership(data.user);});
 $('authForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!client)return;
  linkError=false;
  const email=$('authInputEmail').value.trim(),password=$('authInputPassword').value;
  setBusy(true);
  try{
   const redirect=callbackUrl();
   if(view==='signup'){
    const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirect}});
    if(error)throw error;
    if(data.session){displaySession(data.session);signupPopup(false);}
    else {status('Signup request accepted. Check your email for a confirmation link.');signupPopup(true);}
    clearAccountFields();
   }else if(view==='forgot'){
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});
    if(error)throw error;
    status('If that email belongs to an account, a password reset link will be sent. Check your inbox and spam folder.');
    clearAccountFields();
   }else{
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error)throw error;
    displaySession(data.session);
    scheduleMembership(data.user||data.session?.user||null);
   }
  }catch(e){status(readableError(e),true);}finally{setBusy(false);}
 });
 $('authLogout').addEventListener('click',async()=>{
  if(busy||!client)return;setBusy(true);
  try{const {error}=await client.auth.signOut();if(error)throw error;clearMembership();recovery=false;displaySession(null);}catch(e){status(readableError(e),true);}finally{setBusy(false);}
 });
 $('authRecoveryForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!client||!recovery)return;
  const pass=$('authNewPassword').value,confirm=$('authNewPasswordConfirm').value;
  if(pass!==confirm){status('Passwords do not match.',true);return;}
  setBusy(true);
  try{
   const {error}=await client.auth.updateUser({password:pass});if(error)throw error;
   const {error:signOutError}=await client.auth.signOut();if(signOutError)throw Error('Password updated, but signing out failed. Please sign out before logging in again.');
   clearMembership();displayedUser=null;recovery=false;showView('login');
   $('authNewPassword').value='';$('authNewPasswordConfirm').value='';
   status('Password updated. Please log in using your new password.');
   history.replaceState(null,'',location.pathname);
  }catch(e){status(readableError(e),true);}finally{setBusy(false);}
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
