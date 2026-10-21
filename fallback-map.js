/* OSISTEC: mapa offline 2D de compatibilidade, sem WebGL, workers, rede ou bibliotecas. */
(() => {
  'use strict';
  const RAD = Math.PI / 180;
  const latFactor = Math.cos(-22.36 * RAD);
  const limit = (v, a, b) => Math.min(b, Math.max(a, v));
  const earthPixel = (zoom) => 256 * (2 ** zoom) / 360;

  class FallbackMap {
    constructor({container, center, zoom, minZoom = 11, maxZoom = 18, maxBounds, roads}) {
      this.host = typeof container === 'string' ? document.getElementById(container) : container;
      if (!this.host) throw new Error('Área do mapa indisponível');
      this.roads = roads;
      this.center = [...center];
      this.zoom = zoom;
      this.minZoom = minZoom;
      this.maxZoom = maxZoom;
      this.maxBounds = maxBounds;
      this.listeners = {};
      this.sources = new Map();
      this.layers = new Map();
      this.pointers = new Map();
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'osistec-fallback-canvas';
      Object.assign(this.canvas.style, {position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', touchAction:'none', cursor:'grab'});
      this.host.style.position = 'relative';
      this.host.prepend(this.canvas);
      this.ctx = this.canvas.getContext('2d', {alpha:false});
      if (!this.ctx) throw new Error('O navegador não permite desenhar o mapa 2D');
      this.installEvents();
      this.resize();
      setTimeout(() => this.emit('load'), 0);
    }
    on(name, layerOrListener, listener) {
      (this.listeners[name] ||= []).push(typeof layerOrListener === 'string' ? {layer:layerOrListener, fn:listener} : {fn:layerOrListener});
      return this;
    }
    emit(name, event = {}) { for (const item of this.listeners[name] || []) if (!item.layer) item.fn(event); }
    getCanvas() { return this.canvas; }
    addControl() {
      const box = document.createElement('div');
      box.className = 'maplibregl-ctrl maplibregl-ctrl-group osistec-fallback-controls';
      Object.assign(box.style, {position:'absolute', top:'12px', left:'12px', zIndex:'3'});
      for (const [label, step, title] of [['+',1,'Aproximar'],['−',-1,'Afastar']]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.title = title;
        Object.assign(button.style, {fontSize:'24px', width:'30px', height:'30px', cursor:'pointer'});
        button.addEventListener('click', () => this.changeZoom(step));
        box.append(button);
      }
      this.host.append(box);
      return this;
    }
    addSource(id, spec) { this.sources.set(id,{data:spec.data,setData:(data)=>{this.sources.get(id).data = data;this.draw();}});this.draw(); }
    getSource(id) { return this.sources.get(id); }
    removeSource(id) { this.sources.delete(id); this.draw(); }
    addLayer(layer) { this.layers.set(layer.id,layer); this.draw(); }
    getLayer(id) { return this.layers.get(id); }
    removeLayer(id) { this.layers.delete(id); this.draw(); }
    flyTo({center,zoom}) { this.center=[...center];if(Number.isFinite(zoom))this.zoom=limit(zoom,this.minZoom,this.maxZoom);this.clampCenter();this.draw(); }
    fitBounds(bounds,opts={}) {
      const rect = this.canvas.getBoundingClientRect();
      const pad = opts.padding || {};
      const width=Math.max(60,rect.width-(pad.left||0)-(pad.right||0));
      const height=Math.max(60,rect.height-(pad.top||0)-(pad.bottom||0));
      const longitude=Math.abs(bounds[1][0]-bounds[0][0])*latFactor;
      const latitude=Math.abs(bounds[1][1]-bounds[0][1]);
      const desired=Math.min(width/Math.max(0.001,longitude),height/Math.max(0.001,latitude));
      this.zoom=limit(Math.log2(desired*360/256),this.minZoom,Math.min(this.maxZoom,opts.maxZoom||this.maxZoom));
      this.center=[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2];
      this.clampCenter(); this.draw();
    }
    clampCenter() {
      if (!this.maxBounds)return;
      this.center[0]=limit(this.center[0],this.maxBounds[0][0],this.maxBounds[1][0]);
      this.center[1]=limit(this.center[1],this.maxBounds[0][1],this.maxBounds[1][1]);
    }
    project([lon,lat]) {
      const scale=earthPixel(this.zoom);
      return [(lon-this.center[0])*scale*latFactor+this.canvas.clientWidth/2,(this.center[1]-lat)*scale+this.canvas.clientHeight/2];
    }
    unproject([x,y]) {
      const scale=earthPixel(this.zoom);
      return [this.center[0]+(x-this.canvas.clientWidth/2)/(scale*latFactor),this.center[1]-(y-this.canvas.clientHeight/2)/scale];
    }
    changeZoom(step,point) {
      const anchor=point||[this.canvas.clientWidth/2,this.canvas.clientHeight/2];
      const coord=this.unproject(anchor);
      this.zoom=limit(this.zoom+step,this.minZoom,this.maxZoom);
      const after=this.unproject(anchor);
      this.center[0]+=coord[0]-after[0];this.center[1]+=coord[1]-after[1];
      this.clampCenter();this.draw();
    }
    installEvents() {
      this.canvas.addEventListener('wheel', e => {e.preventDefault();const r=this.canvas.getBoundingClientRect();this.changeZoom(e.deltaY<0?.5:-.5,[e.clientX-r.left,e.clientY-r.top]);},{passive:false});
      this.canvas.addEventListener('pointerdown', e => {
        this.canvas.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
        this.dragged=false;
        if(this.pointers.size===2){const p=[...this.pointers.values()];this.pinchStart=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);}
      });
      this.canvas.addEventListener('pointermove', e => {
        const old=this.pointers.get(e.pointerId);
        if(!old)return;
        this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
        if(this.pointers.size===2){
          const p=[...this.pointers.values()];const dist=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);
          if(this.pinchStart>0 && dist>0)this.changeZoom(Math.log2(dist/this.pinchStart));
          this.pinchStart=dist;this.dragged=true;return;
        }
        const dx=e.clientX-old[0],dy=e.clientY-old[1];
        if(Math.abs(dx)+Math.abs(dy)>1){this.dragged=true;const scale=earthPixel(this.zoom);this.center[0]-=dx/(scale*latFactor);this.center[1]+=dy/scale;this.clampCenter();this.draw();}
      });
      const finish=e=>{
        if(!this.pointers.has(e.pointerId))return;
        this.pointers.delete(e.pointerId);
        if(e.type==='pointerup'&&!this.dragged){
          const r=this.canvas.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;
          const facilities=this.sources.get('osistec-facilities-source')?.data?.features || [];
          for(const f of [...facilities].reverse()){
            const [x,y]=this.project(f.geometry.coordinates);
            if(Math.hypot(px-x,py-y)<24){for(const item of this.listeners.click||[])if(item.layer==='osistec-facilities')item.fn({features:[f]});break;}
          }
        }
      };
      this.canvas.addEventListener('pointerup',finish);
      this.canvas.addEventListener('pointercancel',finish);
      window.addEventListener('resize',()=>this.resize());
    }
    resize() {
      const rect=this.canvas.getBoundingClientRect();
      const dpr=Math.min(2,window.devicePixelRatio||1);
      this.canvas.width=Math.max(1,Math.round(rect.width*dpr));this.canvas.height=Math.max(1,Math.round(rect.height*dpr));
      this.ctx.setTransform(dpr,0,0,dpr,0,0);this.draw();
    }
    draw() {
      const ctx=this.ctx;if(!ctx||!this.canvas.width)return;
      const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle='#eaf2ee';ctx.fillRect(0,0,w,h);
      // Use the same offline road network as the routing engine: never query a server.
      const ways=this.roads?.ways||[],nodes=this.roads?.nodes||[];
      const drawRoads=(outline)=>{
        for(const [indices,,speed] of ways){
          if(indices.length<2)continue;
          const coords=indices.map(index=>this.project(nodes[index]));
          if(coords.every(([x,y])=>x< -30||y< -30||x>w+30||y>h+30))continue;
          ctx.beginPath();coords.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
          const major=speed>=55;
          ctx.strokeStyle=outline?(major?'#c8d5d3':'#dae3e0'):(major?'#ffffff':'#fdfefd');
          ctx.lineWidth=(major?4.4:2.4)*(this.zoom>=14?1.5:1)+(outline?2.5:0);
          ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
        }
      };
      drawRoads(true);drawRoads(false);
      const route=this.sources.get('osistec-route-source')?.data?.geometry?.coordinates;
      if(route?.length>1){ctx.beginPath();route.forEach((point,i)=>{const [x,y]=this.project(point);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#087e73';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();}
      const facilities=this.sources.get('osistec-facilities-source')?.data?.features || [];
      for(const f of facilities){
        const [x,y]=this.project(f.geometry.coordinates);if(x< -30||y< -30||x>w+30||y>h+30)continue;
        if(f.properties.selected){ctx.beginPath();ctx.arc(x,y,23,0,Math.PI*2);ctx.fillStyle='rgba(39,200,182,.28)';ctx.fill();}
        ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);
        ctx.fillStyle=({low:'#15966f',medium:'#ce8121',full:'#c84848'})[f.properties.status]||'#278fbc';ctx.fill();
        ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();
        ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 20px sans-serif';ctx.fillText('+',x,y-1);
      }
      const positions=this.sources.get('osistec-user-position-source')?.data?.features||[];
      for(const f of positions){const [x,y]=this.project(f.geometry.coordinates);ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fillStyle='#277fd2';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}
      ctx.fillStyle='rgba(20,64,65,.75)';ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.fillText('Mogi Guaçu · mapa offline',12,h-15);
    }
  }
  window.OSISTECFallbackMap=FallbackMap;
})();
