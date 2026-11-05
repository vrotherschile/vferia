/**
 * VFeria API v1 — Google Apps Script + Google Sheets + Cloudflare R2 Worker
 * Web App deployment: Execute as Me; access Anyone (the API validates its own sessions).
 * Run setupVferia() once. Configure Script Properties before production:
 *   VF_SPREADSHEET_ID (created by setupVferia)
 *   R2_WORKER_URL = https://vferia-image-worker.vrotherservices.workers.dev
 *   R2_WORKER_SECRET = same value as Worker secret VFERIA_SECRET
 *   ADMIN_INITIAL_USERNAME and ADMIN_INITIAL_PASSWORD only when creating first admin.
 */
const VF = {
  SHEETS: {
    Users: ['userId','username','passwordSalt','passwordHash','businessId','role','active','createdAt','lastLoginAt'],
    Businesses: ['businessId','ownerUserId','fullName','email','phone','city','businessName','category','businessDescription','businessWeb','businessInstagram','businessFacebook','businessVideoUrl','logoKey','logoUrl','couponImageKey','couponImageUrl','couponEnabled','updatedAt','published'],
    Products: ['productId','businessId','name','price','link','social','description','imageKey','imageUrl','published','createdAt','updatedAt','stock','paymentLink','type','featured'],
    Sessions: ['tokenHash','userId','businessId','role','createdAt','expiresAt','revoked'],
    Audit: ['at','actorUserId','action','businessId','details'],
    AnalyticsEvents: ['eventId','timestamp','date','month','eventType','businessId','productId','sessionId'],
    AnalyticsDaily: ['date','pageViews','businessViews','productViews','totalViews'],
    AnalyticsEntities: ['entityType','entityId','entityName','businessId','views','updatedAt']
  },
  SESSION_HOURS: 12,
  MAX_PRODUCTS: 30,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
  MAX_USERNAME_LENGTH: 60,
  WORKER_DEFAULT_URL: 'https://vferia-image-worker.vrotherservices.workers.dev'
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || 'health');
  if (action === 'health') return json_({ok:true, service:'VFeria API', version:1});
  if (action === 'publicStore') return json_(publicStore_(String(params.businessId || '')));
  if (action === 'publicCatalog') return json_(publicCatalog_());
  if (action === 'getPublicAnalytics') return json_(getPublicAnalytics_());
  if (action === 'getSiteConfig') return json_(getSiteConfig_());
  if (action === 'getFeaturedContent') return json_(getFeaturedContent_());
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
      case 'setBusinessPublished': return json_(setBusinessPublished_(body));
      case 'changePassword': return json_(changePassword_(body));
      case 'adminListEntrepreneurs': return json_(adminListEntrepreneurs_(body));
      case 'adminResetPassword': return json_(adminResetPassword_(body));
      case 'adminSetUserActive': return json_(adminSetUserActive_(body));
      case 'adminGetBusinessPreview': return json_(adminGetBusinessPreview_(body));
      case 'getFeaturedContent': return json_(getFeaturedContent_());
      case 'getSiteConfig': return json_(getSiteConfig_());
      case 'saveSiteConfig': return json_(saveSiteConfig_(body));
      case 'uploadImage': return json_(uploadImage_(body));
      case 'adminCreateEntrepreneur': return json_(adminCreateEntrepreneur_(body));
      case 'trackVisit': return json_(trackVisit_(body));
      case 'getAdminAnalytics': return json_(getAdminAnalytics_(body));
      default: return json_({ok:false,error:'UNKNOWN_ACTION'});
    }
  } catch (err) {
    console.error(err && err.stack || err);
    const message = String(err && err.message || '');
    if (message === 'SESSION_EXPIRED') return json_({ok:false,error:'SESSION_EXPIRED'});
    if (message === 'FORBIDDEN') return json_({ok:false,error:'FORBIDDEN'});
    return json_({ok:false,error:'SERVER_ERROR',message:'No se pudo completar la operación.'});
  }
}

/** Run once from the spreadsheet-bound Apps Script project. Creates missing sheets/headers. */
function setupVferia() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre Apps Script desde Extensiones > Apps Script dentro de la hoja de cálculo VFeria.');
  Object.keys(VF.SHEETS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = VF.SHEETS[name];
    const existing = sh.getLastRow() ? sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0] : [];
    // Do not overwrite existing headers/data. Populate only an empty sheet's header row.
    if (!existing.length || existing.every(function(v){ return v === '' || v === null; })) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    } else {
      const actual = existing.slice(0, headers.length).map(String);
      if (headers.some(function(h,i){ return actual[i] !== h; })) {
        throw new Error('Los encabezados de la hoja ' + name + ' no coinciden con VFeria. No se modificaron para proteger los datos existentes.');
      }
    }
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
  });
  PropertiesService.getScriptProperties().setProperty('VF_SPREADSHEET_ID', ss.getId());
  return 'Hojas verificadas y Spreadsheet ID configurado: ' + ss.getId();
}

/**
 * Migración segura de inventario: ejecuta UNA VEZ desde el editor de Apps Script.
 * Añade la columna stock al final de Products sin mover ni sobrescribir columnas existentes.
 * Los productos existentes quedan con stock 0 para que el emprendedor confirme las existencias.
 */
function migrateProductsStockColumn() {
  const sh = db_().getSheetByName('Products');
  if (!sh) throw new Error('No existe la hoja Products.');
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let idx = headers.indexOf('stock');

  if (idx === -1) {
    idx = lastCol;
    sh.getRange(1, idx + 1).setValue('stock');
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      sh.getRange(2, idx + 1, lastRow - 1, 1).setValues(
        Array.from({length: lastRow - 1}, function(){ return [0]; })
      );
    }
  } else {
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const range = sh.getRange(2, idx + 1, lastRow - 1, 1);
      const values = range.getValues().map(function(row){
        return [row[0] === '' || row[0] === null ? 0 : row[0]];
      });
      range.setValues(values);
    }
  }

  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
  return 'Migración completada: columna stock verificada en Products.';
}

/** One-time first-admin creation. Set ADMIN_INITIAL_USERNAME and ADMIN_INITIAL_PASSWORD in Script Properties first. */
function createInitialAdmin() {
  const props = PropertiesService.getScriptProperties();
  const username = String(props.getProperty('ADMIN_INITIAL_USERNAME') || '').trim();
  const password = String(props.getProperty('ADMIN_INITIAL_PASSWORD') || '');
  if (username.length < 3 || username.length > VF.MAX_USERNAME_LENGTH || password.length < 14 || username.indexOf('CAMBIAR_') === 0) {
    throw new Error('Configura ADMIN_INITIAL_USERNAME y ADMIN_INITIAL_PASSWORD en Propiedades del script. La contraseña debe tener al menos 14 caracteres.');
  }
  const result = createUser_(username, password, 'admin', '', true);
  // Remove the initial password from project properties immediately after successful creation.
  props.deleteProperty('ADMIN_INITIAL_PASSWORD');
  props.deleteProperty('ADMIN_INITIAL_USERNAME');
  return {userId:result.userId, username:result.username, role:'admin', message:'Administrador creado. Guarda las credenciales de forma segura.'};
}

/** Optional manual helper. Edit these placeholders only when intentionally creating an account from the editor. */
function createEntrepreneurAccount() {
  const username = 'CAMBIAR_USUARIO';
  const password = 'CAMBIAR_POR_UNA_CLAVE_LARGA_Y_UNICA';
  const businessName = 'CAMBIAR_NOMBRE_NEGOCIO';
  if (username.indexOf('CAMBIAR_') === 0 || businessName.indexOf('CAMBIAR_') === 0 || password.indexOf('CAMBIAR_') === 0 || password.length < 14) {
    throw new Error('Edita usuario, contraseña y nombre comercial antes de ejecutar.');
  }
  const businessId = Utilities.getUuid();
  const user = createUser_(username, password, 'entrepreneur', businessId, true);
  const sh = db_().getSheetByName('Businesses');
  sh.appendRow([businessId,user.userId,'','','','',businessName,'','','','','',new Date().toISOString(),false]);
  return {username:user.username,businessId:businessId};
}

function createUser_(username, password, role, businessId, active) {
  username = normalizeUsername_(username);
  role = String(role || '').toLowerCase();
  if (!username || username.length < 3 || username.length > VF.MAX_USERNAME_LENGTH || String(password || '').length < 14) {
    throw new Error('Usuario de 3 a 60 caracteres; contraseña mínimo 14 caracteres.');
  }
  if (['admin','entrepreneur'].indexOf(role) === -1) throw new Error('Rol no permitido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = db_().getSheetByName('Users');
    if (!sh) throw new Error('SHEET_USERS_MISSING');
    if (findRow_(sh, 'username', username)) throw new Error('Ese usuario ya existe.');
    const userId = Utilities.getUuid();
    const salt = randomToken_();
    const hash = passwordHash_(password, salt);
    sh.appendRow([userId,username,salt,hash,String(businessId || ''),role,!!active,new Date().toISOString(),'']);
    audit_(userId,'createUser',businessId,'role='+role);
    return {userId:userId,username:username,businessId:String(businessId || ''),role:role};
  } finally {
    lock.releaseLock();
  }
}

function login_(body) {
  const username = normalizeUsername_(String(body.username || ''));
  const password = String(body.password || '');
  if (!username || !password) return fail_('INVALID_CREDENTIALS');
  const sh = db_().getSheetByName('Users');
  const row = findRow_(sh, 'username', username);
  if (!row) { Utilities.sleep(300); return fail_('INVALID_CREDENTIALS'); }
  const u = rowObject_(sh,row);
  if (!isTrue_(u.active)) return fail_('ACCOUNT_DISABLED');
  if (!constantTimeEqual_(passwordHash_(password, u.passwordSalt), u.passwordHash)) {
    Utilities.sleep(300);
    return fail_('INVALID_CREDENTIALS');
  }
  const token = randomToken_();
  const now = Date.now();
  const expires = now + VF.SESSION_HOURS * 60 * 60 * 1000;
  db_().getSheetByName('Sessions').appendRow([sha256_(token),u.userId,u.businessId,u.role,new Date(now).toISOString(),new Date(expires).toISOString(),false]);
  sh.getRange(row,9).setValue(new Date(now).toISOString());
  audit_(u.userId,'login',u.businessId,'');
  return {ok:true,token:token,expiresAt:new Date(expires).toISOString(),user:{userId:u.userId,username:u.username,role:u.role,businessId:u.businessId}};
}

function logout_(body) {
  const s = session_(body && body.token);
  if (!s) return {ok:true};
  db_().getSheetByName('Sessions').getRange(s.row,7).setValue(true);
  audit_(s.userId,'logout',s.businessId,'');
  return {ok:true};
}
function me_(body) {
  const s = session_(body && body.token);
  return s ? {ok:true,user:{userId:s.userId,username:s.username,role:s.role,businessId:s.businessId},expiresAt:s.expiresAt} : fail_('SESSION_EXPIRED');
}

function getProfile_(body) {
  const s = requireEntrepreneurSession_(body);
  const sh = db_().getSheetByName('Businesses');
  const row = findRow_(sh,'businessId',s.businessId);
  if (!row) return {ok:true,profile:{businessId:s.businessId}};
  const profile = rowObject_(sh,row);
  if (String(profile.ownerUserId) !== String(s.userId)) throw new Error('FORBIDDEN');
  return {ok:true,profile:profile};
}

function saveProfile_(body) {
  const s = requireEntrepreneurSession_(body);
  const p = body.profile || {};
  const allowed = ['fullName','email','phone','city','businessName','category','businessDescription','businessWeb','businessInstagram','businessFacebook','businessVideoUrl','couponEnabled'];
  const sh = db_().getSheetByName('Businesses');
  let row = findRow_(sh,'businessId',s.businessId);
  if (!row) {
    const initial={businessId:s.businessId,ownerUserId:s.userId,fullName:'',email:'',phone:'',city:'',businessName:'',category:'',businessDescription:'',businessWeb:'',businessInstagram:'',businessFacebook:'',businessVideoUrl:'',logoKey:'',logoUrl:'',couponImageKey:'',couponImageUrl:'',couponEnabled:false,updatedAt:new Date().toISOString(),published:false};
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    sh.appendRow(headers.map(function(h){return initial[h]===undefined?'':initial[h];}));
    row = sh.getLastRow();
  }
  const current = rowObject_(sh,row);
  if (String(current.ownerUserId) !== String(s.userId)) throw new Error('FORBIDDEN');
  allowed.forEach(function(k) {
    if (Object.prototype.hasOwnProperty.call(p,k)) {
      const max = k === 'businessDescription' ? 3000 : (k === 'email' ? 254 : (k === 'phone' ? 50 : 1000));
      current[k] = String(p[k] == null ? '' : p[k]).trim().slice(0,max);
    }
  });
  if (Object.prototype.hasOwnProperty.call(p,'logoKey') || Object.prototype.hasOwnProperty.call(p,'logoUrl')) {
    const key = Object.prototype.hasOwnProperty.call(p,'logoKey') ? String(p.logoKey || '') : String(current.logoKey || '');
    const imageUrl = Object.prototype.hasOwnProperty.call(p,'logoUrl') ? String(p.logoUrl || '') : String(current.logoUrl || '');
    if (!key && !imageUrl) {
      current.logoKey = '';
      current.logoUrl = '';
    } else {
      validateOwnedImage_(key,imageUrl,s.businessId,'logo');
      current.logoKey = key;
      current.logoUrl = imageUrl;
    }
  }
  if (Object.prototype.hasOwnProperty.call(p,'couponImageKey') || Object.prototype.hasOwnProperty.call(p,'couponImageUrl')) {
    const key = Object.prototype.hasOwnProperty.call(p,'couponImageKey') ? String(p.couponImageKey || '') : String(current.couponImageKey || '');
    const imageUrl = Object.prototype.hasOwnProperty.call(p,'couponImageUrl') ? String(p.couponImageUrl || '') : String(current.couponImageUrl || '');
    if (!key && !imageUrl) { current.couponImageKey=''; current.couponImageUrl=''; }
    else { validateOwnedImage_(key,imageUrl,s.businessId,'coupon'); current.couponImageKey=key; current.couponImageUrl=imageUrl; }
  }
  current.updatedAt = new Date().toISOString();
  writeObject_(sh,row,current);
  audit_(s.userId,'saveProfile',s.businessId,'');
  return {ok:true,profile:current};
}

function listProducts_(body) {
  const s = requireEntrepreneurSession_(body);
  const sh = db_().getSheetByName('Products');
  const products = rowsObjects_(sh).filter(function(p){ return String(p.businessId) === String(s.businessId); });
  products.forEach(function(p){
    p.stock = p.stock === '' || p.stock === null || p.stock === undefined ? 0 : Number(p.stock);
    if (!Number.isInteger(p.stock) || p.stock < 0) p.stock = 0;
  });
  return {ok:true,products:products};
}

function saveProduct_(body) {
  const s = requireEntrepreneurSession_(body);
  const p = body.product || {};
  const sh = db_().getSheetByName('Products');
  const productId = String(p.productId || '');
  let row = productId ? findRow_(sh,'productId',productId) : 0;
  let old = null;
  if (row) {
    old = rowObject_(sh,row);
    if (String(old.businessId) !== String(s.businessId)) throw new Error('FORBIDDEN');
  } else {
    const own = rowsObjects_(sh).filter(function(x){ return String(x.businessId) === String(s.businessId); });
    if (own.length >= VF.MAX_PRODUCTS) return {ok:false,error:'PRODUCT_LIMIT',message:'Cada negocio puede tener hasta 30 productos.'};
  }
  const name = String(p.name || '').trim();
  const price = Number(p.price);
  if (!name || name.length > 160) return {ok:false,error:'VALIDATION',message:'El nombre del producto es obligatorio y debe tener hasta 160 caracteres.'};
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(price)) return {ok:false,error:'VALIDATION',message:'El precio debe ser un número entero igual o superior a cero.'};
  const stockRaw = p.stock === undefined || p.stock === null || p.stock === '' ? (old && old.stock !== undefined && old.stock !== '' ? old.stock : 0) : p.stock;
  const stock = Number(stockRaw);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000000) {
    return {ok:false,error:'INVALID_STOCK',message:'La cantidad disponible debe ser un entero entre 0 y 100.000.000.'};
  }
  const key = Object.prototype.hasOwnProperty.call(p,'imageKey') ? String(p.imageKey || '') : String(old && old.imageKey || '');
  const imageUrl = Object.prototype.hasOwnProperty.call(p,'imageUrl') ? String(p.imageUrl || '') : String(old && old.imageUrl || '');
  if (key || imageUrl) validateOwnedImage_(key,imageUrl,s.businessId,'product');
  const obj = {
    productId:productId || Utilities.getUuid(),
    businessId:s.businessId,
    name:name,
    price:price,
    link:safeHttpUrl_(p.link),
    paymentLink:Object.prototype.hasOwnProperty.call(p,'paymentLink') ? safeMercadoPagoUrl_(p.paymentLink) : safeMercadoPagoUrl_(old && old.paymentLink),
    social:safeHttpUrl_(p.social),
    description:String(p.description || '').slice(0,3000),
    imageKey:key,
    imageUrl:imageUrl,
    stock:stock,
    type: String(p.type || (old && old.type) || 'producto').toLowerCase() === 'servicio' ? 'servicio' : 'producto',
    featured: isTrue_(p.featured),
    // Los productos nuevos se publican automáticamente al guardarse.
    // En actualizaciones se conserva el estado existente; la publicación manual se gestiona mediante setProductPublished.
    published:old ? isTrue_(old.published) : true,
    createdAt:old ? old.createdAt : new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  // Solo el propietario autenticado puede guardar productos de su propio negocio.
  if (row) writeObject_(sh,row,obj);
  else { const headers=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; sh.appendRow(headers.map(function(h){ return obj[h] === undefined ? '' : obj[h]; })); row = sh.getLastRow(); }
  if (obj.featured) {
    const allRows = rowsObjects_(sh);
    allRows.forEach(function(other){
      if (String(other.businessId) === String(s.businessId) && String(other.productId) !== String(obj.productId) && isTrue_(other.featured)) {
        const orow = findRow_(sh,'productId',String(other.productId));
        if (orow) { other.featured = false; other.updatedAt = new Date().toISOString(); writeObject_(sh,orow,other); }
      }
    });
  }
  audit_(s.userId,'saveProduct',s.businessId,obj.productId);
  return {ok:true,product:obj};
}

function deleteProduct_(body) {
  const s = requireEntrepreneurSession_(body);
  const id = String(body.productId || '');
  const sh = db_().getSheetByName('Products');
  const row = findRow_(sh,'productId',id);
  if (!row) return {ok:true};
  const p = rowObject_(sh,row);
  if (String(p.businessId) !== String(s.businessId)) throw new Error('FORBIDDEN');
  sh.deleteRow(row);
  audit_(s.userId,'deleteProduct',s.businessId,id);
  return {ok:true};
}

function setProductPublished_(body) {
  const s = requireSession_(body);
  const sh = db_().getSheetByName('Products');
  const row = findRow_(sh,'productId',String(body.productId || ''));
  if (!row) return fail_('NOT_FOUND');
  const p = rowObject_(sh,row);
  if (String(p.businessId) !== String(s.businessId) && s.role !== 'admin') throw new Error('FORBIDDEN');
  p.published = isTrue_(body.published);
  p.updatedAt = new Date().toISOString();
  writeObject_(sh,row,p);
  audit_(s.userId,'setProductPublished',p.businessId,p.productId+':'+p.published);
  return {ok:true,product:p};
}

/** Only an administrator can publish/unpublish a storefront. */
function setBusinessPublished_(body) {
  const s = requireAdminSession_(body);
  const businessId = String(body.businessId || '');
  if (!businessId) return fail_('BUSINESS_ID_REQUIRED');
  const sh = db_().getSheetByName('Businesses');
  const row = findRow_(sh,'businessId',businessId);
  if (!row) return fail_('NOT_FOUND');
  const b = rowObject_(sh,row);
  b.published = isTrue_(body.published);
  b.updatedAt = new Date().toISOString();
  writeObject_(sh,row,b);
  audit_(s.userId,'setBusinessPublished',businessId,String(b.published));
  return {ok:true,businessId:businessId,published:b.published};
}

/** Return only fields intended for the public storefront. Never expose owner IDs or private profile fields. */
function publicStore_(businessId) {
  if (!businessId || businessId.length > 100) return fail_('BUSINESS_ID_REQUIRED');
  const ss = db_();
  const bs = ss.getSheetByName('Businesses');
  const br = findRow_(bs,'businessId',businessId);
  if (!br) return fail_('NOT_FOUND');
  const b = rowObject_(bs,br);
  if (!isTrue_(b.published)) return fail_('NOT_PUBLISHED');
  const publicProfile = {
    businessId:String(b.businessId || ''),
    businessName:String(b.businessName || ''),
    category:String(b.category || ''),
    businessDescription:String(b.businessDescription || ''),
    businessWeb:safeHttpUrl_(b.businessWeb),
    city:String(b.city || ''),
    phone:String(b.phone || ''),
    email:String(b.email || ''),
    businessInstagram:safeHttpUrl_(b.businessInstagram),
    businessFacebook:safeHttpUrl_(b.businessFacebook),
    businessVideoUrl:safeHttpUrl_(b.businessVideoUrl),
    logoUrl:validatedStoredImageUrl_(b.logoKey,b.logoUrl,b.businessId,'logo'),
    couponImageUrl:validatedStoredImageUrl_(b.couponImageKey,b.couponImageUrl,b.businessId,'coupon'),
    couponEnabled:isTrue_(b.couponEnabled)
  };
  const products = rowsObjects_(ss.getSheetByName('Products'))
    .filter(function(p){ return String(p.businessId) === String(businessId) && isTrue_(p.published); })
    .map(function(p){
      return {
        productId:String(p.productId || ''),
        businessId:String(p.businessId || ''),
        name:String(p.name || ''),
        price:Number(p.price || 0),
        link:safeHttpUrl_(p.link),
        paymentLink:safeMercadoPagoUrl_(p.paymentLink),
        social:safeHttpUrl_(p.social),
        description:String(p.description || ''),
        imageUrl:validatedStoredImageUrl_(p.imageKey,p.imageUrl,p.businessId,'product'),
        stock:Number.isInteger(Number(p.stock)) && Number(p.stock) >= 0 ? Number(p.stock) : 0,
        type:String(p.type || 'producto').toLowerCase() === 'servicio' ? 'servicio' : 'producto',
        featured:isTrue_(p.featured),
        updatedAt:String(p.updatedAt || ''),
        published:true
      };
    });
  return {ok:true,profile:publicProfile,products:products};
}

/**
 * Catálogo público completo para la página de búsqueda.
 * Lee Businesses y Products una vez por petición y devuelve solo negocios y productos publicados.
 * No expone ownerUserId, datos de usuarios, sesiones ni datos internos de almacenamiento.
 */
function publicCatalog_() {
  const ss = db_();
  const businessesSheet = ss.getSheetByName('Businesses');
  const productsSheet = ss.getSheetByName('Products');
  if (!businessesSheet || !productsSheet) return fail_('SHEETS_NOT_CONFIGURED');

  // Una lectura por hoja, en lugar de buscar cada producto individualmente.
  const businesses = rowsObjects_(businessesSheet);
  const products = rowsObjects_(productsSheet);
  const publicBusinesses = {};

  businesses.forEach(function(b) {
    if (!isTrue_(b.published)) return;
    const businessId = String(b.businessId || '');
    if (!businessId) return;
    publicBusinesses[businessId] = {
      businessId: businessId,
      businessName: String(b.businessName || ''),
      category: String(b.category || ''),
      businessDescription: String(b.businessDescription || ''),
      businessWeb: safeHttpUrl_(b.businessWeb),
      city: String(b.city || ''),
      // Estos datos son para contacto directo en la tienda pública.
      phone: String(b.phone || '').slice(0, 50),
      email: String(b.email || '').slice(0, 254),
      businessWeb: safeHttpUrl_(b.businessWeb),
      businessInstagram: safeHttpUrl_(b.businessInstagram),
      businessFacebook: safeHttpUrl_(b.businessFacebook),
      businessVideoUrl: safeHttpUrl_(b.businessVideoUrl),
      logoUrl: validatedStoredImageUrl_(b.logoKey, b.logoUrl, businessId, 'logo'),
      couponImageUrl: validatedStoredImageUrl_(b.couponImageKey, b.couponImageUrl, businessId, 'coupon'),
      couponEnabled: isTrue_(b.couponEnabled),
      products: []
    };
  });

  products.forEach(function(p) {
    if (!isTrue_(p.published)) return;
    const businessId = String(p.businessId || '');
    const business = publicBusinesses[businessId];
    if (!business) return; // Nunca mostrar productos de un negocio no publicado.
    const stockValue = Number(p.stock);
    business.products.push({
      productId: String(p.productId || ''),
      businessId: businessId,
      name: String(p.name || ''),
      price: Number.isFinite(Number(p.price)) && Number(p.price) >= 0 ? Number(p.price) : 0,
      link: safeHttpUrl_(p.link),
      paymentLink: safeMercadoPagoUrl_(p.paymentLink),
      social: safeHttpUrl_(p.social),
      description: String(p.description || ''),
      imageUrl: validatedStoredImageUrl_(p.imageKey, p.imageUrl, businessId, 'product'),
      stock: Number.isInteger(stockValue) && stockValue >= 0 ? stockValue : 0,
      type: String(p.type || 'producto').toLowerCase() === 'servicio' ? 'servicio' : 'producto',
      featured: isTrue_(p.featured),
      updatedAt: String(p.updatedAt || '')
    });
  });

  const catalogBusinesses = Object.keys(publicBusinesses).map(function(id) {
    const b = publicBusinesses[id];
    // Un negocio sin productos publicados no necesita aparecer en el buscador de productos.
    if (!b.products.length) return null;
    return b;
  }).filter(function(b) { return b !== null; });

  const totalProducts = catalogBusinesses.reduce(function(total, b) {
    return total + b.products.length;
  }, 0);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    businesses: catalogBusinesses,
    totalBusinesses: catalogBusinesses.length,
    totalProducts: totalProducts
  };
}

/** Upload an image through the private Worker endpoint. Secrets stay in Script Properties. */
function uploadImage_(body) {
  const s = requireEntrepreneurSession_(body);
  const data = String(body.base64 || '');
  const kind = body.kind === 'logo' ? 'logo' : (body.kind === 'product' ? 'product' : (body.kind === 'coupon' ? 'coupon' : ''));
  if (!kind) return fail_('INVALID_IMAGE_KIND');
  const match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return fail_('INVALID_IMAGE');
  let bytes;
  try { bytes = Utilities.base64Decode(match[2]); }
  catch (err) { return fail_('INVALID_IMAGE'); }
  if (!bytes.length || bytes.length > VF.MAX_IMAGE_BYTES) return {ok:false,error:'IMAGE_TOO_LARGE',message:'La imagen procesada debe pesar 2 MB o menos.'};
  const props = PropertiesService.getScriptProperties();
  const endpoint = String(props.getProperty('R2_WORKER_URL') || VF.WORKER_DEFAULT_URL).replace(/\/$/,'');
  const secret = props.getProperty('R2_WORKER_SECRET');
  if (!secret || endpoint !== VF.WORKER_DEFAULT_URL) return {ok:false,error:'R2_NOT_CONFIGURED',message:'Verifica R2_WORKER_URL y R2_WORKER_SECRET en Apps Script.'};
  const ext = match[1] === 'image/png' ? 'png' : (match[1] === 'image/webp' ? 'webp' : 'jpg');
  const key = s.businessId + '/' + kind + '/' + Utilities.getUuid() + '.' + ext;
  const payload = {key:key,contentType:match[1],base64:match[2]};
  let response;
  try {
    response = UrlFetchApp.fetch(endpoint + '/upload', {
      method:'post',
      contentType:'application/json',
      headers:{'X-VFeria-Secret':secret},
      payload:JSON.stringify(payload),
      muteHttpExceptions:true
    });
  } catch (err) {
    console.error('Worker request failed: ' + String(err));
    return {ok:false,error:'R2_CONNECTION_FAILED',message:'No se pudo conectar con el servicio de imágenes.'};
  }
  let result;
  try { result = JSON.parse(response.getContentText() || '{}'); }
  catch (err) { return {ok:false,error:'R2_INVALID_RESPONSE',message:'El servicio de imágenes devolvió una respuesta inválida.'}; }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !result.ok || result.key !== key || !isExpectedWorkerImageUrl_(result.url,key)) {
    console.error('R2 upload rejected. HTTP ' + response.getResponseCode() + ', error=' + String(result.error || 'unknown'));
    return {ok:false,error:'R2_UPLOAD_FAILED',message:'No se pudo almacenar la imagen.'};
  }
  audit_(s.userId,'uploadImage',s.businessId,kind);
  return {ok:true,key:key,url:result.url};
}

function validateOwnedImage_(key,imageUrl,businessId,kind) {
  key = String(key || '');
  imageUrl = String(imageUrl || '');
  if (!key && !imageUrl) return true;
  const escapedBusinessId = String(businessId || '').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const keyPattern = new RegExp('^' + escapedBusinessId + '/' + kind + '/[a-f0-9-]{36}\\.(jpg|png|webp)$','i');
  if (!keyPattern.test(key) || !isExpectedWorkerImageUrl_(imageUrl,key)) throw new Error('FORBIDDEN');
  return true;
}

function validatedStoredImageUrl_(key,imageUrl,businessId,kind) {
  try { validateOwnedImage_(key,imageUrl,businessId,kind); return String(imageUrl || ''); }
  catch (err) { return ''; }
}

function isExpectedWorkerImageUrl_(imageUrl,key) {
  const base = String(PropertiesService.getScriptProperties().getProperty('R2_WORKER_URL') || VF.WORKER_DEFAULT_URL).replace(/\/$/,'');
  return String(imageUrl || '') === base + '/images/' + String(key || '').split('/').map(encodeURIComponent).join('/');
}

function requireSession_(body) {
  const s = session_(body && body.token);
  if (!s) throw new Error('SESSION_EXPIRED');
  return s;
}
function requireEntrepreneurSession_(body) {
  const s = requireSession_(body);
  if (s.role !== 'entrepreneur' || !s.businessId) throw new Error('FORBIDDEN');
  return s;
}
function requireAdminSession_(body) {
  const s = requireSession_(body);
  if (s.role !== 'admin') throw new Error('FORBIDDEN');
  return s;
}

/** Session role and businessId are re-read from Users so revoked/changed account permissions take effect. */
function session_(token) {
  if (!token) return null;
  const sh = db_().getSheetByName('Sessions');
  const hash = sha256_(String(token));
  const row = findRow_(sh,'tokenHash',hash);
  if (!row) return null;
  const o = rowObject_(sh,row);
  const expiry = Date.parse(o.expiresAt);
  if (isTrue_(o.revoked) || !Number.isFinite(expiry) || expiry <= Date.now()) return null;
  const users = db_().getSheetByName('Users');
  const userRow = findRow_(users,'userId',o.userId);
  if (!userRow) return null;
  const u = rowObject_(users,userRow);
  if (!isTrue_(u.active)) return null;
  return {
    row:row,
    userId:String(u.userId),
    businessId:String(u.businessId || ''),
    role:String(u.role || '').toLowerCase(),
    expiresAt:o.expiresAt,
    username:String(u.username || '')
  };
}

function adminCreateEntrepreneur_(body) {
  const admin = requireAdminSession_(body);
  const ss = db_();
  const usersSheet = ss.getSheetByName('Users');
  const businessesSheet = ss.getSheetByName('Businesses');
  const username = normalizeUsername_(body.username);
  const password = String(body.password || '');
  const businessName = String(body.businessName || '').trim();
  const email = String(body.email || '').trim().slice(0,254);
  const phone = String(body.phone || '').trim().slice(0,50);
  const city = String(body.city || '').trim().slice(0,100);
  if (!usersSheet || !businessesSheet) return fail_('SHEETS_NOT_CONFIGURED');
  if (!username || username.length < 3 || username.length > VF.MAX_USERNAME_LENGTH) return fail_('INVALID_USERNAME');
  if (password.length < 14) return fail_('PASSWORD_TOO_SHORT');
  if (!businessName || businessName.length > 150) return fail_('INVALID_BUSINESS_NAME');
  const businessId = Utilities.getUuid();
  let created;
  try {
    created = createUser_(username,password,'entrepreneur',businessId,true);
  } catch (err) {
    if (String(err.message || err).indexOf('ya existe') !== -1) return fail_('USERNAME_EXISTS');
    throw err;
  }
  const initial={businessId:businessId,ownerUserId:created.userId,fullName:'',email:email,phone:phone,city:city,businessName:businessName,category:'',businessDescription:'',businessWeb:'',businessInstagram:'',businessFacebook:'',businessVideoUrl:'',logoKey:'',logoUrl:'',couponImageKey:'',couponImageUrl:'',couponEnabled:false,updatedAt:new Date().toISOString(),published:true};
  const businessHeaders=businessesSheet.getRange(1,1,1,businessesSheet.getLastColumn()).getValues()[0];
  businessesSheet.appendRow(businessHeaders.map(function(h){return initial[h]===undefined?'':initial[h];}));
  audit_(admin.userId,'adminCreateEntrepreneur',businessId,'username='+created.username);
  return {ok:true,message:'Cuenta de emprendedor creada.',user:{userId:created.userId,username:created.username,role:'entrepreneur',businessId:businessId}};
}


function changePassword_(body) {
  const s = requireEntrepreneurSession_(body);
  const password = String(body.password || '');
  if (password.length < 14) return fail_('PASSWORD_TOO_SHORT');
  const sh = db_().getSheetByName('Users');
  const row = findRow_(sh,'userId',s.userId);
  if (!row) return fail_('NOT_FOUND');
  const u = rowObject_(sh,row);
  const salt = randomToken_();
  u.passwordSalt = salt;
  u.passwordHash = passwordHash_(password,salt);
  sh.getRange(row,3,1,2).setValues([[u.passwordSalt,u.passwordHash]]);
  audit_(s.userId,'changePassword',s.businessId,'');
  return {ok:true,message:'Contraseña actualizada.'};
}

function adminListEntrepreneurs_(body) {
  requireAdminSession_(body);
  const ss=db_(); const users=rowsObjects_(ss.getSheetByName('Users')); const businesses=rowsObjects_(ss.getSheetByName('Businesses')); const products=rowsObjects_(ss.getSheetByName('Products'));
  const byId={}; businesses.forEach(function(b){byId[String(b.businessId)]=b;});
  return {ok:true,entrepreneurs:users.filter(function(u){return String(u.role).toLowerCase()==='entrepreneur';}).map(function(u){
    const b=byId[String(u.businessId)]||{}; const count=products.filter(function(p){return String(p.businessId)===String(u.businessId)&&isTrue_(p.published);}).length;
    return {userId:String(u.userId),username:String(u.username),businessId:String(u.businessId||''),businessName:String(b.businessName||''),email:String(b.email||''),phone:String(b.phone||''),city:String(b.city||''),active:isTrue_(u.active),published:isTrue_(b.published),productsPublished:count,createdAt:String(u.createdAt||'')};
  })};
}

function adminResetPassword_(body) {
  const admin=requireAdminSession_(body); const userId=String(body.userId||''); if(!userId) return fail_('USER_ID_REQUIRED');
  const sh=db_().getSheetByName('Users'); const row=findRow_(sh,'userId',userId); if(!row) return fail_('NOT_FOUND');
  const u=rowObject_(sh,row); if(String(u.role).toLowerCase()!=='entrepreneur') return fail_('NOT_ALLOWED');
  const salt=randomToken_(); const password='12345678901112'; u.passwordSalt=salt; u.passwordHash=passwordHash_(password,salt); sh.getRange(row,3,1,2).setValues([[salt,u.passwordHash]]);
  // Revoke existing sessions for the user.
  const sessions=db_().getSheetByName('Sessions'); rowsObjects_(sessions).forEach(function(x){ if(String(x.userId)===userId){ const r=findRow_(sessions,'tokenHash',String(x.tokenHash)); if(r) sessions.getRange(r,7).setValue(true); }});
  audit_(admin.userId,'adminResetPassword',String(u.businessId||''),'userId='+userId);
  return {ok:true,message:'Contraseña restablecida.'};
}

function adminSetUserActive_(body) {
  const admin=requireAdminSession_(body); const userId=String(body.userId||''); if(!userId) return fail_('USER_ID_REQUIRED');
  const sh=db_().getSheetByName('Users'); const row=findRow_(sh,'userId',userId); if(!row) return fail_('NOT_FOUND');
  const u=rowObject_(sh,row); if(String(u.role).toLowerCase()!=='entrepreneur') return fail_('NOT_ALLOWED');
  const active=isTrue_(body.active); u.active=active; writeObject_(sh,row,u);
  if(!active){ const sessions=db_().getSheetByName('Sessions'); rowsObjects_(sessions).forEach(function(x){ if(String(x.userId)===userId){ const r=findRow_(sessions,'tokenHash',String(x.tokenHash)); if(r) sessions.getRange(r,7).setValue(true); }}); }
  audit_(admin.userId,'adminSetUserActive',String(u.businessId||''),String(active)); return {ok:true,active:active};
}

function adminGetBusinessPreview_(body) {
  requireAdminSession_(body); const id=String(body.businessId||''); if(!id) return fail_('BUSINESS_ID_REQUIRED');
  const bs=db_().getSheetByName('Businesses'); const br=findRow_(bs,'businessId',id); if(!br) return fail_('NOT_FOUND');
  const b=rowObject_(bs,br);
  const profile={businessId:id,fullName:String(b.fullName||''),email:String(b.email||''),phone:String(b.phone||''),city:String(b.city||''),businessName:String(b.businessName||''),category:String(b.category||''),businessDescription:String(b.businessDescription||''),businessWeb:safeHttpUrl_(b.businessWeb),businessInstagram:safeHttpUrl_(b.businessInstagram),businessFacebook:safeHttpUrl_(b.businessFacebook),businessVideoUrl:safeHttpUrl_(b.businessVideoUrl),logoUrl:validatedStoredImageUrl_(b.logoKey,b.logoUrl,id,'logo'),couponImageUrl:validatedStoredImageUrl_(b.couponImageKey,b.couponImageUrl,id,'coupon'),couponEnabled:isTrue_(b.couponEnabled),published:isTrue_(b.published)};
  const products=rowsObjects_(db_().getSheetByName('Products')).filter(function(p){return String(p.businessId)===id;}).map(function(p){return {productId:String(p.productId||''),businessId:id,name:String(p.name||''),price:Number(p.price||0),link:safeHttpUrl_(p.link),social:safeHttpUrl_(p.social),paymentLink:safeMercadoPagoUrl_(p.paymentLink),description:String(p.description||''),imageUrl:validatedStoredImageUrl_(p.imageKey,p.imageUrl,id,'product'),stock:Number.isInteger(Number(p.stock))?Number(p.stock):0,published:isTrue_(p.published),type:String(p.type||'producto'),featured:isTrue_(p.featured),updatedAt:String(p.updatedAt||'')};});
  return {ok:true,profile:profile,products:products};
}


function getSiteConfig_() {
  const ss=db_(); let sh=ss.getSheetByName('SiteConfig');
  if(!sh){sh=ss.insertSheet('SiteConfig'); sh.getRange(1,1,1,2).setValues([['key','value']]); sh.setFrozenRows(1);}
  const out={}; rowsObjects_(sh).forEach(function(r){out[String(r.key)]=String(r.value||'');});
  return {ok:true,config:{introVideoUrl:safeHttpUrl_(out.introVideoUrl),introVideoTitle:String(out.introVideoTitle||''),introVideoLegend:String(out.introVideoLegend||'')}};
}
function saveSiteConfig_(body) {
  const admin=requireAdminSession_(body); const c=body.config||{}; const ss=db_(); let sh=ss.getSheetByName('SiteConfig');
  if(!sh){sh=ss.insertSheet('SiteConfig'); sh.getRange(1,1,1,2).setValues([['key','value']]); sh.setFrozenRows(1);}
  const values={introVideoUrl:safeHttpUrl_(c.introVideoUrl),introVideoTitle:String(c.introVideoTitle||'').trim().slice(0,180),introVideoLegend:String(c.introVideoLegend||'').trim().slice(0,500)};
  Object.keys(values).forEach(function(key){const row=findRow_(sh,'key',key); if(row) sh.getRange(row,2).setValue(values[key]); else sh.appendRow([key,values[key]]);});
  audit_(admin.userId,'saveSiteConfig','',''); return {ok:true,config:values};
}

function getFeaturedContent_() {
  const ss=db_(); const businesses=rowsObjects_(ss.getSheetByName('Businesses')); const products=rowsObjects_(ss.getSheetByName('Products')); const result=[];
  const publishedBusinesses={}; businesses.forEach(function(b){if(isTrue_(b.published)&&String(b.businessId)){publishedBusinesses[String(b.businessId)]=b; if(isTrue_(b.couponEnabled)&&b.couponImageUrl){result.push({type:'coupon',businessId:String(b.businessId),businessName:String(b.businessName||''),imageUrl:validatedStoredImageUrl_(b.couponImageKey,b.couponImageUrl,b.businessId,'coupon')});}}});
  products.forEach(function(p){if(!isTrue_(p.published)||!isTrue_(p.featured))return; const b=publishedBusinesses[String(p.businessId)]; if(!b)return; result.push({type:'product',businessId:String(p.businessId),productId:String(p.productId),businessName:String(b.businessName||''),name:String(p.name||''),imageUrl:validatedStoredImageUrl_(p.imageKey,p.imageUrl,p.businessId,'product')});});
  // Entremezclar producto estrella y cupones.
  const productsFeatured=result.filter(function(x){return x.type==='product';}); const coupons=result.filter(function(x){return x.type==='coupon';}); const mixed=[]; let i=0,j=0; while(i<productsFeatured.length||j<coupons.length){if(i<productsFeatured.length)mixed.push(productsFeatured[i++]);if(j<coupons.length)mixed.push(coupons[j++]);}
  return {ok:true,items:mixed.slice(0,30)};
}

function upgradeVferiaSchema() {
  const ss=db_(); const defs={
    Businesses:['businessInstagram','businessFacebook','businessVideoUrl','couponImageKey','couponImageUrl','couponEnabled'],
    Products:['paymentLink','type','featured']
  };
  Object.keys(defs).forEach(function(name){const sh=ss.getSheetByName(name); if(!sh)throw new Error('No existe la hoja '+name); const headers=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(String); defs[name].forEach(function(h){if(headers.indexOf(h)===-1)sh.getRange(1,sh.getLastColumn()+1).setValue(h);}); sh.setFrozenRows(1); sh.getRange(1,1,1,sh.getLastColumn()).setFontWeight('bold');});
  return 'Esquema VFeria ampliado correctamente.';
}

/** Ejecutar una sola vez: agrega paymentLink al final de Products sin alterar columnas existentes. */
function migrateProductsPaymentLinkColumn() {
  const sh = db_().getSheetByName('Products');
  if (!sh) throw new Error('No existe la hoja Products.');
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf('paymentLink') === -1) {
    sh.getRange(1, lastCol + 1).setValue('paymentLink');
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  sh.setFrozenRows(1);
  return 'Migración completada: columna paymentLink verificada en Products.';
}

/** Analítica pública: eventos permitidos y agregados. No almacenar IP ni datos personales. */
function ensureAnalyticsSheets_() {
  const ss = db_();
  const defs = {
    AnalyticsEvents:['eventId','timestamp','date','month','eventType','businessId','productId','sessionId'],
    AnalyticsDaily:['date','pageViews','businessViews','productViews','totalViews'],
    AnalyticsEntities:['entityType','entityId','entityName','businessId','views','updatedAt']
  };
  Object.keys(defs).forEach(function(name){
    let sh=ss.getSheetByName(name);
    if(!sh) sh=ss.insertSheet(name);
    if(sh.getLastRow()===0) sh.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
    sh.setFrozenRows(1);
  });
  return ss;
}
function trackVisit_(body) {
  const type=String(body.eventType||'');
  if(['page_view','business_view','product_view'].indexOf(type)===-1) return fail_('INVALID_EVENT_TYPE');
  const sessionId=String(body.sessionId||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
  if(sessionId.length<16) return fail_('INVALID_SESSION');
  const businessId=String(body.businessId||'').slice(0,100);
  const productId=String(body.productId||'').slice(0,100);
  if(type==='business_view' && !businessId) return fail_('BUSINESS_ID_REQUIRED');
  if(type==='product_view' && (!businessId || !productId)) return fail_('PRODUCT_AND_BUSINESS_REQUIRED');
  const cache=CacheService.getScriptCache();
  const dedupeKey='vfvisit_'+sha256_(sessionId+'|'+type+'|'+businessId+'|'+productId);
  if(cache.get(dedupeKey)) return {ok:true,recorded:false,deduplicated:true};
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if(cache.get(dedupeKey)) return {ok:true,recorded:false,deduplicated:true};
    const ss=ensureAnalyticsSheets_();
    const now=new Date();
    const tz='America/Santiago';
    const date=Utilities.formatDate(now,tz,'yyyy-MM-dd');
    const month=Utilities.formatDate(now,tz,'yyyy-MM');
    const events=ss.getSheetByName('AnalyticsEvents');
    events.appendRow([Utilities.getUuid(),now.toISOString(),date,month,type,businessId,productId,sessionId]);
    const daily=ss.getSheetByName('AnalyticsDaily');
    let dr=findRow_(daily,'date',date);
    if(!dr){ daily.appendRow([date,0,0,0,0]); dr=daily.getLastRow(); }
    const col=type==='page_view'?2:(type==='business_view'?3:4);
    daily.getRange(dr,col).setValue(Number(daily.getRange(dr,col).getValue()||0)+1);
    daily.getRange(dr,5).setValue(Number(daily.getRange(dr,2).getValue()||0)+Number(daily.getRange(dr,3).getValue()||0)+Number(daily.getRange(dr,4).getValue()||0));
    if(type!=='page_view') {
      const entities=ss.getSheetByName('AnalyticsEntities');
      const entityType=type==='business_view'?'business':'product';
      const entityId=entityType==='business'?businessId:productId;
      const entityName=analyticsEntityName_(entityType,entityId);
      let er=0;
      const vals=entities.getDataRange().getValues();
      for(let i=1;i<vals.length;i++) if(String(vals[i][0])===entityType && String(vals[i][1])===entityId){er=i+1;break;}
      if(!er){entities.appendRow([entityType,entityId,entityName,businessId,1,now.toISOString()]);}
      else {entities.getRange(er,5).setValue(Number(entities.getRange(er,5).getValue()||0)+1);entities.getRange(er,6).setValue(now.toISOString());if(entityName)entities.getRange(er,3).setValue(entityName);}
    }
    cache.put(dedupeKey,'1',1800);
    return {ok:true,recorded:true};
  } finally { lock.releaseLock(); }
}
function analyticsEntityName_(type,id) {
  const ss=db_();
  if(type==='business') { const r=findRow_(ss.getSheetByName('Businesses'),'businessId',id); return r?String(rowObject_(ss.getSheetByName('Businesses'),r).businessName||''):''; }
  const r=findRow_(ss.getSheetByName('Products'),'productId',id);
  return r?String(rowObject_(ss.getSheetByName('Products'),r).name||''):'';
}
function getPublicAnalytics_() {
  const ss=ensureAnalyticsSheets_(); const tz='America/Santiago'; const now=new Date();
  const today=Utilities.formatDate(now,tz,'yyyy-MM-dd'); const month=Utilities.formatDate(now,tz,'yyyy-MM');
  const rows=ss.getSheetByName('AnalyticsDaily').getDataRange().getValues();
  let total=0,todayCount=0,monthCount=0;
  for(let i=1;i<rows.length;i++){const d=String(rows[i][0]);const n=Number(rows[i][1]||0);total+=n;if(d===today)todayCount=n;if(d.indexOf(month)===0)monthCount+=n;}
  return {ok:true,total:total,today:todayCount,monthly:monthCount,updatedAt:now.toISOString()};
}
function getAdminAnalytics_(body) {
  requireAdminSession_(body);
  const ss=ensureAnalyticsSheets_(); const tz='America/Santiago'; const now=new Date();
  const today=Utilities.formatDate(now,tz,'yyyy-MM-dd'); const month=Utilities.formatDate(now,tz,'yyyy-MM');
  const daily=ss.getSheetByName('AnalyticsDaily').getDataRange().getValues();
  let total=0,todayCount=0,monthCount=0; const trend=[];
  for(let i=1;i<daily.length;i++){const d=String(daily[i][0]);const n=Number(daily[i][4]||0);total+=n;if(d===today)todayCount=n;if(d.indexOf(month)===0)monthCount+=n;trend.push({date:d,pageViews:Number(daily[i][1]||0),businessViews:Number(daily[i][2]||0),productViews:Number(daily[i][3]||0),total:n});}
  const entities=ss.getSheetByName('AnalyticsEntities').getDataRange().getValues();
  const businesses=[],products=[];
  for(let i=1;i<entities.length;i++){const x={id:String(entities[i][1]),name:String(entities[i][2]||entities[i][1]),businessId:String(entities[i][3]||''),views:Number(entities[i][4]||0)};if(String(entities[i][0])==='business')businesses.push(x);if(String(entities[i][0])==='product')products.push(x);}
  businesses.sort((a,b)=>b.views-a.views); products.sort((a,b)=>b.views-a.views); trend.sort((a,b)=>a.date.localeCompare(b.date));
  return {ok:true,total:total,today:todayCount,monthly:monthCount,trend:trend.slice(-30),businesses:businesses.slice(0,20),products:products.slice(0,20),updatedAt:now.toISOString()};
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('VF_SPREADSHEET_ID');
  if (!id) throw new Error('Ejecuta setupVferia() primero.');
  return SpreadsheetApp.openById(id);
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function fail_(error) { return {ok:false,error:error}; }
function isTrue_(value) { return value === true || String(value).toLowerCase() === 'true'; }
function normalizeUsername_(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g,''); }
function randomToken_() { return Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''); }
function sha256_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8)).replace(/=+$/,''); }
function passwordHash_(password,salt) { let v = String(salt) + '|' + String(password); for (let i=0;i<12000;i++) v = sha256_(v); return v; }
function constantTimeEqual_(a,b) { a=String(a); b=String(b); let d=a.length^b.length; const n=Math.max(a.length,b.length); for(let i=0;i<n;i++) d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return d===0; }
function safeMercadoPagoUrl_(v) {
  v = String(v || '').trim();
  if (!v || v.length >= 1500) return '';
  // Solo HTTPS y dominios oficiales de Mercado Pago / enlaces cortos mpago.la.
  const match = v.match(/^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  if (!match) return '';
  const host = match[1].toLowerCase().replace(/:\d+$/, '');
  const allowed = host === 'mercadopago.cl' || /\.mercadopago\.cl$/.test(host) ||
    host === 'mercadopago.com' || /\.mercadopago\.com$/.test(host) ||
    host === 'mpago.la' || /\.mpago\.la$/.test(host);
  return allowed ? v : '';
}
function safeHttpUrl_(v) { v=String(v||'').trim(); return /^https?:\/\//i.test(v) && v.length < 1500 ? v : ''; }
function findRow_(sh,header,value) {
  if (!sh) throw new Error('SHEET_NOT_FOUND');
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return 0;
  const idx = vals[0].indexOf(header);
  if (idx < 0) return 0;
  for (let i=1;i<vals.length;i++) if (String(vals[i][idx]) === String(value)) return i+1;
  return 0;
}
function rowObject_(sh,row) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return {};
  const vals = sh.getRange(row,1,1,lastCol).getValues()[0];
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  const o = {};
  headers.forEach(function(h,i){ o[h] = vals[i]; });
  return o;
}
function rowsObjects_(sh) {
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  return v.slice(1).filter(function(r){ return r.some(function(c){ return c !== '' && c !== null; }); }).map(function(r){
    const o = {};
    v[0].forEach(function(h,i){ o[h] = r[i]; });
    return o;
  });
}
function writeObject_(sh,row,obj) {
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.getRange(row,1,1,headers.length).setValues([headers.map(function(h){ return obj[h] === undefined ? '' : obj[h]; })]);
}
function audit_(userId,action,businessId,details) {
  const sh = db_().getSheetByName('Audit');
  if (sh) sh.appendRow([new Date().toISOString(),userId,action,businessId,String(details || '').slice(0,500)]);
}

/**
 * Configuración exclusiva de analítica VFeria.
 * No modifica las hojas existentes ni cambia VF_SPREADSHEET_ID.
 * Ejecutar una sola vez.
 */
function setupAnalyticsVferia() {
  const ss = db_();

  const definitions = {
    AnalyticsEvents: [
      'eventId', 'timestamp', 'date', 'month',
      'eventType', 'businessId', 'productId', 'sessionId'
    ],
    AnalyticsDaily: [
      'date', 'pageViews', 'businessViews',
      'productViews', 'totalViews'
    ],
    AnalyticsEntities: [
      'entityType', 'entityId', 'entityName',
      'businessId', 'views', 'updatedAt'
    ]
  };

  Object.keys(definitions).forEach(function(name) {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    const headers = definitions[name];

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length)
        .setValues([headers]);
    } else {
      const existing = sheet.getRange(
        1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)
      ).getValues()[0];

      const actual = existing.slice(0, headers.length).map(String);

      if (headers.some(function(header, index) {
        return actual[index] !== header;
      })) {
        throw new Error(
          'Los encabezados de ' + name +
          ' no coinciden. No se modificaron sus datos.'
        );
      }
    }

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold');
  });

  return 'Analítica VFeria configurada correctamente.';
}
