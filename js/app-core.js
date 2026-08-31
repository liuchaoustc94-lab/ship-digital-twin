/* ═══ OCEAN·DT 应用核心：场景·拾取·结构树·爆炸·剖切·相机·撤销 ═══ */
window.App = {
  state:{
    sel:[], hover:null, wireframe:false,
    explode:{cur:0,target:0,mode:'axis'},
    selEx:{cur:0,target:0},
    section:{mode:'off',val:0,box:[-112,112,-30,60,-60,60],visual:true},
    xray:{on:false,op:1},
    ghosted:null, focusOn:false,
    walk:{on:false},
    undoStack:[],redoStack:[]
  },
  entries:[],        // 爆炸偏移条目
  selEntries:[],     // 组件级爆炸条目
  externalModel:null,
  externalLoaded:false,
  baseRegistry:[],
  externalRegistry:[],
  baseByIdMap:{},
  externalByIdMap:{},
  activeByIdMap:{},
  $:(s)=>document.querySelector(s),
  $$:(s)=>[...document.querySelectorAll(s)]
};
const S=App.state;

/* ───────────────────────── 启动 ───────────────────────── */
window.addEventListener('three-ready',()=>App.start(window.__LIBS));

App.start=function({THREE,OrbitControls,GLTFLoader,RoomEnvironment}){
  const T=THREE; App.T=T; App.OrbitControls=OrbitControls; App.GLTFLoader=GLTFLoader;
  const vp=document.getElementById('vp');

  /* 渲染器 */
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
  renderer.localClippingEnabled=true;
  vp.appendChild(renderer.domElement);
  App.renderer=renderer;

  /* 场景 */
  const scene=new T.Scene();
  scene.background=new T.Color('#05080f');
  scene.fog=new T.Fog(0x05080f,650,1900);
  App.scene=scene;

  if(RoomEnvironment){
    const pm=new T.PMREMGenerator(renderer);
    scene.environment=pm.fromScene(new RoomEnvironment(),.04).texture;
    pm.dispose();
  }

  /* 相机 */
  const cam=new T.PerspectiveCamera(45,innerWidth/innerHeight,.5,5000);
  cam.position.set(138,82,138);
  App.cam=cam; App.camera=cam;
  const controls=new OrbitControls(cam,renderer.domElement);
  controls.target.set(0,8,0);
  controls.enableDamping=true; controls.dampingFactor=.08;
  controls.minDistance=6; controls.maxDistance=900; controls.maxPolarAngle=Math.PI*.52;
  App.controls=controls;

  /* 灯光 */
  scene.add(new T.HemisphereLight('#9db8d2','#16222f',.75));
  const sun=new T.DirectionalLight('#ffffff',1.7);
  sun.position.set(150,230,90); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); sun.shadow.bias=-.0004;
  Object.assign(sun.shadow.camera,{left:-170,right:170,top:170,bottom:-170,near:20,far:600});
  scene.add(sun);
  const fill=new T.DirectionalLight('#7fb2e8',.32);
  fill.position.set(-140,90,-150); scene.add(fill);

  /* 模型 */
  const model=ShipBuilder.build(T);
  App.model=model; scene.add(model.root);
  App.baseRegistry=model.registry;
  App.externalRegistry=[];
  App.registry=App.baseRegistry; // legacy aliases now always point at the active registry
  App.flow=model.flow;
  App.baseByIdMap={};
  model.registry.forEach(o=>{App.baseByIdMap[o.userData.meta.id]=o;});
  App.activeByIdMap=App.baseByIdMap;
  App.byIdMap=App.activeByIdMap;
  App.byId=id=>App.activeByIdMap[id]||null;
  App.water=model.water; App.axes=model.axes;
  App.hotspots=model.hotspots;

  /* 材质去共享 + 基线记录（保证逐对象高亮/透明互不影响） */
  model.registry.forEach(o=>App.eachMesh(o,m=>{
    m.material=m.material.clone();
    m.material.userData.baseOpacity=m.material.opacity;
    m.material.userData.baseEmissive=m.material.emissive?m.material.emissive.getHex():0;
    m.material.userData.baseEI=m.material.emissiveIntensity??1;
  }));
  /* 可拾取列表 */
  App.pickables=[];
  model.registry.forEach(o=>App.eachMesh(o,m=>App.pickables.push(m)));
  App.pickMeshSet=new Set(App.pickables);

  /* 视图立方 / 各子系统 */
  App.initViewCube();
  App.initUI();
  App.initFeatures();
  App.computeExplode();
  App.buildTree();
  App.buildBOM();
  App.updateStats();
  App.run('home');

  /* 默认载入 Blender 高保真船模；若静态资源不可达，保留内置示范船作为降级方案。 */
  if(!new URLSearchParams(location.search).has('demo')){
    setTimeout(()=>App.loadGLBUrl?.('models/ship-blender.glb','Blender 精细船模 · ship-blender.glb'),120);
  }

  setTimeout(()=>{document.getElementById('loader').classList.add('hidden');
    App.toast('数字样机就绪 · 点击部件查看属性，或按 F1 查看帮助');},350);

  /* ── 主循环（rAF + 看门狗：标签页被遮挡时由定时器兜底渲染） ── */
  const clock=new T.Clock();
  let frames=0,fpsT=0,lastFrame=performance.now();
  function step(){
    App._steps=(App._steps||0)+1;
    if(App._steps%30===1)document.body.setAttribute('data-steps',String(App._steps));
    const dt=Math.min(clock.getDelta(),.05);
    const t=clock.elapsedTime;
    if(!S.walk.on) controls.update();

    /* 爆炸动画 */
    App.animateEntries(App.entries,'explode',dt);
    App.animateEntries(App.selEntries,'selEx',dt);

    /* 飞行动画 */
    if(App.fly){
      const f=App.fly,k=Math.min(1,(performance.now()-f.t0)/(f.dur*1000)),
            e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
      cam.position.lerpVectors(f.p0,f.p1,e);
      controls.target.lerpVectors(f.t0v,f.t1,e);
      if(k>=1)App.fly=null;
    }

    App.tickFeatures(dt,t);          // 特性动画（流动/推进/雷达/漫游/漫游导览/测量标签）

    renderer.render(scene,cam);
    App.renderViewCube();
    frames++; fpsT+=dt;
    if(fpsT>=.5){App.$('#stFps').textContent=Math.round(frames/fpsT);frames=0;fpsT=0;}
  }
  function loop(){
    requestAnimationFrame(loop);
    lastFrame=performance.now();
    step();
  }
  loop();
  setInterval(function(){
    if(performance.now()-lastFrame>450){lastFrame=performance.now();step();}
  },250);
  renderer.domElement.addEventListener('webglcontextlost',function(e){
    document.title='WARN: WebGL 上下文丢失';
  });

  addEventListener('resize',()=>{
    cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix();
    if(App.oCam){App.oCam.left=-cam.aspect*App.oH;App.oCam.right=cam.aspect*App.oH;App.oCam.top=App.oH;App.oCam.bottom=-App.oH;App.oCam.updateProjectionMatrix();}
    renderer.setSize(innerWidth,innerHeight);
  });
};

/* 当前平台显示的模型根。外部 Blender 模型接入后，结构树、BOM、爆炸和幽灵模式只针对它工作。 */
App.modelRoots=function(){
  return App.externalModel?[App.externalModel]:(App.model?[...App.model.root.children]:[]);
};
App.activeRegistry=function(){
  return App.externalModel?App.externalRegistry:App.baseRegistry;
};
/* 功能层使用系统根，而结构树保留 Blender 的外部模型包装层。 */
App.featureRoots=function(){
  if(!App.externalModel)return App.model?[...App.model.root.children]:[];
  const stage=App.externalModel.children.find(c=>c.userData?.meta?.id==='EXT-BLENDER-SCENE')||App.externalModel.children[0];
  const systems=stage?.children?.filter(c=>c.userData?.meta?.kind==='sys')||[];
  return systems.length?systems:(stage?[stage]:[App.externalModel]);
};
App.worldVisible=function(obj){
  for(let n=obj;n;n=n.parent)if(n.visible===false)return false;
  return true;
};
App.hideProceduralDemo=function(){
  if(!App.model?.root)return;
  App.model.root.children.forEach(c=>{
    if(c!==App.externalModel&&c.userData.meta)c.visible=false;
  });
};

/* ───────────────────────── 通用工具 ───────────────────────── */
App.eachMesh=(obj,cb)=>{obj.traverse(n=>{if(n.isMesh&&n.material)cb(n);});};
App.toast=(msg,ms=2400)=>{
  const el=App.$('#toast'); el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(App._tt); App._tt=setTimeout(()=>el.classList.add('hidden'),ms);
};
App.hint=(t)=>{App.$('#hint').textContent=t;};
App.flyTo=function(pos,target,dur=1){
  App.controls.enabled=true;
  App.fly={p0:App.cam.position.clone(),t0v:App.controls.target.clone(),
           p1:new App.T.Vector3(...pos),t1:new App.T.Vector3(...target),t0:performance.now(),dur};
};
App.visibleBox=function(){
  const T=App.T,b=new T.Box3(),tmp=new T.Box3();
  App.activeRegistry().forEach(o=>{
    if(!App.worldVisible(o))return;
    let any=false; App.eachMesh(o,()=>any=true);
    if(!any)return;
    tmp.setFromObject(o);
    if(tmp.isEmpty()||!isFinite(tmp.min.x))return;
    b.union(tmp);
  });
  return b;
};
App.modelFocus=function(){
  const box=App.visibleBox();
  return box.isEmpty()?new App.T.Vector3(0,8,0):box.getCenter(new App.T.Vector3());
};
App.fitView=function(obj){
  const T=App.T;let box;
  if(obj){box=new T.Box3().setFromObject(obj);}
  else box=App.visibleBox();
  if(!box||box.isEmpty())return;
  const c=box.getCenter(new T.Vector3()),r=Math.max(box.getSize(new T.Vector3()).length()/2,8);
  const dir=App.cam.position.clone().sub(App.controls.target).normalize();
  App.flyTo(c.clone().addScaledVector(dir,r*2.6).toArray(),c.toArray(),.8);
};
App.preset=function(name){
  const focus=App.modelFocus();
  const P={
    home:[[150,92,152],focus.toArray()], vTop:[[0,300,.1],focus.toArray()], vBottom:[[0,-300,.1],focus.toArray()],
    vBow:[[230,34,0],focus.toArray()], vStern:[[-230,34,0],focus.toArray()],
    vPort:[[0,34,230],focus.toArray()], vStbd:[[0,34,-230],focus.toArray()]
  }[name];
  if(P)App.flyTo(P[0],P[1],.9);
};
App.orthoToggle=function(){
  const T=App.T;
  if(!App.oCam){
    const d=App.cam.position.distanceTo(App.controls.target),h=Math.tan(App.cam.fov*Math.PI/360)*d;
    const o=new T.OrthographicCamera(-h*App.cam.aspect,h*App.cam.aspect,h,-h,.1,5000);
    o.position.copy(App.cam.position); o.quaternion.copy(App.cam.quaternion);
    App.oCam=o; App.oH=h;
  }else{
    App.cam.position.copy(App.oCam.position); App.cam.quaternion.copy(App.oCam.quaternion);
    App.oCam=null;
  }
  const active=App.oCam||App.cam;
  const tgt=App.controls.target.clone();
  App.controls.dispose();
  App.controls=new App.OrbitControls(active,App.renderer.domElement);
  App.controls.target.copy(tgt);
  App.controls.enableDamping=true;App.controls.dampingFactor=.08;
  App.controls.minDistance=6;App.controls.maxDistance=900;App.controls.maxPolarAngle=Math.PI*.52;
  App.camActive=active;
  App.toast(App.oCam?'正交投影 Orthographic':'透视投影 Perspective');
};

/* ───────────────────────── 选择 / 悬停 ───────────────────────── */
App.clearHighlight=function(list){
  list.forEach(o=>App.eachMesh(o,m=>{
    const mat=m.material;
    if(mat.userData.baseEmissive!==undefined)
      mat.emissive.setHex(mat.userData.baseEmissive),mat.emissiveIntensity=mat.userData.baseEI;
    const e=m.getObjectByName('selEdges'); if(e)m.remove(e);
  }));
};
App.highlight=function(o,color){
  App.eachMesh(o,m=>{
    const mat=m.material;
    mat.emissive=new App.T.Color(color); mat.emissiveIntensity=.5;
    if(!m.getObjectByName('selEdges')){
      let tris=m.geometry.index?m.geometry.index.count/3:m.geometry.attributes.position.count/3;
      if(tris<40000){
        const e=new App.T.LineSegments(new App.T.EdgesGeometry(m.geometry,28),
          new App.T.LineBasicMaterial({color:0xff9a3c,toneMapped:false,transparent:true,opacity:.95}));
        e.name='selEdges'; e.userData.selectable=false; m.add(e);
      }
    }
  });
};
App.select=function(objs,opts={}){
  if(!Array.isArray(objs))objs=objs?[objs]:[];
  App.clearHighlight(S.sel);
  S.sel=objs;
  objs.forEach(o=>App.highlight(o,0xff9a3c));
  App.syncTreeSel();
  App.renderProps();
  if(objs.length===1&&opts.tree!==false)App.revealTree(objs[0]);
};
App.pickAt=function(x,y){
  const T=App.T;
  const r=new T.Raycaster();
  r.params.Points={threshold:2};
  const m=new T.Vector2((x/innerWidth)*2-1,-(y/innerHeight)*2+1);
  r.setFromCamera(m,App.camActive||App.cam);
  const hits=r.intersectObjects(App.pickables.concat(App.hotspots),false);
  for(const h of hits){
    let p=h.object,vis=true;
    p.traverseAncestors(a=>{if(a&&!a.visible)vis=false;});
    if(!p.visible)vis=false;
    if(vis)return h;
  }
  return null;
};

/* 视口指针事件 */
App.bindViewport=function(){
  const el=App.renderer.domElement;
  let dx=0,dy=0,down=false;
  el.addEventListener('pointerdown',e=>{down=true;dx=e.clientX;dy=e.clientY;});
  el.addEventListener('pointerup',e=>{
    if(!down)return; down=false;
    if(Math.hypot(e.clientX-dx,e.clientY-dy)>5)return;
    if(e.button!==0)return;
    App.onCanvasClick(e);
  });
  el.addEventListener('dblclick',e=>{
    const h=App.pickAt(e.clientX,e.clientY);
    if(h){const node=App.owner(h.object);App.select([node]);App.fitView(node);}
  });
  el.addEventListener('pointermove',e=>{
    App._mx=e.clientX;App._my=e.clientY;App._pickDirty=true;
  });
  /* 拾取节流：在 tick 中执行 */
  App._hoverTick=()=>{
    if(!App._pickDirty||S.walk.on)return; App._pickDirty=false;
    const tip=App.$('#tip');
    if(App._modal&&App._modal())return;
    const h=App.pickAt(App._mx,App._my);
    if(S.hover&&S.hover!==h?.object){App.clearHighlight([S.hover]);}
    S.hover=null;
    if(h&&!S.sel.includes(h.object)){
      S.hover=h.object;
      App.eachMesh(h.object,m=>{m.material.emissive=new App.T.Color(0x00d0ff);m.material.emissiveIntensity=.28;});
      let node=App.owner(h.object);
      const meta=node.userData.meta;
      tip.innerHTML=meta.name+'<span class="en">'+(meta.en||'')+'</span>';
      tip.classList.remove('hidden');
      tip.style.left=(App._mx+16)+'px';tip.style.top=(App._my+14)+'px';
    }else tip.classList.add('hidden');
    /* 状态栏坐标 */
    if(h){const p=h.point;
      App.$('#coordXYZ').textContent=`X 纵 ${p.x>=0?'+':''}${p.x.toFixed(1)} · Y 横 ${p.z>=0?'+':''}${p.z.toFixed(1)} · Z 垂 ${p.y>=0?'+':''}${p.y.toFixed(1)} m`;
    }
  };
};
/* 悬停对象 → 所属注册节点（网格自身或祖先） */
App.owner=function(mesh){
  let n=mesh;
  while(n&&!n.userData.meta)n=n.parent;
  return n||mesh;
};

App.onCanvasClick=function(e){
  /* 特性模式优先（测量/标注） */
  if(App.featureClick&&App.featureClick(e))return;
  /* 热点 */
  const T=App.T;
  const r=new T.Raycaster();
  const m=new T.Vector2((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  r.setFromCamera(m,App.camActive||App.cam);
  const hs=r.intersectObjects(App.hotspots,false).filter(h=>App.worldVisible(h.object));
  if(hs.length){App.showHotspot(hs[0].object.userData.hotspot,e.clientX,e.clientY);return;}
  const h=App.pickAt(e.clientX,e.clientY);
  if(!h){App.select([]);return;}
  let node=App.owner(h.object);
  if(e.ctrlKey||e.metaKey){
    const i=S.sel.indexOf(node);
    const ns=S.sel.slice(); if(i>=0)ns.splice(i,1);else ns.push(node);
    App.select(ns,{tree:false});
  }else App.select([node]);
};

/* ───────────────────────── 结构树 ───────────────────────── */
App.buildTree=function(){
  const host=App.$('#treeScroll'); host.innerHTML='';
  App.nodeEls=new Map();
  const mk=(obj,depth)=>{
    const meta=obj.userData.meta; if(!meta)return;
    const kids=obj.children.filter(c=>c.userData.meta);
    const row=document.createElement('div');
    row.className='tnode'; row.style.paddingLeft=(depth*13+4)+'px';
    row.dataset.id=meta.id;
    const caret=kids.length?'<span class="tw">▶</span>':'<span class="tw"></span>';
    const kind=meta.kind==='sys'?'sys':meta.kind==='sub'?'sub':'part';
    const ic={sys:'▰',sub:'▣',part:'▪'}[kind];
    row.innerHTML=`<span class="tw">${kids.length?'▶':''}</span><span class="ic ${kind}">${ic}</span><span class="lb">${meta.name}</span><span class="eye">👁</span>`;
    host.appendChild(row);
    App.nodeEls.set(meta.id,{row,obj,kids,kopen:true});
    row.addEventListener('click',e=>{
      if(e.target.classList.contains('eye'))return;
      if(e.target.classList.contains('tw')&&kids.length){
        const st=App.nodeEls.get(meta.id);st.kopen=!st.kopen;
        st.row.querySelector('.tw').classList.toggle('open',st.kopen);
        kids.forEach(k=>App.nodeEls.get(k.userData.meta.id)?.row.classList.toggle('hidden',!st.kopen));
      }else App.select([obj]);
    });
    row.addEventListener('dblclick',()=>App.fitView(obj));
    row.querySelector('.eye').addEventListener('click',e=>{
      e.stopPropagation();
      App.pushUndo();
      obj.visible=!obj.visible;
      e.target.classList.toggle('off',!obj.visible);
      e.target.textContent=obj.visible?'👁':'🚫';
      App.updateStats();
    });
    row.addEventListener('contextmenu',e=>{
      e.preventDefault();App.showCtx(e.clientX,e.clientY,obj);
    });
    kids.forEach(k=>mk(k,depth+1));
  };
  App.modelRoots().forEach(c=>{if(c.userData.meta)mk(c,1);});
};
App.syncTreeSel=function(){
  App.nodeEls&&App.nodeEls.forEach(st=>st.row.classList.toggle('sel',S.sel.includes(st.obj)));
};
App.revealTree=function(obj){
  let n=obj;
  while(n&&n.parent!==App.model.root){
    const p=n.parent;
    if(App.nodeEls){
      const st=App.nodeEls.get(p.userData.meta?.id);
      if(st&&!st.kopen){st.kopen=true;st.row.querySelector('.tw').classList.add('open');
        p.children.forEach(k=>App.nodeEls.get(k.userData.meta.id)?.row.classList.remove('hidden'));}
    }
    n=p;
  }
};
App.filterTree=function(text){
  text=(text||'').trim().toLowerCase();
  if(!App.nodeEls)return;
  App.nodeEls.forEach(st=>{
    const meta=st.obj.userData.meta;
    const hit=!text||(meta.name||'').toLowerCase().includes(text)||(meta.en||'').toLowerCase().includes(text)||(meta.id||'').toLowerCase().includes(text);
    let childHit=false;
    st.kids.forEach(k=>{const km=k.userData.meta;if(km&&((km.name||'')+(km.en||'')).toLowerCase().includes(text))childHit=true;});
    st.row.classList.toggle('dimmed',!!text&&!hit&&!childHit);
    st.row.classList.toggle('hidden',!!text&&!hit&&!childHit&&false);
  });
};
App.showCtx=function(x,y,obj){
  const cm=App.$('#ctxMenu');
  const meta=obj.userData.meta;
  cm.innerHTML='';
  [['👁 显示 / 隐藏','vis'],['🎯 隔离 Isolate','iso'],['🔲 透明 Transparent','trans'],['🔍 聚焦 Focus','fit'],['ℹ️ 属性','prop']]
    .forEach(it=>{
      const b=document.createElement('button');
      b.textContent=it[0];
      b.onclick=()=>{cm.classList.add('hidden');App.ctxAction(it[1],obj);};
      cm.appendChild(b);
    });
  cm.classList.remove('hidden');
  cm.style.left=Math.min(x,innerWidth-170)+'px';cm.style.top=Math.min(y,innerHeight-190)+'px';
  setTimeout(()=>addEventListener('click',()=>cm.classList.add('hidden'),{once:true}),10);
};
App.ctxAction=function(act,obj){
  if(act==='vis'){App.pushUndo();obj.visible=!obj.visible;App.updateStats();}
  if(act==='iso')App.run('isolate',obj);
  if(act==='trans')App.ghostOthers([obj]);
  if(act==='fit')App.fitView(obj);
  if(act==='prop')App.select([obj]);
};

/* ───────────────────────── 可见性 / 隔离 / X-Ray ───────────────────────── */
App.setOpacity=function(obj,op,depthWrite=true){
  App.eachMesh(obj,m=>{
    const mat=m.material;
    if(mat.userData.baseOpacity===undefined){mat.userData.baseOpacity=mat.opacity;}
    if(op>=1){mat.opacity=mat.userData.baseOpacity;mat.transparent=mat.userData.baseOpacity<1;mat.depthWrite=true;}
    else{mat.opacity=mat.userData.baseOpacity*op;mat.transparent=true;mat.depthWrite=depthWrite;}
  });
};
App.ghostOthers=function(keepList){
  keepList=(keepList||[]).filter(Boolean);
  if(!keepList.length){App.clearGhost();return;}
  App.clearGhost();
  S.ghosted=keepList;
  App.featureRoots().forEach(g=>{
    if(!g.userData.meta||g.name==='Sea'||g.name==='Axes')return;
    if(!keepList.includes(g)&&!keepList.some(k=>{let n=k;while(n){if(n===g)return true;n=n.parent;}return false;}))
      App.setOpacity(g,.055,false);
  });
  App.hint('隔离模式：其他系统已幽灵化 · 按 H 恢复');
};
App.clearGhost=function(){
  if(S.ghosted){S.ghosted=null;App.featureRoots().forEach(g=>g.userData.meta&&App.setOpacity(g,1));}
};
App.isolate=function(obj){App.ghostOthers([obj]);App.select([obj]);App.fitView(obj);};
App.xrayTargets=function(){
  const ids=[];
  if(App.$('#xrHull')?.checked)ids.push('HULL-OUTER','HULL-TRANSOM','HULL-STEM','DECK-MAIN');
  if(App.$('#xrSuper')?.checked)ids.push('SUP-T1','SUP-T2','SUP-T3','SUP-T4','SUP-WING','SUP-FUNNEL','SUP-BOAT');
  if(App.$('#xrHatch')?.checked)ids.push('HC-001','HC-002','HC-003','DECK-2ND');
  return ids.map(App.byId).filter(Boolean);
};
App.applyXray=function(){
  const op=S.xray.on?S.xray.op:1;
  App._xrApplied&&App._xrApplied.forEach(o=>App.setOpacity(o,1));
  App._xrApplied=[];
  if(S.xray.on&&op<1){
    App._xrApplied=App.xrayTargets();
    App._xrApplied.forEach(o=>App.setOpacity(o,op,false));
  }
};

/* ───────────────────────── 爆炸视图 ───────────────────────── */
App.computeExplode=function(){
  const T=App.T;App.entries=[];
  const center=App.modelFocus();
  const over={Superstructure:new T.Vector3(0,1,0),Propulsion:new T.Vector3(-1,-.12,0),
    Piping:new T.Vector3(0,.35,0),Tanks:new T.Vector3(0,-1,0),
    'SYS-SUPER':new T.Vector3(0,1,0),'SYS-PROP':new T.Vector3(-1,-.12,0),
    'SYS-PIPE':new T.Vector3(0,.35,0),'SYS-TANK':new T.Vector3(0,-1,0)};
  App.featureRoots().forEach(g=>{
    if(!g.userData.meta||['Sea','Axes','Compartments'].includes(g.name))return;
    const box=new T.Box3().setFromObject(g),c=box.getCenter(new T.Vector3());
    let dir,ov=over[g.name]||over[g.userData.meta.id];
    if(ov)dir=ov.clone().normalize();
    else if(S.explode.mode==='axis'){
      const o=[c.x,c.y-8,c.z].map(Math.abs);
      const ax=o.indexOf(Math.max(...o));
      dir=new T.Vector3(ax===0?Math.sign(c.x)||1:0,ax===1?Math.sign(c.y-8)||1:0,ax===2?Math.sign(c.z)||1:0);
    }else dir=c.clone().sub(center).normalize();
    App.entries.push({obj:g,base:g.position.clone(),dir,mag:62,f:()=>S.explode.target});
    const gc=c.clone();
    g.children.forEach(ch=>{
      if(!ch.userData.meta)return;
      const cb=new T.Box3().setFromObject(ch).getCenter(new T.Vector3());
      const d2=cb.clone().sub(gc);
      if(d2.length()<2)d2.set(0,1,0);
      if(S.explode.mode==='axis'){
        const o=[d2.x,d2.y,d2.z].map(Math.abs);const ax=o.indexOf(Math.max(...o));
        d2.set(ax===0?Math.sign(d2.x)||1:0,ax===1?Math.sign(d2.y)||1:0,ax===2?Math.sign(d2.z)||1:0);
      }else d2.normalize();
      App.entries.push({obj:ch,base:ch.position.clone(),dir:d2,mag:15,f:()=>S.explode.target});
    });
  });
};
App.computeSelExplode=function(node){
  const T=App.T;
  App.resetSelExplode();
  const nb=new T.Box3().setFromObject(node),nc=nb.getCenter(new T.Vector3());
  const size=nb.getSize(new T.Vector3()).length();
  node.children.filter(c=>c.userData.meta).forEach(ch=>{
    const cb=new T.Box3().setFromObject(ch).getCenter(new T.Vector3());
    let d=cb.clone().sub(nc);
    if(d.length()<1)d.set(0,1,0);
    d.normalize();
    App.selEntries.push({obj:ch,base:ch.position.clone(),dir:d,mag:size*.34+5,f:()=>S.selEx.target});
  });
  if(!App.selEntries.length)App.toast('该节点没有可分解的子组件');
};
App.resetSelExplode=function(){
  App.selEntries.forEach(e=>e.obj.position.copy(e.base));
  App.selEntries=[];S.selEx.cur=0;S.selEx.target=0;
};
App.animateEntries=function(list,stKey,dt){
  const st=S[stKey];
  if(Math.abs(st.cur-st.target)>.0004){
    st.cur+=(st.target-st.cur)*Math.min(1,dt*5);
    if(Math.abs(st.cur-st.target)<.0004)st.cur=st.target;
  }
  const f=st.cur;
  list.forEach(e=>{e.obj.position.copy(e.base).addScaledVector(e.dir,e.mag*f);});
};
App.setExplode=function(v,fromSlider){
  S.explode.target=v/100;
  if(!fromSlider)App.$('#exSlider').value=v;
  App.$('#exVal').textContent=v+'%';
};

/* ───────────────────────── 剖切 ───────────────────────── */
App.applySection=function(){
  const T=App.T,s=S.section,planes=[];
  const mk=(n,c)=>new T.Plane(new T.Vector3(...n),c);
  if(s.mode==='x')planes.push(mk([-1,0,0],s.val));
  if(s.mode==='y')planes.push(mk([0,-1,0],s.val));
  if(s.mode==='z')planes.push(mk([0,0,-1],s.val));
  if(s.mode==='box'){
    const[b0,b1,c0,c1,d0,d1]=s.box;
    planes.push(mk([-1,0,0],b1),mk([1,0,0],-b0),mk([0,-1,0],c1),mk([0,1,0],-c0),mk([0,0,-1],d1),mk([0,0,1],-d0));
  }
  App.renderer.clippingPlanes=planes;
  App.updateSectionVisual();
};
App.updateSectionVisual=function(){
  const T=App.T,s=S.section;
  if(App.secGroup){App.scene.remove(App.secGroup);App.secGroup=null;}
  if(s.mode==='off'||!s.visual)return;
  const g=new T.Group();App.secGroup=g;App.scene.add(g);
  const pmat=()=>new T.MeshBasicMaterial({color:0x00d0ff,transparent:true,opacity:.1,side:T.DoubleSide,depthWrite:false});
  const lmat=()=>new T.LineBasicMaterial({color:0x7fe8ff,transparent:true,opacity:.75});
  function plane(w,h,rot,pos){
    const geo=new T.PlaneGeometry(w,h);
    const p=new T.Mesh(geo,pmat());
    p.rotation.set(...rot);p.position.set(...pos);
    const e=new T.LineSegments(new T.EdgesGeometry(geo),lmat());
    e.rotation.copy(p.rotation);e.position.copy(p.position);
    g.add(p,e);
  }
  if(s.mode==='x')plane(120,92,[0,Math.PI/2,0],[s.val,14,0]);
  if(s.mode==='y')plane(240,120,[-Math.PI/2,0,0],[0,s.val,0]);
  if(s.mode==='z')plane(240,92,[0,0,0],[0,14,s.val]);
  if(s.mode==='box'){
    const[b0,b1,c0,c1,d0,d1]=s.box;
    plane(b1-b0,c1-c0,[0,Math.PI/2,0],[b0,(c0+c1)/2,(d0+d1)/2]);
    plane(b1-b0,c1-c0,[0,Math.PI/2,0],[b1,(c0+c1)/2,(d0+d1)/2]);
    plane(b1-b0,d1-d0,[-Math.PI/2,0,0],[(b0+b1)/2,c0,(d0+d1)/2]);
    plane(b1-b0,d1-d0,[Math.PI/2,0,0],[(b0+b1)/2,c1,(d0+d1)/2]);
    plane(d1-d0,c1-c0,[0,0,0],[(b0+b1)/2,(c0+c1)/2,d0]);
    plane(d1-d0,c1-c0,[0,0,0],[(b0+b1)/2,(c0+c1)/2,d1]);
    const eg=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(b1-b0,c1-c0,d1-d0)),lmat());
    eg.position.set((b0+b1)/2,(c0+c1)/2,(d0+d1)/2);g.add(eg);
  }
};
App.setSectionMode=function(m){
  const s=S.section;s.mode=m;
  App.$$('#secModes button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  App.$('#secSingle').style.display=(m==='x'||m==='y'||m==='z')?'':'none';
  App.$('#secBoxUI').style.display=m==='box'?'':'none';
  const sl=App.$('#secSlider');
  if(m==='x'){sl.min=-112;sl.max=112;sl.step=.5;sl.value=10;}
  if(m==='y'){sl.min=-25;sl.max=58;sl.step=.5;sl.value=13;}
  if(m==='z'){sl.min=-55;sl.max=55;sl.step=.5;sl.value=0;}
  if(m!=='off'&&m!=='box'){s.val=+sl.value;App.updateSecVal();}
  App.applySection();
  if(m!=='off')App.hint('拖动滑块移动剖切面 · 船体内部截面实时可见');
};
App.updateSecVal=function(){
  const s=S.section,el=App.$('#secVal');
  if(s.mode==='x'){const fr=Math.round((s.val+90)/10);el.textContent=`X = ${s.val>=0?'+':''}${s.val.toFixed(1)} m · Fr ${fr}`;}
  if(s.mode==='y')el.textContent=`高度 = ${s.val.toFixed(1)} m`;
  if(s.mode==='z')el.textContent=`Z = ${s.val>=0?'+':''}${s.val.toFixed(1)} m`;
};

/* ───────────────────────── 撤销 / 重做 ───────────────────────── */
App.pushUndo=function(){
  const snap={
    vis:App.activeRegistry().map(o=>o.visible?1:0),
    ex:S.explode.target*100,selT:S.selEx.target,
    sec:JSON.stringify(S.section),xr:JSON.stringify(S.xray),ghost:S.ghosted?S.ghosted.map(o=>o.userData.meta.id):null
  };
  S.undoStack.push(snap);if(S.undoStack.length>40)S.undoStack.shift();
  S.redoStack.length=0;
  App.updateURBtns();
};
App.snapshotNow=App.pushUndo;
App.applySnap=function(sn){
  App.activeRegistry().forEach((o,i)=>o.visible=!!sn.vis[i]);
  App.setExplode(sn.ex);
  S.explode.target=sn.ex/100;S.explode.cur=S.explode.target;
  S.selEx.target=sn.selT;S.selEx.cur=S.selEx.target;
  Object.assign(S.section,JSON.parse(sn.sec));App.applySection();
  Object.assign(S.xray,JSON.parse(sn.xr));App.applyXray();
  App.clearGhost();
  if(sn.ghost)App.ghostOthers(sn.ghost.map(App.byId).filter(Boolean));
  App.updateStats();App.renderProps();
};
App.undo=function(){
  if(S.undoStack.length<2)return App.toast('没有可撤销的操作');
  const cur=S.undoStack.pop();S.redoStack.push(cur);
  App.applySnap(S.undoStack[S.undoStack.length-1]);
  App.updateURBtns();App.toast('已撤销');
};
App.redo=function(){
  if(!S.redoStack.length)return App.toast('没有可重做的操作');
  const sn=S.redoStack.pop();S.undoStack.push(sn);
  App.applySnap(sn);App.updateURBtns();App.toast('已重做');
};
App.updateURBtns=function(){
  App.$('#btnUndo').style.opacity=S.undoStack.length>1?1:.4;
  App.$('#btnRedo').style.opacity=S.redoStack.length?1:.4;
};

/* ───────────────────────── 截图 ───────────────────────── */
App.screenshot=function(mode='dark'){
  const T=App.T,r=App.renderer,oldBg=App.scene.background,oldFog=App.scene.fog;
  App.scene.fog=null;
  if(mode==='alpha'){App.scene.background=null;r.setClearColor(0,0);}
  if(mode==='white'){App.scene.background=new T.Color('#ffffff');}
  if(mode==='dark'){App.scene.background=new T.Color('#05080f');}
  r.render(App.scene,App.camActive||App.cam);
  const url=r.domElement.toDataURL('image/png');
  App.scene.background=oldBg;App.scene.fog=oldFog;
  const a=document.createElement('a');
  a.href=url;a.download=`ship-dt-${mode}-${Date.now()}.png`;a.click();
  App.toast('截图已导出 PNG');
};

/* ───────────────────────── 统计 ───────────────────────── */
App.updateStats=function(){
  let n=0;App.activeRegistry().forEach(o=>{if(App.worldVisible(o))n++;});
  App.$('#stObj').textContent=n;
  setTimeout(()=>{App.$('#stTri').textContent=(App.renderer.info.render.triangles/1000).toFixed(0)+'k';},100);
};

/* ───────────────────────── UI 绑定 ───────────────────────── */
App.showPop=function(id){
  const el=App.$('#'+id),was=el.classList.contains('show');
  App.$$('.pop').forEach(p=>p.classList.remove('show'));
  if(!was)el.classList.add('show');
  return !was;
};
App.initUI=function(){
  /* 菜单 & 快捷条命令 */
  document.body.addEventListener('click',e=>{
    const b=e.target.closest('[data-cmd]');
    if(b){App.run(b.dataset.cmd);}
  });
  /* 面板标签页 */
  App.$$('.tabs').forEach(tabs=>{
    tabs.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
      tabs.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
      const panel=tabs.parentElement.querySelector('#'+t.dataset.tab+'Panel');
      tabs.parentElement.querySelectorAll('.tpanel').forEach(p=>p.classList.remove('on'));
      panel.classList.add('on');
    }));
  });
  /* 弹出面板关闭 */
  App.$$('.pop .px').forEach(x=>x.addEventListener('click',()=>x.closest('.pop').classList.remove('show')));
  /* 搜索 */
  const sb=App.$('#searchBox'),drop=App.$('#searchDrop');
  sb.addEventListener('input',()=>App.doSearch(sb.value));
  sb.addEventListener('blur',()=>setTimeout(()=>drop.style.display='none',180));
  sb.addEventListener('focus',()=>{if(sb.value)App.doSearch(sb.value);});
  /* 爆炸面板 */
  const ex=App.$('#exSlider');
  ex.addEventListener('input',()=>App.setExplode(+ex.value,true));
  App.$$('#exLevels button').forEach(b=>b.addEventListener('click',()=>{
    App.$$('#exLevels button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
    App.setExplode(+b.dataset.l);
  }));
  App.$$('#exModes button').forEach(b=>b.addEventListener('click',()=>{
    App.$$('#exModes button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
    S.explode.mode=b.dataset.m;App.computeExplode();
  }));
  /* 剖切面板 */
  App.$$('#secModes button').forEach(b=>b.addEventListener('click',()=>App.setSectionMode(b.dataset.m)));
  const sl=App.$('#secSlider');
  sl.addEventListener('input',()=>{S.section.val=+sl.value;App.updateSecVal();App.applySection();});
  App.$('#secVisual').addEventListener('change',e=>{S.section.visual=e.target.checked;App.updateSectionVisual();});
  App.$$('.bxr').forEach(r=>r.addEventListener('input',()=>{
    const b=S.section.box,i=+r.dataset.b;b[i]=+r.value;
    ['bx0v','bx1v','by0v','by1v','bz0v','bz1v'].forEach((id,j)=>{
      const v=S.section.box[j];App.$('#'+id).textContent=(v>0?'+':'')+v.toFixed(0);
    });
    App.applySection();
  }));
  /* X-Ray 面板 */
  const xr=App.$('#xrSlider');
  xr.addEventListener('input',()=>{
    S.xray.op=+xr.value/100;App.$('#xrVal').textContent=xr.value+'%';
    S.xray.on=S.xray.op<1;App.applyXray();
  });
  App.$$('#pop-xray [data-xr]').forEach(b=>b.addEventListener('click',()=>{
    S.xray.op=+b.dataset.xr/100;S.xray.on=S.xray.op<1;
    xr.value=b.dataset.xr;App.$('#xrVal').textContent=b.dataset.xr+'%';
    App.applyXray();
  }));
  ['#xrHull','#xrSuper','#xrHatch'].forEach(id=>App.$(id).addEventListener('change',()=>App.applyXray()));
  /* 撤销重做截图加载帮助 */
  App.$('#btnUndo').addEventListener('click',App.undo);
  App.$('#btnRedo').addEventListener('click',App.redo);
  App.$('#btnShot').addEventListener('click',()=>App.screenshot('dark'));
  App.$('#btnLoad').addEventListener('click',()=>App.$('#fileGlb').click());
  App.$('#btnHelp').addEventListener('click',()=>App.showHelp());
  App.$('#fileGlb').addEventListener('change',e=>{if(e.target.files[0])App.loadGLB(e.target.files[0]);e.target.value='';});
  /* 拖拽 GLB */
  addEventListener('dragover',e=>e.preventDefault());
  addEventListener('drop',e=>{
    e.preventDefault();
    const f=[...e.dataTransfer.files].find(f=>/\.(glb|gltf)$/i.test(f.name));
    if(f)App.loadGLB(f);
  });
  /* 键盘 */
  addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
    if(e.key==='F1'){e.preventDefault();App.showHelp();return;}
    if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();App.undo();return;}
    if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();App.redo();return;}
    const K={f:'fit',r:'resetAll',e:'popExplode',s:'popSection',x:'xray',m:'measure',w:'walk',h:'showAll',p:'shotDark'};
    const cmd=K[e.key.toLowerCase()];
    if(cmd&&!e.ctrlKey&&!e.altKey)App.run(cmd);
    if(e.key==='Delete'&&S.sel.length){App.pushUndo();S.sel.forEach(o=>o.visible=false);App.updateStats();}
    if(e.key==='Escape'){App.$$('.pop').forEach(p=>p.classList.remove('show'));App.exitModes();}
  });
  App.bindViewport();
};

/* ───────────────────────── 命令分发 ───────────────────────── */
App.run=function(cmd,arg){
  const A=App;
  const map={
    home:()=>A.preset('home'), fit:()=>A.fitView(), resetAll:()=>A.resetAll(),
    vTop:()=>A.preset('vTop'),vBottom:()=>A.preset('vBottom'),vBow:()=>A.preset('vBow'),
    vStern:()=>A.preset('vStern'),vPort:()=>A.preset('vPort'),vStbd:()=>A.preset('vStbd'),
    ortho:()=>A.orthoToggle(),
    axes:()=>{App.axes.visible=!App.axes.visible;App.toast('坐标轴 '+(App.axes.visible?'开':'关'));},
    water:()=>{App.water.visible=!App.water.visible;},
    popExplode:()=>{A.showPop('pop-explode');},
    popSection:()=>{A.showPop('pop-section');},
    popXray:()=>A.showPop('pop-xray'),
    popDecks:()=>{A.showPop('pop-decks');A.buildDeckList();},
    popComps:()=>{A.showPop('pop-comps');A.buildCompList();},
    popSystems:()=>{A.showPop('pop-systems');A.buildSysList();},
    popBkm:()=>{A.showPop('pop-bkm');A.renderBkmList();},
    popPeel:()=>{A.showPop('pop-peel2');A.renderPeelSteps();},
    explodeOn:()=>A.setExplode(100), assemble:()=>A.setExplode(0),
    explodeSel:()=>{
      if(!S.sel.length)return App.toast('请先选择一个组件（如：主机）');
      const node=S.sel[0];
      A.computeSelExplode(node);S.selEx.target=1;
      setTimeout(()=>A.fitView(node),1250);
      App.toast('已分解 '+node.userData.meta.name+' · 「装配」可复原');
    },
    xray:()=>{
      S.xray.on=!S.xray.on;
      if(S.xray.on&&S.xray.op>=1)S.xray.op=.13;
      App.$('#xrSlider').value=S.xray.op*100;App.$('#xrVal').textContent=Math.round(S.xray.op*100)+'%';
      App.applyXray();App.toast('X-Ray '+(S.xray.on?'开':'关'));
      App.$('#qbar [data-cmd=xray]').classList.toggle('on',S.xray.on);
    },
    dSolid:()=>{S.xray.on=false;App.applyXray();S.wireframe&&App.toggleWire();},
    dWire:()=>App.toggleWire(),
    dGhost:()=>{const o=S.sel[0]||App.byId('SYS-PROP');o?A.isolate(o):0;},
    dReset:()=>A.resetDisplay(),
    measure:()=>A.toggleMeasure(),
    isolate:()=>{const o=arg||S.sel[0];o?A.isolate(o):App.toast('请先选择对象');},
    hideSel:()=>{if(S.sel.length){A.pushUndo();S.sel.forEach(o=>o.visible=false);A.updateStats();}},
    showAll:()=>A.showAll(),
    invertHide:()=>A.invertHide(),
    annotMode:()=>A.toggleAnnot(),
    tour:()=>A.startTour(),
    propAnim:()=>A.togglePropAnim(),
    flowAll:()=>A.toggleFlow(),
    walk:()=>A.toggleWalk(),
    focusSel:()=>{
      if(!S.sel.length)return App.toast('请先选择对象');
      if(!S.focusOn){A.ghostOthers(S.sel);A.fitView(S.sel[0]);S.focusOn=true;App.toast('聚焦模式 · 再次点击恢复');}
      else{A.clearGhost();S.focusOn=false;}
    },
    shotDark:()=>A.screenshot('dark'),shotWhite:()=>A.screenshot('white'),shotAlpha:()=>A.screenshot('alpha'),
    loadGlb:()=>A.$('#fileGlb').click(),
    loadBuiltinShip:()=>A.loadGLBUrl('models/ship-blender.glb','Blender 精细船模 · ship-blender.glb'),
    help:()=>A.showHelp(),
    heatmap:()=>A.toggleHeatmap(),
    hotspots:()=>A.toggleHotspots(),
    isoPiping:()=>A.isolate(App.byId('SYS-PIPE'))
  };
  if(map[cmd])map[cmd]();
};
App.toggleWire=function(){
  S.wireframe=!S.wireframe;
  App.activeRegistry().forEach(o=>App.eachMesh(o,m=>{m.material.wireframe=S.wireframe;}));
  App.toast('线框 '+(S.wireframe?'开':'关'));
};
App.resetDisplay=function(){
  S.xray.on=false;App.applyXray();
  if(S.wireframe)App.toggleWire();
  App.clearGhost();S.focusOn=false;App.resetSelExplode();
  App.toast('显示状态已复原');
};
App.showAll=function(){
  App.pushUndo();
  App.clearGhost();S.focusOn=false;
  App.activeRegistry().forEach(o=>{o.visible=true;App.setOpacity(o,1);});
  if(App.externalModel)App.hideProceduralDemo();
  const comp=App.byId('SYS-COMP')||App.byId('SYS-TANK');
  if(comp)comp.visible=false;          // 舱室分区默认隐藏
  App.updateStats();App.toast('已全部显示');
};
App.invertHide=function(){
  App.pushUndo();
  const vis=S.sel.map(o=>o.visible);
  S.sel.forEach(o=>o.visible=!o.visible);
  App.updateStats();App.toast('已反选显隐');
};
App.resetAll=function(){
  App.showAll();App.resetDisplay();
  App.setExplode(0);S.explode.cur=0;
  App.resetSelExplode();
  App.setSectionMode('off');
  App.peel=0;
  App.$$('#peelBtns button, #peelSteps button').forEach(b=>b.classList.remove('on'));
  const pd=App.$('#peelDesc');if(pd)pd.textContent='';
  S.undoStack.length=0;S.redoStack.length=0;App.updateURBtns();
  App.select([]);App.preset('home');App.hint('左键旋转 · 右键平移 · 滚轮缩放 · 双击聚焦 · 悬停查看部件');
  App.toast('已复位');
};
App.exitModes=function(){
  if(S.measure.mode)App.toggleMeasure();
  if(S.annot.on)App.toggleAnnot();
  if(S.walk.on)App.toggleWalk();
  App.$('#hsCard').classList.add('hidden');
};
