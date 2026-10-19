/* FretAttack Supabase Auth v1: accounts are optional and never grant Pro. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const config=window.FRETATTACK_SUPABASE_CONFIG||{};
let entitlementRequest=0;
let currentUserId=null, membershipTimer=null;
let client=null, view='login', recovery=false, busy=false, linkError=false;
const status=(message,error=false)=>{const el=$('authStatus');el.textContent=message;el.style.color=error?'#ffb7b7':'';};
// Supabase is the only source of membership. Never trust localStorage or developer switches.
const membershipApi=()=>window.FretAttackMembership;
function membershipDisplay(plan,message,retry=false){
 const label=$('membershipPlan'),detail=$('membershipMessage'),button=$('membershipRetry');
 if(label)label.textContent=plan;
 if(detail)detail.textContent=message;
 if(button)button.hidden=!retry;
}
function clearMembership(){
 entitlementRequest++;
 currentUserId=null;
 membershipApi()?.setMembership({status:'ready',plan:'free'});
 membershipDisplay('Free','Free features are available without an account.');
}
async function refreshMembership(user){
 const request=++entitlementRequest;
 currentUserId=user?.id||null;
 if(!user?.id){clearMembership();return;}
 membershipApi()?.setMembership({status:'loading'});
 membershipDisplay('Checking…','Checking your Supabase membership. Pro features are temporarily locked.');
 try{
  if(!client)throw Error('Supabase connection is unavailable.');
  // Abort a stalled lookup instead of leaving the UI in 'Checking' indefinitely.
  const query=client.from('user_entitlements').select('plan').eq('user_id',user.id).single();
  const {data,error}=await Promise.race([
   query,
   new Promise((_,reject)=>setTimeout(()=>reject(Error('Membership lookup timed out. Check your connection and retry.')),12000))
  ]);
  if(request!==entitlementRequest)return;
  if(error)throw error;
  if(data?.plan!=='free'&&data?.plan!=='pro')throw Error('Membership record has an invalid plan.');
  membershipApi()?.setMembership({status:'ready',plan:data.plan});
  membershipDisplay(data.plan==='pro'?'Pro':'Free',data.plan==='pro'?'Lifetime Pro access is active.':'Your account currently has Free access.');
 }catch(e){
  if(request!==entitlementRequest)return;
  membershipApi()?.setMembership({status:'error'});
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
 const user=session?.user;
 $('authSignedIn').hidden=!user;
 $('authSignedOut').hidden=!!user;
 $('authRecovery').hidden=true;
 if(user){
  $('authEmail').textContent=user.email||'Account';
  $('authVerified').textContent=user.email_confirmed_at?'Email verified':'Email confirmation pending';
  status('Signed in. Membership access is determined by Supabase.');
 }else{showView(view);status('Not signed in. Free features are available without an account.');}
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
  status('Authentication link could not be used: '+desc+'. Request a new link.',true);
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
  if(!recovery){showView('login');status('');}
  else clearAccountFields();
 },true);
 new MutationObserver(()=>{
  const isOpen=$('menuAccountPage').classList.contains('active');
  if(wasOpen&&!isOpen)clearAccountFields();
  wasOpen=isOpen;
 }).observe($('menuAccountPage'),{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('[data-auth-view]').forEach(button=>button.addEventListener('click',()=>{showView(button.dataset.authView);status('');}));
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
  if(userId){membershipApi()?.setMembership({status:'loading'});membershipDisplay('Checking…','Checking membership for your signed-in account…');}
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
   membershipApi()?.setMembership({status:'error'});
   membershipDisplay('Unavailable','Account initialization is taking too long. Reload the page or retry membership verification.',true);
  }
 },15000);
 $('membershipRetry').addEventListener('click',async()=>{if(!client)return;membershipDisplay('Checking…','Retrying membership verification…');const {data,error}=await client.auth.getUser();if(error){membershipApi()?.setMembership({status:'error'});membershipDisplay('Unavailable','Could not check your session: '+readableError(error),true);return;}displaySession(data.user?{user:data.user}:null);await refreshMembership(data.user);});
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
    if(data.session)displaySession(data.session);
    else status('Check your inbox for a confirmation email. Open the link to verify your account. If an account already exists, you may not receive a new registration email.');
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
  try{const {error}=await client.auth.signOut();if(error)throw error;recovery=false;displaySession(null);}catch(e){status(readableError(e),true);}finally{setBusy(false);}
 });
 $('authRecoveryForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!client||!recovery)return;
  const pass=$('authNewPassword').value,confirm=$('authNewPasswordConfirm').value;
  if(pass!==confirm){status('Passwords do not match.',true);return;}
  setBusy(true);
  try{
   const {error}=await client.auth.updateUser({password:pass});if(error)throw error;
   await client.auth.signOut();recovery=false;showView('login');
   $('authNewPassword').value='';$('authNewPasswordConfirm').value='';
   status('Password updated. Please log in using your new password.');
   history.replaceState(null,'',location.pathname);
  }catch(e){status(readableError(e),true);}finally{setBusy(false);}
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
