/** VFeria API v1 — Google Apps Script + Google Sheets + Cloudflare R2 Worker
 * Deploy as Web App: Execute as Me; access Anyone. Protect credentials and use HTTPS.
 * Run setupVferia() once, then set Script Properties before production.
 */
const VF = {
  SHEETS: {
    Users: ['userId','username','passwordSalt','passwordHash','businessId','role','active','createdAt','lastLoginAt'],
    Businesses: ['businessId','ownerUserId','fullName','email','phone','city','businessName','category','businessDescription','businessWeb','logoKey','logoUrl','updatedAt','published'],
    Products: ['productId','businessId','name','price','link','social','description','imageKey','imageUrl','published','createdAt','updatedAt'],
    Sessions: ['tokenHash','userId','businessId','role','createdAt','expiresAt','revoked'],
    Audit: ['at','actorUserId','action','businessId','details']
  },
  SESSION_HOURS: 12,
  MAX_PRODUCTS: 30,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024
};

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || 'health');
  if (action === 'health') return json_({ok:true, service:'VFeria API', version:1});
  if (action === 'publicStore') return json_(publicStore_(String(e.parameter.businessId || '')));
  return json_({ok:false,error:'GET_ACTION_NOT_ALLOWED'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    switch (action) {
      case 'login': return json_(login_(body));
      case 'logout': return json_(logout_(body));
      case 'me': return json_(me_(body));
      case 'getProfile': return json_(getProfile_(body));
      case 'saveProfile': return json_(saveProfile_(body));
      case 'listProducts': return json_(listProducts_(body));
      case 'saveProduct': return json_(saveProduct_(body));
      case 'deleteProduct': return json_(deleteProduct_(body));
      case 'setProductPublished': return json_(setProductPublished_(body));
      case 'uploadImage': return json_(uploadImage_(body));
      default: return json_({ok:false,error:'UNKNOWN_ACTION'});
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ok:false,error:'SERVER_ERROR',message:'No se pudo completar la operación.'});
  }
}

/** Run once from Apps Script editor. Creates the tables in the active spreadsheet. */
function setupVferia() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre Apps Script desde Extensiones > Apps Script dentro de la hoja de cálculo VFeria.');
  Object.keys(VF.SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = VF.SHEETS[name];
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
  });
  PropertiesService.getScriptProperties().setProperty('VF_SPREADSHEET_ID', ss.getId());
  return 'Hojas creadas y Spreadsheet ID configurado: ' + ss.getId();
}

/** Run manually to create the first admin. Change these values before running. */
function createInitialAdmin() {
  const username = 'CAMBIAR_ADMIN';
  const password = 'CAMBIAR_POR_UNA_CLAVE_LARGA_Y_UNICA';
  if (username === 'CAMBIAR_ADMIN' || password.indexOf('CAMBIAR_') === 0 || password.length < 14) {
    throw new Error('Edita username y password en createInitialAdmin() con valores únicos antes de ejecutar.');
  }
  return createUser_(username, password, 'admin', '', true);
}

/** Admin-only helper run from editor to create entrepreneur accounts. Edit arguments then Run. */
function createEntrepreneurAccount() {
  const username = 'CAMBIAR_USUARIO';
  const password = 'CAMBIAR_POR_UNA_CLAVE_LARGA_Y_UNICA';
  const businessName = 'CAMBIAR_NOMBRE_NEGOCIO';
  if (username.indexOf('CAMBIAR_') === 0 || businessName.indexOf('CAMBIAR_') === 0 || password.indexOf('CAMBIAR_') === 0 || password.length < 14) {
    throw new Error('Edita usuario, contraseña y nombre comercial antes de ejecutar.');
  }
  const user = createUser_(username, password, 'entrepreneur', Utilities.getUuid(), true);
  const ss = db_();
  const sh = ss.getSheetByName('Businesses');
  sh.appendRow([user.businessId,user.userId,'','','','',businessName,'','','','','',new Date().toISOString(),false]);
  return {username:user.username,businessId:user.businessId};
}

function createUser_(username, password, role, businessId, active) {
  username = normalizeUsername_(username);
  if (!username || username.length < 3 || password.length < 14) throw new Error('Usuario mínimo 3 caracteres; contraseña mínimo 14 caracteres.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = db_().getSheetByName('Users');
    if (findRow_(sh, 'username', username)) throw new Error('Ese usuario ya existe.');
    const userId = Utilities.getUuid();
    const salt = randomToken_();
    const hash = passwordHash_(password, salt);
    sh.appendRow([userId,username,salt,hash,businessId,role,!!active,new Date().toISOString(),'']);
    audit_(userId,'createUser',businessId,'role='+role);
    return {userId:userId,username:username,businessId:businessId,role:role};
  } finally { lock.releaseLock(); }
}

function login_(body) {
  const username = normalizeUsername_(String(body.username || ''));
  const password = String(body.password || '');
  if (!username || !password) return fail_('INVALID_CREDENTIALS');
  const sh = db_().getSheetByName('Users');
  const row = findRow_(sh, 'username', username);
  if (!row) { Utilities.sleep(300); return fail_('INVALID_CREDENTIALS'); }
  const u = rowObject_(sh,row);
  if (String(u.active).toLowerCase() !== 'true' && u.active !== true) return fail_('ACCOUNT_DISABLED');
  if (!constantTimeEqual_(passwordHash_(password, u.passwordSalt), u.passwordHash)) { Utilities.sleep(300); return fail_('INVALID_CREDENTIALS'); }
  const token = randomToken_();
  const now = Date.now(), expires = now + VF.SESSION_HOURS*60*60*1000;
  db_().getSheetByName('Sessions').appendRow([sha256_(token),u.userId,u.businessId,u.role,new Date(now).toISOString(),new Date(expires).toISOString(),false]);
  sh.getRange(row,9).setValue(new Date(now).toISOString());
  audit_(u.userId,'login',u.businessId,'');
  return {ok:true,token:token,expiresAt:new Date(expires).toISOString(),user:{userId:u.userId,username:u.username,role:u.role,businessId:u.businessId}};
}
function logout_(body) { const s = session_(body.token); if (!s) return {ok:true}; const sh=db_().getSheetByName('Sessions'); sh.getRange(s.row,7).setValue(true); return {ok:true}; }
function me_(body) { const s=session_(body.token); return s ? {ok:true,user:{userId:s.userId,username:s.username,role:s.role,businessId:s.businessId},expiresAt:s.expiresAt} : fail_('SESSION_EXPIRED'); }
function getProfile_(body) { const s=requireSession_(body); const sh=db_().getSheetByName('Businesses'); const row=findRow_(sh,'businessId',s.businessId); return row ? {ok:true,profile:rowObject_(sh,row)} : {ok:true,profile:{businessId:s.businessId}}; }
function saveProfile_(body) {
  const s=requireSession_(body), p=body.profile||{};
  const allowed=['fullName','email','phone','city','businessName','category','businessDescription','businessWeb','logoKey','logoUrl'];
  const sh=db_().getSheetByName('Businesses'); let row=findRow_(sh,'businessId',s.businessId);
  if (!row) { sh.appendRow([s.businessId,s.userId,'','','','','','','','','','',new Date().toISOString(),false]); row=sh.getLastRow(); }
  const current=rowObject_(sh,row);
  allowed.forEach(k=>{ if (Object.prototype.hasOwnProperty.call(p,k)) current[k]=String(p[k] == null ? '' : p[k]).slice(0, k==='businessDescription'?3000:1000); });
  current.updatedAt=new Date().toISOString();
  writeObject_(sh,row,current); audit_(s.userId,'saveProfile',s.businessId,'');
  return {ok:true,profile:current};
}
function listProducts_(body) { const s=requireSession_(body); const sh=db_().getSheetByName('Products'); return {ok:true,products:rowsObjects_(sh).filter(p=>p.businessId===s.businessId)}; }
function saveProduct_(body) {
  const s=requireSession_(body), p=body.product||{}, sh=db_().getSheetByName('Products');
  const productId=String(p.productId||''); let row=productId?findRow_(sh,'productId',productId):0;
  if (row) { const old=rowObject_(sh,row); if(old.businessId!==s.businessId) throw new Error('FORBIDDEN'); }
  else { const own=rowsObjects_(sh).filter(x=>x.businessId===s.businessId); if(own.length>=VF.MAX_PRODUCTS) return {ok:false,error:'PRODUCT_LIMIT',message:'Cada negocio puede tener hasta 30 productos.'}; row=0; }
  const name=String(p.name||'').trim(); const price=Number(p.price);
  if(!name) return {ok:false,error:'VALIDATION',message:'El nombre del producto es obligatorio.'};
  if(!Number.isFinite(price)||price<0) return {ok:false,error:'VALIDATION',message:'El precio no es válido.'};
  const obj={productId:productId||Utilities.getUuid(),businessId:s.businessId,name:name.slice(0,160),price:price,link:safeHttpUrl_(p.link),social:safeHttpUrl_(p.social),description:String(p.description||'').slice(0,3000),imageKey:String(p.imageKey||''),imageUrl:String(p.imageUrl||''),published:!!p.published,createdAt:row?rowObject_(sh,row).createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(row) writeObject_(sh,row,obj); else { sh.appendRow(VF.SHEETS.Products.map(k=>obj[k]===undefined?'':obj[k])); row=sh.getLastRow(); }
  audit_(s.userId,'saveProduct',s.businessId,obj.productId); return {ok:true,product:obj};
}
function deleteProduct_(body) { const s=requireSession_(body), id=String(body.productId||''), sh=db_().getSheetByName('Products'), row=findRow_(sh,'productId',id); if(!row)return {ok:true}; const p=rowObject_(sh,row); if(p.businessId!==s.businessId) throw new Error('FORBIDDEN'); sh.deleteRow(row); audit_(s.userId,'deleteProduct',s.businessId,id); return {ok:true}; }
function setProductPublished_(body) { const s=requireSession_(body), sh=db_().getSheetByName('Products'), row=findRow_(sh,'productId',String(body.productId||'')); if(!row)return fail_('NOT_FOUND'); const p=rowObject_(sh,row); if(p.businessId!==s.businessId && s.role!=='admin')throw new Error('FORBIDDEN'); p.published=!!body.published; p.updatedAt=new Date().toISOString(); writeObject_(sh,row,p); return {ok:true,product:p}; }
function publicStore_(businessId) { if(!businessId)return fail_('BUSINESS_ID_REQUIRED'); const ss=db_(), bs=ss.getSheetByName('Businesses'), br=findRow_(bs,'businessId',businessId); if(!br)return fail_('NOT_FOUND'); const b=rowObject_(bs,br); if(String(b.published).toLowerCase()!=='true'&&b.published!==true)return fail_('NOT_PUBLISHED'); const products=rowsObjects_(ss.getSheetByName('Products')).filter(p=>p.businessId===businessId&&(String(p.published).toLowerCase()==='true'||p.published===true)); return {ok:true,profile:b,products:products}; }

/** Upload image through private Worker endpoint. Worker secrets are kept in Script Properties, never sent to browser. */
function uploadImage_(body) {
  const s=requireSession_(body), data=String(body.base64||''), kind=body.kind==='logo'?'logo':'product';
  const match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match) return fail_('INVALID_IMAGE');
  const bytes=Utilities.base64Decode(match[2]); if(bytes.length>VF.MAX_IMAGE_BYTES)return {ok:false,error:'IMAGE_TOO_LARGE',message:'La imagen procesada debe pesar 2 MB o menos.'};
  const props=PropertiesService.getScriptProperties(), endpoint=props.getProperty('R2_WORKER_URL'), secret=props.getProperty('R2_WORKER_SECRET');
  if(!endpoint||!secret) return {ok:false,error:'R2_NOT_CONFIGURED',message:'Falta configurar el Worker de imágenes en Apps Script.'};
  const key=s.businessId+'/'+kind+'/'+Utilities.getUuid()+'.'+(match[1]==='image/png'?'png':match[1]==='image/webp'?'webp':'jpg');
  const payload={key:key,contentType:match[1],base64:match[2]};
  const response=UrlFetchApp.fetch(endpoint.replace(/\/$/,'')+'/upload',{method:'post',contentType:'application/json',headers:{'X-VFeria-Secret':secret},payload:JSON.stringify(payload),muteHttpExceptions:true});
  const result=JSON.parse(response.getContentText()||'{}'); if(response.getResponseCode()<200||response.getResponseCode()>=300||!result.ok)return {ok:false,error:'R2_UPLOAD_FAILED',message:'No se pudo almacenar la imagen.'};
  audit_(s.userId,'uploadImage',s.businessId,kind); return {ok:true,key:key,url:result.url};
}

function requireSession_(body) { const s=session_(body && body.token); if(!s) throw new Error('SESSION_EXPIRED'); return s; }
function session_(token) {
  if(!token)return null; const sh=db_().getSheetByName('Sessions'), hash=sha256_(String(token)); const row=findRow_(sh,'tokenHash',hash); if(!row)return null;
  const o=rowObject_(sh,row); if(o.revoked===true||String(o.revoked).toLowerCase()==='true'||Date.parse(o.expiresAt)<=Date.now())return null;
  const us=db_().getSheetByName('Users'), ur=findRow_(us,'userId',o.userId); if(!ur)return null; const u=rowObject_(us,ur); if(String(u.active).toLowerCase()!=='true'&&u.active!==true)return null;
  return {row:row,userId:o.userId,businessId:o.businessId,role:o.role,expiresAt:o.expiresAt,username:u.username};
}
function db_(){ const id=PropertiesService.getScriptProperties().getProperty('VF_SPREADSHEET_ID'); if(!id)throw new Error('Ejecuta setupVferia() primero.'); return SpreadsheetApp.openById(id); }
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function fail_(error){ return {ok:false,error:error}; }
function normalizeUsername_(v){ return String(v||'').trim().toLowerCase().replace(/\s+/g,''); }
function randomToken_(){ return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''); }
function sha256_(s){ return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8)).replace(/=+$/,''); }
function passwordHash_(password,salt){ let v=String(salt)+'|'+String(password); for(let i=0;i<12000;i++)v=sha256_(v); return v; }
function constantTimeEqual_(a,b){ a=String(a);b=String(b);let d=a.length^b.length;const n=Math.max(a.length,b.length);for(let i=0;i<n;i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0; }
function safeHttpUrl_(v){ v=String(v||'').trim(); return /^https?:\/\//i.test(v)&&v.length<1500?v:''; }
function findRow_(sh,header,value){ const vals=sh.getDataRange().getValues(); if(vals.length<2)return 0; const idx=vals[0].indexOf(header); if(idx<0)return 0; for(let i=1;i<vals.length;i++)if(String(vals[i][idx])===String(value))return i+1; return 0; }
function rowObject_(sh,row){ const vals=sh.getRange(row,1,1,sh.getLastColumn()).getValues()[0], headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0], o={}; headers.forEach((h,i)=>o[h]=vals[i]); return o; }
function rowsObjects_(sh){ const v=sh.getDataRange().getValues(); if(v.length<2)return []; return v.slice(1).filter(r=>r.some(c=>c!==''&&c!==null)).map(r=>{const o={};v[0].forEach((h,i)=>o[h]=r[i]);return o;}); }
function writeObject_(sh,row,obj){ const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; sh.getRange(row,1,1,headers.length).setValues([headers.map(h=>obj[h]===undefined?'':obj[h])]); }
function audit_(userId,action,businessId,details){ const sh=db_().getSheetByName('Audit'); if(sh)sh.appendRow([new Date().toISOString(),userId,action,businessId,String(details||'').slice(0,500)]); }
