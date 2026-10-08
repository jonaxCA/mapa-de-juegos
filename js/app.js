/* ==========================================================================
   Mapa de juegos
   Recomendador basado en PCA (SVD) de la matriz usuario-juego.
   Todo se calcula en el navegador a partir de data/juegos.js.
   ========================================================================== */
(() => {
  'use strict';

  const D = window.DATOS;
  const CONFIG = window.CONFIG || {};
  const MIN_CALIFICACIONES = 5;
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const num = new Intl.NumberFormat('es-MX');
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  /* ------------------------------------------------------------------------
     Datos y modelo
     ------------------------------------------------------------------------ */
  const juegos = D.juegos;
  const N = juegos.length;
  const K = D.k;

  // Vectores de cada juego (N x K), guardados como enteros de 16 bits en base64
  const V = (() => {
    const bin = atob(D.vectores);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const enteros = new Int16Array(bytes.buffer);
    const v = new Float32Array(enteros.length);
    for (let i = 0; i < enteros.length; i++) v[i] = enteros[i] / D.escala;
    return v;
  })();

  // Raíz del número de personas que calificaron cada juego: compensa la popularidad
  const raizN = Float32Array.from(juegos, (j) => Math.sqrt(j.n));

  const normalizar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  juegos.forEach((j, i) => { j.id = i; j.busqueda = normalizar(j.t); });

  const NOMBRE_FAMILIA = { nintendo: 'Nintendo', playstation: 'PlayStation', xbox: 'Xbox', pc: 'PC', otra: 'Otra' };

  function punto(a, b) {
    let s = 0;
    const oa = a * K, ob = b * K;
    for (let k = 0; k < K; k++) s += V[oa + k] * V[ob + k];
    return s;
  }

  // Peso de cada calificación: 5 → +3, 4 → +2, 3 → +1, 2 → 0, 1 → −1
  const peso = (estrellas) => estrellas - 2;

  function perfil(calif) {
    const u = new Float32Array(K);
    for (const [id, s] of calif) {
      const w = peso(s) / raizN[id];
      if (w === 0) continue;
      const o = id * K;
      for (let k = 0; k < K; k++) u[k] += w * V[o + k];
    }
    return u;
  }

  function recomendar(calif, ocultos, cuantos) {
    const u = perfil(calif);
    const puntajes = [];
    for (let j = 0; j < N; j++) {
      if (calif.has(j) || ocultos.has(j)) continue;
      let s = 0;
      const o = j * K;
      for (let k = 0; k < K; k++) s += u[k] * V[o + k];
      puntajes.push([j, s * raizN[j]]);
    }
    puntajes.sort((a, b) => b[1] - a[1]);
    return puntajes.slice(0, cuantos).map(([id, puntaje]) => {
      // El juego calificado que más empuja esta recomendación
      let razon = null, mejor = 0;
      for (const [cid, s] of calif) {
        if (peso(s) <= 0) continue;
        const c = (peso(s) / raizN[cid]) * punto(cid, id);
        if (c > mejor) { mejor = c; razon = cid; }
      }
      return { id, puntaje, razon };
    });
  }

  /* Coordenadas para el mapa: componente reescalado con arcsinh para que los
     extremos no aplasten al resto de los puntos. */
  const escalaComp = new Map();
  function escalaDe(c) {
    if (!escalaComp.has(c)) {
      const abs = Array.from({ length: N }, (_, j) => Math.abs(V[j * K + c])).sort((a, b) => a - b);
      escalaComp.set(c, abs[Math.floor(0.98 * (N - 1))]);
    }
    return escalaComp.get(c);
  }
  const ASINH = Math.asinh(2.5);
  const coord = (j, c) => Math.asinh((2.5 * V[j * K + c]) / escalaDe(c)) / ASINH;

  function posicionUsuario(calif, cx, cy) {
    let sx = 0, sy = 0, sw = 0;
    for (const [id, s] of calif) {
      const w = Math.max(peso(s), 0);
      if (!w) continue;
      sx += w * coord(id, cx); sy += w * coord(id, cy); sw += w;
    }
    return sw ? { x: sx / sw, y: sy / sw } : null;
  }

  /* ------------------------------------------------------------------------
     Estado (se guarda en el navegador si se puede)
     ------------------------------------------------------------------------ */
  const CLAVE_ALMACEN = `mapa-juegos-v1-${N}`;
  const estado = { calif: new Map(), ocultos: new Set() };

  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ALMACEN) || 'null');
    if (guardado) {
      for (const [id, s] of guardado.calif || []) if (id >= 0 && id < N && s >= 1 && s <= 5) estado.calif.set(id, s);
      for (const id of guardado.ocultos || []) if (id >= 0 && id < N) estado.ocultos.add(id);
    }
  } catch (e) { /* almacenamiento no disponible: la app funciona igual */ }

  function guardar() {
    try {
      localStorage.setItem(CLAVE_ALMACEN, JSON.stringify({ calif: [...estado.calif], ocultos: [...estado.ocultos] }));
    } catch (e) { /* sin almacenamiento */ }
  }

  /* ------------------------------------------------------------------------
     Utilidades de interfaz
     ------------------------------------------------------------------------ */
  const ICONO_ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.2 2.65 5.4 5.95.86-4.3 4.2 1.02 5.92L12 16.78 6.68 19.58 7.7 13.66 3.4 9.46l5.95-.86z"/></svg>';

  function metaJuego(j) {
    const plataformas = j.p.length > 3 ? `${j.p.slice(0, 3).join(', ')} y ${j.p.length - 3} más` : j.p.join(', ');
    return [plataformas, j.y].filter(Boolean).join(', ');
  }

  function colorFamilia(f) { return `var(--${f})`; }

  function crearPortadilla(j, clase = '') {
    const caja = document.createElement('div');
    caja.className = `portadilla ${clase}`.trim();
    caja.style.setProperty('--color-fam', colorFamilia(j.f));
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    const respaldo = () => {
      caja.classList.add('sin-imagen');
      if (!caja.querySelector('.portadilla__respaldo')) {
        const r = document.createElement('span');
        r.className = 'portadilla__respaldo';
        r.textContent = j.t;
        caja.append(r);
      }
    };
    img.addEventListener('error', respaldo, { once: true });
    if (j.i) img.src = j.i; else respaldo();
    caja.prepend(img);
    return caja;
  }

  let temporizadorAviso = null;
  function avisar(texto, accion) {
    const aviso = $('#aviso');
    aviso.replaceChildren();
    const p = document.createElement('span');
    p.textContent = texto;
    aviso.append(p);
    if (accion) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = accion.texto;
      b.addEventListener('click', () => { accion.hacer(); aviso.hidden = true; });
      aviso.append(b);
    }
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 5000);
  }

  /* ------------------------------------------------------------------------
     Estrellas (un grupo por juego; varias copias se mantienen sincronizadas)
     ------------------------------------------------------------------------ */
  const gruposEstrellas = new Map();

  function crearEstrellas(id) {
    const j = juegos[id];
    const grupo = document.createElement('div');
    grupo.className = 'estrellas';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', `Calificación para ${j.t}`);
    grupo.dataset.id = id;
    for (let s = 1; s <= 5; s++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'estrella';
      b.dataset.s = s;
      b.innerHTML = ICONO_ESTRELLA;
      b.setAttribute('aria-label', s === 1 ? '1 estrella' : `${s} estrellas`);
      grupo.append(b);
    }
    grupo.addEventListener('click', (e) => {
      const b = e.target.closest('.estrella');
      if (!b) return;
      const s = Number(b.dataset.s);
      const nuevo = estado.calif.get(id) === s ? 0 : s;
      calificar(id, nuevo, grupo);
      if (nuevo && !reducido) {
        $$('.estrella', grupo).slice(0, s).forEach((x, i) => {
          x.classList.remove('pop');
          void x.offsetWidth;
          x.style.setProperty('animation-delay', `${i * 35}ms`);
          x.classList.add('pop');
        });
      }
    });
    grupo.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.estrella');
      if (!b) return;
      const s = Number(b.dataset.s);
      grupo.classList.add('vista-previa');
      $$('.estrella', grupo).forEach((x, i) => x.classList.toggle('previa', i < s));
    });
    grupo.addEventListener('pointerleave', () => grupo.classList.remove('vista-previa'));
    // Un solo tabulador por grupo; las flechas cambian de estrella
    grupo.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const botones = $$('.estrella', grupo);
      const i = botones.indexOf(document.activeElement);
      let n = i;
      if (e.key === 'ArrowRight') n = Math.min(4, i + 1);
      if (e.key === 'ArrowLeft') n = Math.max(0, i - 1);
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = 4;
      e.preventDefault();
      botones.forEach((b, k) => { b.tabIndex = k === n ? 0 : -1; });
      botones[n].focus();
    });
    if (!gruposEstrellas.has(id)) gruposEstrellas.set(id, new Set());
    gruposEstrellas.get(id).add(grupo);
    pintarEstrellas(grupo, estado.calif.get(id) || 0);
    return grupo;
  }

  function pintarEstrellas(grupo, s) {
    $$('.estrella', grupo).forEach((b, i) => {
      b.classList.toggle('llena', i < s);
      b.setAttribute('aria-pressed', String(i + 1 === s));
      b.tabIndex = (s ? i + 1 === s : i === 0) ? 0 : -1;
    });
  }

  function sincronizarEstrellas(id) {
    const grupos = gruposEstrellas.get(id);
    if (!grupos) return;
    for (const g of grupos) {
      if (!g.isConnected) { grupos.delete(g); continue; }
      pintarEstrellas(g, estado.calif.get(id) || 0);
    }
  }

  /* ------------------------------------------------------------------------
     Cambios de calificación
     ------------------------------------------------------------------------ */
  function calificar(id, estrellas, origen) {
    if (estrellas) {
      estado.calif.set(id, estrellas);
      estado.ocultos.delete(id);
    } else {
      estado.calif.delete(id);
    }
    guardar();
    sincronizarEstrellas(id);
    $$(`.juego[data-id="${id}"]`).forEach((el) => el.classList.toggle('calificado', estado.calif.has(id)));
    actualizarContadores(true);
    if (vistaActual === 'califica' && $('#solo-calificados').checked && !estrellas) renderRejilla();
    if (vistaActual === 'para-ti') {
      const li = origen && origen.closest('.reco');
      if (li && estrellas) {
        li.classList.add('saliendo');
        setTimeout(renderParaTi, reducido ? 0 : 260);
      } else {
        renderParaTi();
      }
    }
    mapas.forEach((m) => m.actualizarResaltes());
  }

  function actualizarContadores(animar) {
    const n = estado.calif.size;
    const contador = $('.contador');
    $('#contador').textContent = `${num.format(n)} ${n === 1 ? 'calificado' : 'calificados'}`;
    contador.classList.toggle('activo', n > 0);
    if (animar && !reducido) {
      contador.classList.remove('latido');
      void contador.offsetWidth;
      contador.classList.add('latido');
    }
    const listo = n >= MIN_CALIFICACIONES;
    $('#progreso-relleno').style.width = `${Math.min(n / MIN_CALIFICACIONES, 1) * 100}%`;
    $('#progreso').classList.toggle('listo', listo);
    $('#progreso-boton').setAttribute('aria-disabled', String(!listo));
    $('#progreso-texto').textContent = listo
      ? 'Ya tienes recomendaciones. Entre más juegos califiques, más precisas serán.'
      : n === 0
        ? `Califica ${MIN_CALIFICACIONES} juegos para ver tus recomendaciones`
        : `Llevas ${n} de ${MIN_CALIFICACIONES}. Califica ${MIN_CALIFICACIONES - n} más para ver tus recomendaciones`;
  }

  /* ------------------------------------------------------------------------
     Mapa en canvas
     ------------------------------------------------------------------------ */
  const mapas = [];
  let colores = {};

  function leerColores() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    colores = {
      nintendo: v('--nintendo'), playstation: v('--playstation'), xbox: v('--xbox'), pc: v('--pc'), otra: v('--otra'),
      tinta: v('--tinta'), tinta3: v('--tinta-3'), linea: v('--linea'), papel: v('--papel'), papelAlto: v('--papel-alto'),
      ambar: v('--ambar'), ambarBorde: v('--ambar-borde'),
    };
  }

  // Orden de dibujo: primero los poco jugados, encima los populares
  const ordenDibujo = Array.from({ length: N }, (_, i) => i).sort((a, b) => juegos[a].n - juegos[b].n);
  const facil = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class Mapa {
    constructor(figura, opciones = {}) {
      this.figura = figura;
      this.canvas = $('canvas', figura);
      this.ctx = this.canvas.getContext('2d');
      this.ficha = $('.mapa__ficha', figura);
      this.ejes = opciones.ejes || [2, 3];
      this.conResaltes = opciones.conResaltes !== false;
      this.ejesVisibles = !!opciones.ejesVisibles;
      this.margen = opciones.margen ?? 28;
      this.enfocar = !!opciones.enfocar;
      this.vista = { x0: -1.2, x1: 1.2, y0: -1.2, y1: 1.2 };
      this.x = new Float32Array(N); this.y = new Float32Array(N);
      this.desdeX = new Float32Array(N); this.desdeY = new Float32Array(N);
      this.retraso = new Float32Array(N);
      this.animando = false;
      this.hover = -1;
      this.fijo = -1;
      this.recos = [];
      this.tu = null;
      this.ponerEjes(this.ejes[0], this.ejes[1], false);
      this.redimensionar();
      new ResizeObserver(() => this.redimensionar()).observe(figura);
      this.eventos();
      mapas.push(this);
    }

    destino(j) { return [coord(j, this.ejes[0]), coord(j, this.ejes[1])]; }

    ponerEjes(cx, cy, animar = true) {
      this.ejes = [cx, cy];
      if (!animar || reducido || !this.w) {
        for (let j = 0; j < N; j++) { const [a, b] = this.destino(j); this.x[j] = a; this.y[j] = b; }
        this.actualizarResaltes();
        return;
      }
      this.desdeX.set(this.x); this.desdeY.set(this.y);
      this.retraso.fill(0);
      this.animar(750, 0);
      this.actualizarResaltes(false);
    }

    // Animación de entrada: los juegos empiezan ordenados en una rejilla y viajan a su lugar en el mapa
    entrada() {
      if (reducido) return;
      const cols = Math.ceil(Math.sqrt(N * (this.w / Math.max(this.h, 1))));
      const filas = Math.ceil(N / cols);
      const familias = ['nintendo', 'playstation', 'xbox', 'pc', 'otra'];
      const orden = Array.from({ length: N }, (_, i) => i)
        .sort((a, b) => familias.indexOf(juegos[a].f) - familias.indexOf(juegos[b].f) || juegos[b].n - juegos[a].n);
      orden.forEach((j, k) => {
        const c = k % cols, f = Math.floor(k / cols);
        this.desdeX[j] = -1 + (2 * (c + 0.5)) / cols;
        this.desdeY[j] = 1 - (2 * (f + 0.5)) / filas;
        this.retraso[j] = (c / cols) * 0.35 + Math.random() * 0.25;
      });
      this.x.set(this.desdeX); this.y.set(this.desdeY);
      this.dibujar();
      setTimeout(() => this.animar(1700, 1), 450);
    }

    animar(duracion, conRetraso) {
      const inicio = performance.now();
      const total = duracion * (1 + 0.6 * conRetraso);
      this.animando = true;
      const paso = (ahora) => {
        const t = Math.min((ahora - inicio) / total, 1);
        for (let j = 0; j < N; j++) {
          const r = this.retraso[j] * conRetraso;
          const u = facil(Math.min(Math.max((t * (1 + 0.6 * conRetraso) - r) / 1, 0), 1));
          const [a, b] = this.destino(j);
          this.x[j] = this.desdeX[j] + (a - this.desdeX[j]) * u;
          this.y[j] = this.desdeY[j] + (b - this.desdeY[j]) * u;
        }
        this.dibujar();
        if (t < 1) requestAnimationFrame(paso);
        else { this.animando = false; this.actualizarResaltes(); }
      };
      requestAnimationFrame(paso);
    }

    actualizarResaltes(redibujar = true) {
      if (this.conResaltes) {
        this.tu = posicionUsuario(estado.calif, this.ejes[0], this.ejes[1]);
        this.recos = estado.calif.size >= MIN_CALIFICACIONES ? recomendacionesActuales().slice(0, 10).map((r) => r.id) : [];
      }
      if (redibujar && !this.animando) this.dibujar();
      if (this.enfocar && !this.animando) this.moverVista(this.vistaObjetivo());
    }

    redimensionar() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * this.dpr);
      this.canvas.height = Math.round(r.height * this.dpr);
      this.escalaPunto = Math.min(Math.max(Math.min(this.w, this.h) / 560, 0.75), 1.25);
      if (this.enfocar) this.vista = this.vistaObjetivo();
      this.dibujar();
    }

    aPxCoord(x, y) {
      const m = this.margen, v = this.vista;
      return [m + ((x - v.x0) / (v.x1 - v.x0)) * (this.w - 2 * m), m + ((v.y1 - y) / (v.y1 - v.y0)) * (this.h - 2 * m)];
    }

    aPx(j) { return this.aPxCoord(this.x[j], this.y[j]); }

    /* Acerca la vista a la zona donde están el usuario, sus juegos favoritos y sus recomendaciones */
    vistaObjetivo() {
      const completa = { x0: -1.2, x1: 1.2, y0: -1.2, y1: 1.2 };
      if (!this.enfocar || !this.tu || !this.w) return completa;
      const xs = [this.tu.x], ys = [this.tu.y];
      for (const id of this.recos) { xs.push(this.x[id]); ys.push(this.y[id]); }
      let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const proporcion = (this.w - 2 * this.margen) / (this.h - 2 * this.margen);
      let ancho = Math.max(x1 - x0, 0.5) * 1.5, alto = Math.max(y1 - y0, 0.5) * 1.5;
      if (ancho / alto > proporcion) alto = ancho / proporcion; else ancho = alto * proporcion;
      ancho = Math.min(ancho, 2.4); alto = Math.min(alto, 2.4);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return { x0: cx - ancho / 2, x1: cx + ancho / 2, y0: cy - alto / 2, y1: cy + alto / 2 };
    }

    moverVista(destino) {
      const desde = { ...this.vista };
      const igual = ['x0', 'x1', 'y0', 'y1'].every((k) => Math.abs(desde[k] - destino[k]) < 1e-3);
      if (igual) return;
      if (reducido) { this.vista = destino; this.dibujar(); return; }
      const inicio = performance.now();
      const paso = (ahora) => {
        const t = facil(Math.min((ahora - inicio) / 650, 1));
        for (const k of ['x0', 'x1', 'y0', 'y1']) this.vista[k] = desde[k] + (destino[k] - desde[k]) * t;
        this.dibujar();
        if (t < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }

    radio(j) { return (1.6 + Math.sqrt(juegos[j].n) / 8) * this.escalaPunto; }

    dibujar() {
      if (!this.w) return;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);

      if (this.ejesVisibles) {
        const [cx, cy] = this.aPxCoord(0, 0);
        ctx.strokeStyle = colores.linea; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(this.margen, cy); ctx.lineTo(this.w - this.margen, cy);
        ctx.moveTo(cx, this.margen); ctx.lineTo(cx, this.h - this.margen);
        ctx.stroke(); ctx.setLineDash([]);
      }

      const atenuar = this.conResaltes && (this.tu || this.recos.length) && !this.animando;
      ctx.globalAlpha = atenuar ? 0.32 : 0.8;
      for (const j of ordenDibujo) {
        const [px, py] = this.aPx(j);
        ctx.fillStyle = colores[juegos[j].f];
        ctx.beginPath(); ctx.arc(px, py, this.radio(j), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!this.animando && this.conResaltes) {
        // Juegos calificados: aro ámbar
        for (const [id] of estado.calif) {
          const [px, py] = this.aPx(id);
          ctx.fillStyle = colores[juegos[id].f];
          ctx.beginPath(); ctx.arc(px, py, this.radio(id), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = colores.ambar; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(px, py, this.radio(id) + 3.5, 0, Math.PI * 2); ctx.stroke();
        }
        // Recomendaciones: insignia con su número
        this.recos.forEach((id, k) => {
          const [px, py] = this.aPx(id);
          const r = 10;
          ctx.fillStyle = colores.tinta;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = colores[juegos[id].f]; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(px, py, r + 1.5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = colores.papel;
          ctx.font = '700 11px Archivo, system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), px, py + 0.5);
        });
        // Tú
        if (this.tu) {
          const [px, py] = this.aPxCoord(this.tu.x, this.tu.y);
          ctx.fillStyle = colores.ambar;
          ctx.strokeStyle = colores.tinta; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = '800 14px Archivo, system-ui, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4; ctx.strokeStyle = colores.papelAlto; ctx.lineJoin = 'round';
          ctx.strokeText('Tú', px + 16, py);
          ctx.fillStyle = colores.tinta;
          ctx.fillText('Tú', px + 16, py);
        }
      }

      const marcado = this.fijo >= 0 ? this.fijo : this.hover;
      if (marcado >= 0 && !this.animando) {
        const [px, py] = this.aPx(marcado);
        ctx.strokeStyle = colores.tinta; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, this.radio(marcado) + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }

    masCercano(mx, my, tolerancia) {
      let mejor = -1, d2min = tolerancia * tolerancia;
      for (let j = 0; j < N; j++) {
        const [px, py] = this.aPx(j);
        const d2 = (px - mx) ** 2 + (py - my) ** 2;
        if (d2 < d2min) { d2min = d2; mejor = j; }
      }
      return mejor;
    }

    eventos() {
      const pos = (e) => { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      this.canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || this.animando || this.fijo >= 0) return;
        const [mx, my] = pos(e);
        const j = this.masCercano(mx, my, 12);
        if (j !== this.hover) {
          this.hover = j;
          this.canvas.style.cursor = j >= 0 ? 'pointer' : 'default';
          this.mostrarFicha(j, false);
          this.dibujar();
        }
      });
      this.canvas.addEventListener('pointerleave', () => {
        if (this.fijo >= 0) return;
        this.hover = -1; this.mostrarFicha(-1); this.dibujar();
      });
      this.canvas.addEventListener('click', (e) => {
        if (this.animando) return;
        const [mx, my] = pos(e);
        const j = this.masCercano(mx, my, e.pointerType === 'mouse' ? 12 : 20);
        this.fijo = j;
        this.hover = -1;
        this.mostrarFicha(j, j >= 0);
        this.dibujar();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.fijo >= 0) this.cerrarFicha(); });
      document.addEventListener('pointerdown', (e) => {
        if (this.fijo >= 0 && !this.figura.contains(e.target)) this.cerrarFicha();
      });
    }

    cerrarFicha() { this.fijo = -1; this.mostrarFicha(-1); this.dibujar(); }

    mostrarFicha(j, fija) {
      const f = this.ficha;
      if (j < 0) { f.hidden = true; f.classList.remove('fija'); return; }
      const juego = juegos[j];
      f.replaceChildren();
      f.classList.toggle('fija', !!fija);
      f.style.setProperty('--sombra', colorFamilia(juego.f));
      if (fija) {
        const fila = document.createElement('div');
        fila.className = 'ficha__fila';
        const img = document.createElement('img');
        img.className = 'ficha__img';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.remove(), { once: true });
        if (juego.i) img.src = juego.i;
        const texto = document.createElement('div');
        texto.innerHTML = '<strong></strong><span class="ficha__meta"></span>';
        texto.querySelector('strong').textContent = juego.t;
        texto.querySelector('.ficha__meta').textContent = `${NOMBRE_FAMILIA[juego.f]}. ${metaJuego(juego)}`;
        fila.append(img, texto);
        const cerrar = document.createElement('button');
        cerrar.type = 'button'; cerrar.className = 'ficha__cerrar'; cerrar.textContent = '×';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.addEventListener('click', () => this.cerrarFicha());
        f.append(cerrar, fila, crearEstrellas(j));
      } else {
        f.innerHTML = '<strong></strong><span class="ficha__meta"></span>';
        f.querySelector('strong').textContent = juego.t;
        f.querySelector('.ficha__meta').textContent = metaJuego(juego);
      }
      f.hidden = false;
      const [px, py] = this.aPx(j);
      const fw = f.offsetWidth, fh = f.offsetHeight;
      let left = px + 14, top = py - fh - 10;
      if (left + fw > this.w - 4) left = px - fw - 14;
      if (top < 4) top = py + 14;
      left = Math.max(4, Math.min(left, this.w - fw - 4));
      f.style.left = `${left}px`;
      f.style.top = `${top}px`;
      if (fija) { const b = $('.estrella', f); if (b) b.focus({ preventScroll: true }); }
    }
  }

  /* Caché de recomendaciones para no recalcularlas por cada mapa */
  let cacheRecos = { clave: '', lista: [] };
  function recomendacionesActuales(cuantas = 48) {
    const clave = `${[...estado.calif].join(';')}|${[...estado.ocultos].join(',')}|${cuantas}`;
    if (cacheRecos.clave !== clave) cacheRecos = { clave, lista: recomendar(estado.calif, estado.ocultos, cuantas) };
    return cacheRecos.lista;
  }

  /* ------------------------------------------------------------------------
     Vista: Inicio
     ------------------------------------------------------------------------ */
  let mapaPortada = null;

  function prepararInicio() {
    $('#cifra-juegos').textContent = num.format(N);
    if (window.matchMedia('(hover: none)').matches) $('.mapa__pie').textContent = 'Toca un punto para ver el juego y calificarlo.';
    $('#fuente-datos').innerHTML =
      `El mapa se construyó con <b>${num.format(D.calificaciones)}</b> calificaciones que <b>${num.format(D.usuarios)}</b> personas dejaron en Amazon entre 1999 y 2023, sobre <b>${num.format(N)}</b> videojuegos.`;
    prepararVideo();
  }

  function idYoutube(url) {
    if (!url) return null;
    const limpio = String(url).trim();
    const m = limpio.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(limpio) ? limpio : null;
  }

  function prepararVideo() {
    const marco = $('#video-marco');
    const id = idYoutube(CONFIG.videoYoutube);
    if (!id) {
      marco.innerHTML = `
        <div class="video__pendiente">
          <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="10" width="38" height="28" rx="6"/><path d="m21 18 9 6-9 6z"/></svg>
          <strong>El video estará disponible pronto</strong>
          <span>Aquí aparecerá la explicación en video de cómo funciona el recomendador.</span>
        </div>`;
      return;
    }
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'video__fachada';
    boton.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`;
    boton.setAttribute('aria-label', 'Reproducir el video de explicación');
    boton.innerHTML = '<span class="video__play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg></span>';
    boton.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      iframe.title = 'Video de explicación del recomendador';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      marco.replaceChildren(iframe);
    });
    marco.replaceChildren(boton);
  }

  /* ------------------------------------------------------------------------
     Vista: Califica
     ------------------------------------------------------------------------ */
  const PAGINA = 48;
  const filtro = { texto: '', familia: '', soloCalificados: false, limite: PAGINA };

  function listaFiltrada() {
    const q = normalizar(filtro.texto);
    const palabras = q ? q.split(' ') : [];
    let lista = juegos.filter((j) =>
      (!filtro.familia || j.f === filtro.familia) &&
      (!filtro.soloCalificados || estado.calif.has(j.id)) &&
      palabras.every((p) => j.busqueda.includes(p)));
    if (q) {
      const rango = (j) => (j.busqueda.startsWith(q) ? 0 : j.busqueda.includes(q) ? 1 : 2);
      lista = lista.sort((a, b) => rango(a) - rango(b) || b.n - a.n);
    }
    return lista;
  }

  function renderRejilla() {
    const rejilla = $('#rejilla');
    const lista = listaFiltrada();
    const visibles = lista.slice(0, filtro.limite);
    const plantilla = $('#plantilla-juego');
    const fragmento = document.createDocumentFragment();
    for (const j of visibles) {
      const li = plantilla.content.firstElementChild.cloneNode(true);
      li.dataset.id = j.id;
      li.classList.toggle('calificado', estado.calif.has(j.id));
      li.querySelector('.portadilla').replaceWith(crearPortadilla(j));
      li.querySelector('.juego__titulo').textContent = j.t;
      li.querySelector('.juego__meta').textContent = metaJuego(j);
      li.querySelector('.estrellas').replaceWith(crearEstrellas(j.id));
      fragmento.append(li);
    }
    rejilla.replaceChildren(fragmento);
    if (!visibles.length) {
      const vacio = document.createElement('li');
      vacio.className = 'sin-resultados';
      vacio.innerHTML = filtro.soloCalificados && !estado.calif.size
        ? '<strong>Aún no calificas ningún juego</strong>Desactiva el filtro y empieza con los que conozcas.'
        : '<strong>No encontramos ese juego</strong>Prueba con otra palabra del título o quita el filtro de plataforma. El catálogo tiene los 1,433 juegos más calificados en Amazon.';
      rejilla.append(vacio);
    }
    const total = lista.length;
    $('#resultado').textContent = filtro.texto || filtro.familia || filtro.soloCalificados
      ? `${num.format(total)} ${total === 1 ? 'juego' : 'juegos'}`
      : `${num.format(total)} juegos, de los más calificados a los menos`;
    const mas = $('#mostrar-mas');
    mas.hidden = visibles.length >= total;
    mas.textContent = `Mostrar más juegos (${num.format(total - visibles.length)} restantes)`;
  }

  function prepararCalifica() {
    let espera;
    $('#buscar').addEventListener('input', (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => { filtro.texto = e.target.value; filtro.limite = PAGINA; renderRejilla(); }, 120);
    });
    $('#filtro-familia').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      filtro.familia = b.dataset.familia;
      filtro.limite = PAGINA;
      $$('#filtro-familia button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderRejilla();
    });
    $('#solo-calificados').addEventListener('change', (e) => {
      filtro.soloCalificados = e.target.checked; filtro.limite = PAGINA; renderRejilla();
    });
    $('#mostrar-mas').addEventListener('click', () => { filtro.limite += PAGINA; renderRejilla(); });
  }

  /* ------------------------------------------------------------------------
     Vista: Para ti
     ------------------------------------------------------------------------ */
  let mapaLado = null;
  let cuantasRecos = 12;

  function flip(lista, render) {
    const hijos = () => Array.from(lista.children).filter((el) => el.dataset.id !== undefined);
    const antes = new Map();
    hijos().forEach((el) => antes.set(el.dataset.id, el.getBoundingClientRect().top));
    render();
    if (reducido) return;
    let nuevos = 0;
    hijos().forEach((el) => {
      const a = antes.get(el.dataset.id);
      const b = el.getBoundingClientRect().top;
      if (a === undefined) {
        if (antes.size) el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 360, delay: Math.min(nuevos++ * 40, 400), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      } else if (Math.abs(a - b) > 1) {
        el.animate([{ transform: `translateY(${a - b}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
  }

  function renderParaTi() {
    const n = estado.calif.size;
    const listo = n >= MIN_CALIFICACIONES;
    $('#para-ti-vacio').hidden = listo;
    $('#para-ti-contenido').hidden = !listo;
    if (!listo) {
      $('#para-ti-bajada').textContent = '';
      $('#vacio-titulo').textContent = n ? `Llevas ${n} de ${MIN_CALIFICACIONES} calificaciones` : 'Todavía no hay recomendaciones';
      $('#vacio-texto').textContent = n
        ? `Califica ${MIN_CALIFICACIONES - n} ${MIN_CALIFICACIONES - n === 1 ? 'juego más' : 'juegos más'} y aquí aparecerán los que quedan más cerca de tus gustos.`
        : 'Califica por lo menos cinco juegos y aquí aparecerán los que quedan más cerca de tus gustos.';
      return;
    }
    const positivos = [...estado.calif.values()].filter((s) => peso(s) > 0).length;
    $('#para-ti-bajada').textContent = positivos
      ? `A partir de tus ${n} calificaciones. Si calificas más juegos, la lista se actualiza sola.`
      : 'Todas tus calificaciones son de 1 o 2 estrellas, así que solo sabemos qué evitar. Califica con 3 estrellas o más algún juego que te guste.';

    const recos = recomendacionesActuales(48).slice(0, cuantasRecos);
    const maximo = recos.length ? recos[0].puntaje : 1;
    const lista = $('#recos-lista');

    flip(lista, () => {
      const fragmento = document.createDocumentFragment();
      for (const r of recos) {
        const j = juegos[r.id];
        const li = document.createElement('li');
        li.className = 'reco';
        li.dataset.id = r.id;
        const info = document.createElement('div');
        info.className = 'reco__info';
        const titulo = document.createElement('h2');
        titulo.className = 'reco__titulo';
        titulo.textContent = j.t;
        const meta = document.createElement('p');
        meta.className = 'reco__meta';
        meta.textContent = metaJuego(j);
        const razon = document.createElement('p');
        razon.className = 'reco__razon';
        if (r.razon !== null) {
          const s = estado.calif.get(r.razon);
          razon.innerHTML = `Porque le diste ${s} ${s === 1 ? 'estrella' : 'estrellas'} a <b></b>`;
          razon.querySelector('b').textContent = juegos[r.razon].t;
        } else {
          razon.textContent = 'Cercano a tu perfil en general';
        }
        const afinidad = document.createElement('div');
        afinidad.className = 'afinidad';
        const pct = Math.max(4, Math.round((r.puntaje / maximo) * 100));
        afinidad.innerHTML = `<span>Afinidad</span><span class="afinidad__barra" role="img" aria-label="Afinidad: ${pct}% de la primera recomendación"><span style="--v:${pct}%"></span></span>`;
        const acciones = document.createElement('div');
        acciones.className = 'reco__acciones';
        acciones.innerHTML = `
          <button type="button" class="boton-chico reco__boton-jugado">Ya lo jugué</button>
          <span class="reco__calificar"><span>¿Cuántas estrellas le das?</span></span>
          <button type="button" class="boton-chico reco__boton-ocultar">No me interesa</button>`;
        $('.reco__calificar', acciones).append(crearEstrellas(r.id));
        $('.reco__boton-jugado', acciones).addEventListener('click', () => {
          li.classList.add('calificando');
          const b = $('.reco__calificar .estrella', li);
          if (b) b.focus();
        });
        $('.reco__boton-ocultar', acciones).addEventListener('click', () => ocultar(r.id, li));
        info.append(titulo, meta, razon, afinidad, acciones);
        li.append(crearPortadilla(j), info);
        fragmento.append(li);
      }
      lista.replaceChildren(fragmento);
    });

    $('#mostrar-mas-recos').hidden = cuantasRecos >= 48;
    if (!mapaLado) mapaLado = new Mapa($('#mapa-lado'), { ejes: [2, 3], ejesVisibles: true, margen: 22, enfocar: true });
    else mapaLado.actualizarResaltes();
  }

  function ocultar(id, li) {
    estado.ocultos.add(id);
    guardar();
    li.classList.add('saliendo');
    setTimeout(() => { renderParaTi(); mapas.forEach((m) => m.actualizarResaltes()); }, reducido ? 0 : 260);
    avisar(`Quitaste ${juegos[id].t} de tus recomendaciones`, {
      texto: 'Deshacer',
      hacer: () => { estado.ocultos.delete(id); guardar(); renderParaTi(); mapas.forEach((m) => m.actualizarResaltes()); },
    });
  }

  /* ------------------------------------------------------------------------
     Vista: Cómo funciona
     ------------------------------------------------------------------------ */
  const COMPONENTES = [
    { c: 1, neg: 'Clásicos de PS2, GameCube y GBA', pos: 'Juegos recientes' },
    { c: 2, neg: 'Acción y shooters de PS3 y Xbox 360', pos: 'Nintendo Switch e indies' },
    { c: 3, neg: 'Acción de PS2 y del primer Xbox', pos: 'Mario, Zelda y Smash' },
    { c: 4, neg: 'Juegos familiares y LEGO', pos: 'RPG japoneses' },
    { c: 5, neg: 'Final Fantasy y PlayStation', pos: 'Nintendo Switch' },
  ];
  let mapaExplorador = null;

  function ejemplos(c, signo) {
    const candidatos = juegos.filter((j) => j.n >= 120).map((j) => j.id);
    candidatos.sort((a, b) => signo * (V[b * K + c] - V[a * K + c]));
    return candidatos.slice(0, 2).map((id) => juegos[id].t).join(', ');
  }

  function textoPolo(el, direccion, etiqueta, ej) {
    el.innerHTML = '<span class="polo__dir"></span><b></b><br><span></span>';
    el.querySelector('.polo__dir').textContent = direccion;
    el.querySelector('b').textContent = etiqueta;
    el.querySelector('span:last-child').textContent = `Por ejemplo ${ej}`;
  }

  function actualizarPolos() {
    const [cx, cy] = mapaExplorador.ejes;
    const X = COMPONENTES.find((x) => x.c === cx), Y = COMPONENTES.find((x) => x.c === cy);
    textoPolo($('#polo-izq'), 'Izquierda', X.neg, ejemplos(cx, -1));
    textoPolo($('#polo-der'), 'Derecha', X.pos, ejemplos(cx, 1));
    textoPolo($('#polo-arr'), 'Arriba', Y.pos, ejemplos(cy, 1));
    textoPolo($('#polo-aba'), 'Abajo', Y.neg, ejemplos(cy, -1));
  }

  function prepararComo() {
    const casillas = D.usuarios * N;
    $('#texto-matriz').innerHTML =
      `Cada fila es una persona y cada columna un juego. Con <b>${num.format(D.usuarios)}</b> personas y <b>${num.format(N)}</b> juegos, la tabla tiene <b>${num.format(Math.round(casillas / 1e5) / 10)}</b> millones de casillas, pero solo <b>${num.format(D.calificaciones)}</b> tienen calificación: el <b>${(100 * D.calificaciones / casillas).toFixed(2)}%</b>.`;

    const matriz = $('#matriz');
    const frag = document.createDocumentFragment();
    D.muestra.forEach((fila) => fila.forEach((r) => {
      const s = document.createElement('span');
      if (r) { s.dataset.r = r; s.style.setProperty('--r', r); }
      frag.append(s);
    }));
    matriz.append(frag);
    const llenas = D.muestra.flat().filter(Boolean).length;
    $('.matriz figcaption').textContent =
      `Una muestra real: las 24 personas que más calificaron y los 36 juegos más calificados. Aun aquí, ${num.format(864 - llenas)} de 864 casillas están vacías. Más oscuro es más estrellas.`;

    const ex = $('#eje-x'), ey = $('#eje-y');
    for (const comp of COMPONENTES) {
      const texto = `Componente ${comp.c + 1}: ${comp.neg} contra ${comp.pos}`;
      ex.add(new Option(texto, comp.c));
      ey.add(new Option(texto, comp.c));
    }
    ex.value = 2; ey.value = 3;
    const cambiar = (e) => {
      let cx = Number(ex.value), cy = Number(ey.value);
      if (cx === cy) {
        const otro = e.target === ex ? ey : ex;
        const libre = COMPONENTES.find((x) => x.c !== cx).c;
        otro.value = libre;
        cx = Number(ex.value); cy = Number(ey.value);
      }
      mapaExplorador.cerrarFicha();
      mapaExplorador.ponerEjes(cx, cy, true);
      actualizarPolos();
    };
    ex.addEventListener('change', cambiar);
    ey.addEventListener('change', cambiar);

    const evaluacion = [
      { texto: 'Mapa de PCA (esta app)', v: 19.1, destacada: true },
      { texto: 'Los juegos más populares', v: 8.1 },
      { texto: 'Predecir estrellas con SoftImpute', v: 4.9 },
      { texto: 'Al azar', v: 0.7 },
    ];
    const maximo = 20;
    $('#barras-evaluacion').innerHTML = evaluacion.map((e) => `
      <li class="${e.destacada ? 'destacada' : ''}">
        <span>${e.texto}</span><span class="barras__valor">${e.v.toFixed(1)}%</span>
        <span class="barras__barra" aria-hidden="true"><span style="--v:${(e.v / maximo) * 100}%"></span></span>
      </li>`).join('');

    $$('.estrellas-fijas').forEach((el) => {
      const n = Number(el.dataset.n);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', n === 1 ? '1 estrella' : `${n} estrellas`);
      el.innerHTML = Array.from({ length: 5 }, (_, i) => ICONO_ESTRELLA.replace('<svg', `<svg class="${i < n ? '' : 'vacia'}"`)).join('');
    });
  }

  function renderComo() {
    if (!mapaExplorador) {
      mapaExplorador = new Mapa($('#mapa-explorador'), { ejes: [2, 3], ejesVisibles: true, margen: 26 });
      actualizarPolos();
    } else {
      mapaExplorador.actualizarResaltes();
    }
  }

  /* ------------------------------------------------------------------------
     Navegación entre vistas
     ------------------------------------------------------------------------ */
  const VISTAS = ['inicio', 'califica', 'para-ti', 'como-funciona'];
  let vistaActual = null;

  function mostrar(vista, ancla) {
    const cambio = vista !== vistaActual;
    vistaActual = vista;
    $$('.vista').forEach((s) => { s.hidden = s.dataset.vista !== vista; });
    $$('.nav a').forEach((a) => {
      if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = {
      inicio: 'Mapa de juegos',
      califica: 'Califica juegos · Mapa de juegos',
      'para-ti': 'Tus recomendaciones · Mapa de juegos',
      'como-funciona': 'Cómo funciona · Mapa de juegos',
    }[vista];
    if (vista === 'califica') renderRejilla();
    if (vista === 'para-ti') renderParaTi();
    if (vista === 'como-funciona') renderComo();
    if (vista === 'inicio' && mapaPortada) mapaPortada.redimensionar();
    mapas.forEach((m) => m.redimensionar());
    if (ancla) {
      const el = document.getElementById(ancla);
      if (el) el.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth' });
    } else if (cambio) {
      window.scrollTo(0, 0);
    }
  }

  function navegar() {
    const hash = decodeURIComponent(location.hash.slice(1));
    let vista = VISTAS.includes(hash) ? hash : null;
    let ancla = null;
    if (!vista) {
      const el = hash && document.getElementById(hash);
      const contenedor = el && el.closest('.vista');
      vista = contenedor ? contenedor.dataset.vista : 'inicio';
      ancla = contenedor ? hash : null;
    }
    const enfocar = () => { if (vista !== vistaActual) $('#contenido').focus({ preventScroll: true }); };
    if (document.startViewTransition && !reducido && vistaActual && vista !== vistaActual) {
      document.startViewTransition(() => { mostrar(vista, ancla); });
      enfocar();
    } else {
      enfocar();
      mostrar(vista, ancla);
    }
  }

  /* ------------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------------ */
  function iniciar() {
    leerColores();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { leerColores(); mapas.forEach((m) => m.dibujar()); });

    if (CONFIG.autor) $('#pie-autor').textContent = `Hecho por ${CONFIG.autor} para la materia Inteligencia Artificial, Universidad de Monterrey.`;

    prepararInicio();
    prepararCalifica();
    prepararComo();
    actualizarContadores(false);

    const barra = $('.barra');
    const bordeBarra = () => barra.classList.toggle('con-borde', window.scrollY > 8);
    window.addEventListener('scroll', bordeBarra, { passive: true });
    bordeBarra();

    $('#progreso-boton').addEventListener('click', (e) => {
      if (e.currentTarget.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });
    $('#mostrar-mas-recos').addEventListener('click', () => { cuantasRecos = Math.min(cuantasRecos + 12, 48); renderParaTi(); });

    window.addEventListener('hashchange', navegar);
    navegar();

    mapaPortada = new Mapa($('#mapa-portada'), { ejes: [2, 3], conResaltes: false, margen: 18 });
    const arrancarEntrada = () => {
      if (vistaActual === 'inicio' && mapaPortada.w) mapaPortada.entrada();
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(arrancarEntrada); else arrancarEntrada();
  }

  // Exponer el motor para pruebas desde la consola
  window.Recomendador = { recomendar, juegos, perfil, coord, estado };

  iniciar();
})();
