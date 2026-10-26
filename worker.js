/** Cloudflare Worker for private uploads to R2. Bind bucket as R2_BUCKET. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-VFeria-Secret',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({ok:true,service:'VFeria R2 Worker'}, {headers:cors});
    if (url.pathname === '/upload' && request.method === 'POST') {
      if (!env.VFERIA_UPLOAD_SECRET || request.headers.get('X-VFeria-Secret') !== env.VFERIA_UPLOAD_SECRET) return Response.json({ok:false,error:'UNAUTHORIZED'}, {status:401,headers:cors});
      let body; try { body = await request.json(); } catch { return Response.json({ok:false,error:'BAD_JSON'}, {status:400,headers:cors}); }
      const key = String(body.key || '');
      const type = String(body.contentType || '');
      const base64 = String(body.base64 || '');
      if (!/^[a-zA-Z0-9_-]+\/(logo|product)\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key) || !/^image\/(jpeg|png|webp)$/.test(type) || !base64) return Response.json({ok:false,error:'INVALID_INPUT'}, {status:400,headers:cors});
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      if (bytes.byteLength > 2 * 1024 * 1024) return Response.json({ok:false,error:'TOO_LARGE'}, {status:413,headers:cors});
      await env.R2_BUCKET.put(key, bytes, {httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
      const publicBase = String(env.R2_PUBLIC_BASE_URL || '').replace(/\/$/,'');
      if (!publicBase) return Response.json({ok:false,error:'PUBLIC_BASE_URL_NOT_CONFIGURED'}, {status:500,headers:cors});
      return Response.json({ok:true,key,url:publicBase+'/'+key}, {headers:cors});
    }
    return Response.json({ok:false,error:'NOT_FOUND'}, {status:404,headers:cors});
  }
};
