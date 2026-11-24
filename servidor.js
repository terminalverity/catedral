// Plan Catedral fuera de Claude (24 nov 2026): le da a la página el mismo `claude.use("db")` y `claude.use("assets")`
// que tenía dentro de Claude, pero guardado en tu Supabase personal (proyecto «rastro», org Georgos).
// Entra con la misma clave que Locus: en terminalverity.github.io, entrar en uno sirve para el otro.
(() => {
  if (window.claude && window.claude.use) return; // dentro de Claude no hace nada
  const BASE = "https://bkskialonwivuqxmpiau.supabase.co/functions/v1/";
  const SERVIDOR = BASE + "catedral", LOCUS = BASE + "rastro";
  const WEBAUTHN = "https://unpkg.com/@simplewebauthn/browser@14.0.0/dist/bundle/index.umd.min.js";
  const leer = () => { try { return JSON.parse(localStorage.getItem("rastro.config")) || null; } catch (e) { return null; } };
  const guardar = (clave) => { try { localStorage.setItem("rastro.config", JSON.stringify({ url: LOCUS, clave })); } catch (e) { /* sin almacenamiento */ } };

  // El QR «Verlo en el celular» de Locus trae la clave en el # (no viaja al servidor).
  const m = location.hash.match(/conectar=([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      const c = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
      if (c && c.clave) guardar(c.clave);
    } catch (e) { /* enlace dañado */ }
    history.replaceState(null, "", location.pathname + location.search);
  }
  let clave = (leer() || {}).clave || "";
  window.CATEDRAL_FUERA = true;

  // ---------- Entrar ----------
  function pantallaEntrar(msg) {
    if (document.getElementById("entrar-catedral")) return;
    const d = document.createElement("div");
    d.id = "entrar-catedral";
    d.innerHTML = `<style>
      #entrar-catedral{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(20,19,17,.55);backdrop-filter:blur(2px)}
      #entrar-catedral .c{max-width:380px;width:100%;background:#f4f1e9;color:#151412;border:1px solid #d8d1c2;border-radius:14px;padding:22px;font:15px/1.45 Geist,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.25)}
      #entrar-catedral h2{font:800 22px/1.1 "Bricolage Grotesque",system-ui,sans-serif;margin:0 0 8px}
      #entrar-catedral p{margin:0 0 14px;color:#6d685d}
      #entrar-catedral button{width:100%;min-height:46px;border-radius:10px;border:0;background:#151412;color:#f4f1e9;font:600 15px Geist,system-ui,sans-serif;cursor:pointer}
      #entrar-catedral details{margin-top:14px} #entrar-catedral summary{cursor:pointer;color:#6d685d;font-size:13px}
      #entrar-catedral input{width:100%;box-sizing:border-box;margin:10px 0 8px;min-height:42px;border:1px solid #d8d1c2;border-radius:8px;padding:0 10px;font:14px "Geist Mono",monospace;background:#fff}
      #entrar-catedral .n{min-height:20px;margin:10px 0 0;font-size:13px;color:#a3402c}
      @media (prefers-color-scheme: dark){#entrar-catedral .c{background:#1e1d1a;color:#f1ede4;border-color:#34312b}#entrar-catedral p,#entrar-catedral summary{color:#a8a294}#entrar-catedral button{background:#e9a21c;color:#151412}#entrar-catedral input{background:#151412;color:#f1ede4;border-color:#34312b}}
    </style><div class="c" role="dialog" aria-label="Entrar a Plan Catedral"><h2>Plan Catedral</h2>
      <p>${msg || "Entra con tu llave de acceso, la misma de Locus (huella o cara)."}</p>
      <button type="button" id="ec-llave">Entrar con mi llave</button>
      <details><summary>Entrar con la clave de lectura</summary><input id="ec-clave" autocomplete="off" placeholder="Clave de lectura"><button type="button" id="ec-ok">Entrar</button></details>
      <p class="n" id="ec-nota"></p></div>`;
    document.body.appendChild(d);
    const nota = (t) => { document.getElementById("ec-nota").textContent = t; };
    document.getElementById("ec-ok").onclick = () => { const v = document.getElementById("ec-clave").value.trim(); if (v) { guardar(v); location.reload(); } };
    document.getElementById("ec-llave").onclick = async () => {
      if (!(window.PublicKeyCredential && navigator.credentials)) return nota("Este navegador no admite llaves de acceso. Usa la clave de lectura.");
      try {
        nota("Esperando tu llave…");
        if (!window.SimpleWebAuthnBrowser) await new Promise((ok, mal) => { const s = document.createElement("script"); s.src = WEBAUTHN; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
        const pedir = async (ruta, cuerpo) => {
          const r = await fetch(LOCUS + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
          let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
          if (!r.ok) throw new Error((j && j.error) || "Error " + r.status);
          return j;
        };
        const opciones = await pedir("/llave/entrada/opciones");
        const respuesta = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: opciones });
        nota("Verificando…");
        const j = await pedir("/llave/entrada", { respuesta });
        guardar(j.clave); location.reload();
      } catch (e) {
        const n = e && e.name;
        nota(n === "NotAllowedError" || n === "AbortError" ? "Se canceló o se acabó el tiempo. Vuelve a intentar." : (e && e.message) || "No se pudo usar la llave.");
      }
    };
  }

  // ---------- Base de datos (mismas colecciones que en Claude) ----------
  const cache = new Map();
  const oyentes = []; // { col | ruta, f, err }
  let cargado = false, enVuelo = 0, ultimaEscritura = 0, fallos = 0;

  async function pedir(ruta, opt) {
    opt = opt || {};
    const r = await fetch(SERVIDOR + "/" + ruta, Object.assign({}, opt, { cache: "no-store", headers: Object.assign({ Authorization: "Bearer " + clave }, opt.headers || {}) }));
    if (r.status === 401) { pantallaEntrar("Tu acceso ya no vale en este navegador. Vuelve a entrar con tu llave."); throw { code: "not_granted" }; }
    if (!r.ok) throw { code: "error", status: r.status };
    return r;
  }
  const congelar = (o) => { if (o && typeof o === "object") { Object.freeze(o); for (const k in o) congelar(o[k]); } return o; };
  const snapCol = (col) => {
    const docs = [];
    for (const [ruta, datos] of cache) if (ruta.startsWith(col + "/")) docs.push({ id: ruta.slice(col.length + 1), data: () => datos });
    return { docs, forEach: (f) => docs.forEach(f), size: docs.length };
  };
  const snapDoc = (ruta) => ({ id: ruta.split("/").pop(), exists: cache.has(ruta), data: () => cache.get(ruta) });
  const avisar = (o) => { try { o.f(o.col ? snapCol(o.col) : snapDoc(o.ruta)); } catch (e) { console.error(e); } };

  async function traer() {
    if (!clave || enVuelo || Date.now() - ultimaEscritura < 4000) return;
    const inicio = Date.now();
    try {
      const lista = await (await pedir("docs")).json();
      fallos = 0;
      if (enVuelo || ultimaEscritura > inicio) return; // llegó una escritura mientras leía: gana lo local
      const nuevo = new Map(lista.map((x) => [x.ruta, congelar(x.datos)]));
      if (cargado && JSON.stringify([...nuevo]) === JSON.stringify([...cache])) return;
      cache.clear(); for (const [k, v] of nuevo) cache.set(k, v);
      cargado = true;
      oyentes.forEach(avisar);
    } catch (e) {
      fallos++;
      if (!cargado && e.code !== "not_granted") oyentes.forEach((o) => o.err && o.err(e));
    }
  }
  setInterval(() => { if (document.visibilityState === "visible") traer(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") traer(); });
  window.addEventListener("online", traer);

  const escuchar = (o) => { oyentes.push(o); if (cargado) setTimeout(() => avisar(o), 0); else traer(); return () => { const i = oyentes.indexOf(o); if (i >= 0) oyentes.splice(i, 1); }; };
  const db = {
    doc(ruta) {
      return {
        async set(datos) {
          enVuelo++; ultimaEscritura = Date.now();
          const copia = JSON.parse(JSON.stringify(datos));
          try {
            let ultimo;
            for (let i = 0; i < 3; i++) { // reintenta si se corta la señal un momento
              try { await pedir("doc/" + ruta, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(copia) }); ultimo = null; break; }
              catch (e) { ultimo = e; if (e.code === "not_granted" || (e.status && e.status < 500)) break; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
            }
            if (ultimo) throw ultimo;
            cache.set(ruta, congelar(copia));
          } finally { enVuelo--; ultimaEscritura = Date.now(); }
        },
        async get() { if (!cargado) await traer(); return snapDoc(ruta); },
        onSnapshot(f, err) { return escuchar({ ruta, f, err }); },
      };
    },
    collection(col) { return { onSnapshot(f, err) { return escuchar({ col, f, err }); } }; },
  };

  // ---------- Fotos ----------
  async function reducir(blob) {
    try {
      const img = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      return await new Promise((ok) => cv.toBlob((b) => ok(b || blob), "image/jpeg", 0.82));
    } catch (e) { return blob; }
  }
  const urls = new Map();
  window.catedralFoto = (id) => {
    if (!urls.has(id)) urls.set(id, pedir("foto/" + id).then((r) => r.blob()).then((b) => URL.createObjectURL(b)));
    return urls.get(id);
  };
  const assets = {
    async upload(blob) {
      const b = await reducir(blob);
      const tipo = /^image\/(jpeg|png|webp)$/.test(b.type) ? b.type : "image/jpeg";
      const r = await (await pedir("foto", { method: "POST", headers: { "Content-Type": tipo }, body: b })).json();
      urls.set(r.id, Promise.resolve(URL.createObjectURL(b)));
      return { id: r.id, url: "", contentType: tipo, sizeBytes: b.size };
    },
  };
  // Las imágenes llegan como <img data-foto="id">: se piden con la clave y se muestran.
  new MutationObserver(() => {
    for (const img of document.querySelectorAll("img[data-foto]:not([src])")) {
      img.setAttribute("src", "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==");
      window.catedralFoto(img.dataset.foto).then((u) => { img.src = u; }, () => img.remove());
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Para la puerta pública (index.html): saber si hay clave, mostrar «Entrar» y bajar la página privada.
  window.catedral = {
    clave: () => clave,
    entrar: (msg) => pantallaEntrar(msg),
    app: async () => (await pedir("app")).json(),
  };

  window.claude = {
    use: async (nombre) => {
      if (!clave) { if (nombre === "db") { if (document.body) pantallaEntrar(); else addEventListener("DOMContentLoaded", () => pantallaEntrar()); } return null; }
      if (nombre === "db") return db;
      if (nombre === "assets") return assets;
      return null; // Claude (sample) no está fuera de claude.ai: las fotos quedan para que Claude las calcule después
    },
  };
})();
