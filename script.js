// ----------------------------
// script.js — Frontend completo
// ----------------------------

// ---------- CONFIG (substituir pelos seus) ----------
const SUPABASE_URL = https://auyasvkfkggoisrpbhhr.supabase.co; //
const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1eWFzdmtma2dnb2lzcnBiaGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDA3NjksImV4cCI6MjA4MDc3Njc2OX0.yOGpVb4Rmd29HX1ycHwK2RbVOwDo52BSjMHpwBKBAUk; //
const API_ORCHESTRATE = "/api/orchestrate"; //

// ---------- carregar SDK Supabase ----------
async function loadSupabase() {
  if (window.supabase_js) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.min.js';
  document.head.appendChild(s);
  await new Promise(resolve => s.onload = resolve);
}
let supabase = null;
let currentUser = null;
let personas = [];
let currentChatId = null;
let currentPersona = null;

async function initApp() {
  await loadSupabase();
  supabase = supabase_js.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  bindUI();
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) {
    currentUser = data.session.user;
    enterApp();
  } else {
    showLogin();
  }
  supabase.auth.onAuthStateChange((_, session) => {
    if (session?.user) { currentUser = session.user; enterApp(); }
    else { currentUser = null; showLogin(); }
  });
}

// ---------- UI helpers ----------
function showLogin(){ document.getElementById('login-section').classList.remove('hidden'); document.getElementById('chat-section').classList.add('hidden'); }
function enterApp(){
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('chat-section').classList.remove('hidden');
  document.getElementById('user-email').innerText = currentUser.email || '';
  loadPersonas();
  loadChats();
  createNewChatAuto();
}

// ---------- auth ----------
async function signup(){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || password.length<6) return alert('Email/ senha inválidos');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return alert('Erro: '+error.message);
  alert('Conta criada. Verifique seu e-mail.');
}
async function login(){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Preencha os campos');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return alert('Erro: '+error.message);
}
async function logout(){ await supabase.auth.signOut(); showLogin(); }

// ---------- personas ----------
async function loadPersonas(){
  // tenta do Supabase
  try {
    const { data, error } = await supabase.from('personas').select('*').limit(1000);
    if (!error && data && data.length) {
      personas = data;
      renderPersonaList();
      populateSelect();
      return;
    }
  } catch(e){ console.warn(e); }
  // fallback local
  try {
    const r = await fetch('/personas.json');
    if (r.ok) { personas = await r.json(); renderPersonaList(); populateSelect(); return; }
  } catch(e){ console.warn('no personas.json',e); }
  // default
  personas = [{id:'assistant-default',name:'Assistente Padrão', short:'Ajuda geral', system_prompt:'Você é um assistente útil em português do Brasil.'}];
  renderPersonaList(); populateSelect();
}
function renderPersonaList(filter=''){
  const list = document.getElementById('persona-list');
  list.innerHTML = '';
  const q = filter.toLowerCase();
  personas.filter(p => (p.name + ' ' + (p.short||'') + ' ' + (p.tags||'')).toLowerCase().includes(q)).slice(0,300)
    .forEach(p => {
      const el = document.createElement('div');
      el.className='persona-item';
      el.innerHTML = `<strong>${escapeHtml(p.name)}</strong><p>${escapeHtml(p.short||'')}</p>`;
      el.onclick = ()=>{ selectPersona(p.id); };
      list.appendChild(el);
    });
}
function populateSelect(){
  const sel = document.getElementById('select-persona');
  if (!sel) return;
  sel.innerHTML = '';
  personas.forEach(p => { const o = document.createElement('option'); o.value=p.id; o.innerText=p.name; sel.appendChild(o); });
}
function selectPersona(id){
  currentPersona = personas.find(x=>x.id===id) || personas[0];
  document.getElementById('chat-title').innerText = currentPersona.name || 'Conversa';
}

// ---------- chats ----------
async function loadChats(){
  if (!currentUser) return;
  const { data } = await supabase.from('chats').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:false}).limit(100);
  const box = document.getElementById('chat-list') || document.createElement('div');
  if (box) box.innerHTML = '';
  (data||[]).forEach(c => { const el = document.createElement('div'); el.className='chat-item'; el.innerText=c.title; el.onclick=()=>openChat(c.id,c.title); box.appendChild(el); });
}
async function createNewChatAuto(persona=null){
  const title = `${persona?.name || 'Conversa'} — ${new Date().toLocaleString()}`;
  const { data, error } = await supabase.from('chats').insert([{ title, user_id: currentUser.id }]).select().single();
  if (error) return console.error(error);
  currentChatId = data.id;
  document.getElementById('chat-title').innerText = title;
  document.getElementById('messages').innerHTML = '';
  await loadChats();
}

// ---------- messages ----------
async function loadMessages(){
  if (!currentChatId) return;
  const { data } = await supabase.from('messages').select('*').eq('chat_id', currentChatId).order('created_at',{ascending:true}).limit(1000);
  const box = document.getElementById('messages');
  box.innerHTML = '';
  (data||[]).forEach(m => {
    const d = document.createElement('div');
    d.className = 'message ' + (m.role==='assistant' ? 'ai':'user');
    d.innerHTML = `<div class="msg-text">${escapeHtml(m.content)}</div><div class="msg-meta">${new Date(m.created_at).toLocaleString()}</div>`;
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}
async function sendMessage(){
  const input = document.getElementById('input-text');
  const text = (input.value||'').trim();
  if (!text) return;
  if (!currentChatId) await createNewChatAuto(currentPersona);
  // append local
  appendLocalMessage(text,'user');
  // save optimistic
  try{ await supabase.from('messages').insert([{ chat_id: currentChatId, user_id: currentUser.id, persona_id: currentPersona?.id||null, role:'user', content:text }]); }catch(e){console.warn(e);}
  input.value='';
  const loadingEl = appendLocalMessage('Aguardando resposta...','ai',true);
  // call orchestrator
  const payload = { user_id: currentUser.id, persona_id: currentPersona?.id||(personas[0]&&personas[0].id), chat_id: currentChatId, message: text };
  try{
    const r = await fetch(API_ORCHESTRATE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j = await r.json();
    if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
    const reply = j.reply || 'Sem resposta';
    appendLocalMessage(reply,'ai');
    try{ await supabase.from('messages').insert([{ chat_id: currentChatId, user_id: currentUser.id, persona_id: payload.persona_id, role:'assistant', content:reply }]); }catch(e){console.warn(e);}
    await loadChats();
  }catch(err){
    console.error(err);
    if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
    appendLocalMessage('Erro na resposta.','ai');
  }
}
function appendLocalMessage(text, who='ai', isLoading=false){
  const box = document.getElementById('messages');
  const el = document.createElement('div');
  el.className = 'message ' + (who==='ai' ? 'ai':'user');
  el.innerHTML = `<div class="msg-text">${escapeHtml(text)}</div>`;
  if (isLoading) el.dataset.loading = '1';
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

// ---------- helpers ----------
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// ---------- UI bindings ----------
function bindUI(){
  document.getElementById('btn-signup').onclick = signup;
  document.getElementById('btn-login').onclick = login;
  document.getElementById('btn-logout').onclick = logout;
  const send = document.getElementById('btn-send'); if (send) send.onclick = sendMessage;
  const newChat = document.getElementById('btn-new-chat'); if (newChat) newChat.onclick = ()=>createNewChatAuto(currentPersona);
  const search = document.getElementById('search-persona'); if (search) search.oninput = (e)=>renderPersonaList(e.target.value);
  const sel = document.getElementById('select-persona'); if (sel) sel.onchange = (e)=>selectPersona(e.target.value);
  const installBtn = document.getElementById('btn-install'); if (installBtn) installBtn.onclick = promptInstall;
  // enter to send when not shift
  const input = document.getElementById('input-text'); if (input) input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }});
}

// ---------- PWA install prompt ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; const b = document.getElementById('btn-install'); if (b) b.style.display='inline-block'; });
async function promptInstall(){ if (!deferredPrompt) return alert('Instalação não disponível'); deferredPrompt.prompt(); const choice = await deferredPrompt.userChoice; deferredPrompt = null; }

// ---------- start ----------
initApp();
