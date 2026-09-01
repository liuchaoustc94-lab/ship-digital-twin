/* ═══ OCEAN·DT 特性层：视图立方·测量·标注·热点·漫游·流动·行走·BOM·剥离 ═══ */
(function(){
const A=App,S=App.state;
const $=App.$,$$=App.$$;
const T3=()=>App.T;
const v3=a=>new (T3()).Vector3(a[0],a[1],a[2]);
const ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;

/* ───────── 活动模型适配层 ─────────
   所有功能都从这里取得对象、系统和路径，避免把隐藏的演示模型误当成当前模型。 */
A.activeFeatureObject=function(id){return id?A.byId(id):null;};
A.activeCompartmentRoot=function(){
  return A.activeFeatureObject('SYS-COMP')||A.activeFeatureObject('SYS-TANK')||null;
};
A.activeFlow=function(){return A.externalLoaded?(A.externalFlow||[]):(App.flow||[]);};
A.objectCenter=function(obj){
  if(!obj)return null;
  const box=new (T3()).Box3().setFromObject(obj);
  return box.isEmpty()?null:box.getCenter(new (T3()).Vector3());
};
A.buildPropulsionPath=function(){
  const T=T3();
  const ids=['ME-001','GB-001','SH-001','PP-001'];
  const points=ids.map(A.activeFeatureObject).map(A.objectCenter).filter(Boolean);
  if(A.externalLoaded&&points.length<2)return null;
  const pathPoints=A.externalLoaded&&App.externalModel
    ?points.map(p=>App.externalModel.worldToLocal(p.clone())):points;
  return new T.CatmullRomCurve3(pathPoints.length>=2?pathPoints:[
    new T.Vector3(-58,6,0),new T.Vector3(-50,3,0),new T.Vector3(-42,-1,0),
    new T.Vector3(-70,-3.3,0),new T.Vector3(-103,-3.3,0)
  ]);
};
A.refreshTourTargets=function(){
  if(!A.externalLoaded||!A.tourSteps)return;
  const T=T3();
  const focus=App.modelFocus();
  A.tourSteps.forEach(s=>{
    if(!s.cam)return;
    if(!s.id){
      if(!s.baseCam)s.baseCam=[s.cam[0].slice(),s.cam[1].slice()];
      s.cam=[s.baseCam[0].slice(),focus.toArray()];
      return;
    }
    const o=A.activeFeatureObject(s.id);
    if(!o)return;
    if(!s.baseCam)s.baseCam=[s.cam[0].slice(),s.cam[1].slice()];
    const box=new T.Box3().setFromObject(o),center=box.getCenter(new T.Vector3());
    const size=box.getSize(new T.Vector3());
    const direction=v3(s.baseCam[0]).sub(v3(s.baseCam[1])).normalize();
    const distance=Math.max(size.length()*2.4,18);
    s.cam=[center.clone().addScaledVector(direction,distance).toArray(),center.toArray()];
  });
};
A.bindFlowToActiveModel=function(){
  const source=App.flow||[];
  if(!A.externalLoaded)return source;
  const T=T3();
  return source.map(sys=>{
    const group=A.activeFeatureObject('PIPE-'+sys.id);
    if(!group)return null;
    const segments=[];
    group.traverse(o=>{
      const id=o.userData?.meta?.id||'';
      if(o.isMesh&&id.indexOf('PIPE-'+sys.id+'-')===0)segments.push(o);
    });
    segments.sort((a,b)=>(a.userData.meta.id||'').localeCompare(b.userData.meta.id||'',undefined,{numeric:true}));
    const curves=[];
    group.updateWorldMatrix(true,true);
    segments.forEach(segment=>{
      const worldCenter=A.objectCenter(segment);
      if(!worldCenter)return;
      const center=group.worldToLocal(worldCenter.clone());
      const box=new T.Box3().setFromObject(segment),size=box.getSize(new T.Vector3());
      const axis=['x','y','z'].sort((a,b)=>size[b]-size[a])[0];
      const half=Math.max(size[axis]/2,1)*.72;
      const a=center.clone(),b=center.clone();
      a[axis]-=half;b[axis]+=half;
      curves.push(new T.CatmullRomCurve3([a,center,b]));
    });
    return Object.assign({},sys,{group,curves,external:true});
  }).filter(Boolean);
};

/* ───────── 视图立方 ───────── */
A.initViewCube=function(){
  const T=T3(),cv=$('#vcube');
  const r2=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true});
  r2.setSize(120,120,false);
  const sc=new T.Scene();
  const c2=new T.PerspectiveCamera(36,1,.1,500);
  const face=(txt,sub,bg)=>{
    const c=document.createElement('canvas');c.width=128;c.height=128;
    const g=c.getContext('2d');
    g.fillStyle=bg;g.fillRect(0,0,128,128);
    g.strokeStyle='rgba(0,208,255,.5)';g.lineWidth=4;g.strokeRect(2,2,124,124);
    g.fillStyle='#ffffff';g.font='700 34px "Microsoft YaHei UI",sans-serif';g.textAlign='center';
    g.fillText(txt,64,62);
    g.fillStyle='rgba(0,208,255,.9)';g.font='600 15px Consolas,monospace';
    g.fillText(sub,64,92);
    return new T.CanvasTexture(c);
  };
  const mats=[
    new T.MeshBasicMaterial({map:face('艏','BOW','#123a52')}),
    new T.MeshBasicMaterial({map:face('艉','STERN','#123a52')}),
    new T.MeshBasicMaterial({map:face('顶','TOP','#0e3145')}),
    new T.MeshBasicMaterial({map:face('底','BOTTOM','#0e3145')}),
    new T.MeshBasicMaterial({map:face('左','PORT','#14424e')}),
    new T.MeshBasicMaterial({map:face('右','STBD','#14424e')})
  ];
  const cube=new T.Mesh(new T.BoxGeometry(30,30,30),mats);
  sc.add(cube);
  sc.add(new T.AxesHelper(44));
  A.renderViewCube=()=>{
    c2.position.copy(A.cam.position).sub(A.controls.target).normalize().multiplyScalar(95);
    c2.up.copy(A.cam.up);c2.lookAt(0,0,0);
    r2.render(sc,c2);
  };
  cv.addEventListener('click',e=>{
    const b=cv.getBoundingClientRect();
    const rc=new T.Raycaster();
    const p=new T.Vector2(((e.clientX-b.left)/b.width)*2-1,-((e.clientY-b.top)/b.height)*2+1);
    rc.setFromCamera(p,c2);
    const hit=rc.intersectObject(cube,false)[0];
    if(!hit||!hit.face)return;
    const n=hit.face.normal;
    const map={'1,0,0':'vBow','-1,0,0':'vStern','0,1,0':'vTop','0,-1,0':'vBottom','0,0,1':'vPort','0,0,-1':'vStbd'};
    const cmd=map[[Math.round(n.x),Math.round(n.y),Math.round(n.z)].join(',')];
    if(cmd)A.run(cmd);
  });
};

/* ───────── 测量 ───────── */
S.measure={mode:'',unit:'m',pts:[],marks:[],labels:[],results:[]};

/* 特性初始化：面板按钮绑定 + 状态初始化 */
A.initFeatures=function(){
  /* 测量模式按钮 */
  $$('#msModes button').forEach(b=>b.addEventListener('click',()=>{
    $$('#msModes button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    S.measure.mode=b.dataset.mm;
    S.measure.pts=[];
    A.hint({dist:'测量距离：点选两点',angle:'测量角度：点选三点（第2点为顶点）',point:'坐标查询：点选任意位置'}[S.measure.mode]);
  }));
  $$('#msUnits button').forEach(b=>b.addEventListener('click',()=>{
    $$('#msUnits button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    S.measure.unit=b.dataset.u;
  }));
  $('#msClear').addEventListener('click',A.clearMeasure);
  $('#annotClear').addEventListener('click',function(){
    A.annot.items.forEach(i=>A.scene.remove(i.sprite));
    A.annot.items=[];
    A.renderAnnotList();
  });
  /* 标注编辑器 */
  $('#annotOk').addEventListener('click',A.annotConfirm);
  $('#annotCancel').addEventListener('click',function(){
    $('#annotEditor').classList.add('hidden');
    A._annotPos=null;
  });
  $('#annotInput').addEventListener('keydown',e=>{
    if(e.key==='Enter')A.annotConfirm();
    if(e.key==='Escape'){$('#annotEditor').classList.add('hidden');A._annotPos=null;}
  });
  /* 书签 */
  $('#bkmSave').addEventListener('click',()=>A.saveBookmark($('#bkmName').value));
  $('#bkmSave2').addEventListener('click',()=>A.saveBookmark($('#bkmName2').value));
  /* 剥离 */
  $('#peelPrev').addEventListener('click',()=>A.peelTo(A.peel-1));
  $('#peelNext').addEventListener('click',()=>A.peelTo(A.peel+1));
  /* 时间轴 */
  $('#tlPlay').addEventListener('click',A.tourPlayPause);
  $('#tlPrev').addEventListener('click',()=>A.tourGoto(A.tour.step-1));
  $('#tlNext').addEventListener('click',()=>A.tourGoto(A.tour.step+1));
  $('#tlClose').addEventListener('click',A.stopTour);
  $('#tlSpeed').addEventListener('change',e=>{if(A.tour)A.tour.speed=+e.target.value;});
  $('#tlTrack').addEventListener('click',e=>{
    const b=$('#tlTrack').getBoundingClientRect();
    A.tourSeek((e.clientX-b.left)/b.width*A.tour.total);
  });
  /* 行走 */
  $('#walkExit').addEventListener('click',()=>A.toggleWalk());
  addEventListener('keydown',e=>{if(S.walk.on)A.walkKeys[e.key.toLowerCase()]=true;});
  addEventListener('keyup',e=>{if(S.walk.on)A.walkKeys[e.key.toLowerCase()]=false;});
  document.addEventListener('pointerlockchange',function(){
    if(!document.pointerLockElement&&S.walk.on)A.toggleWalk();
  });
  addEventListener('mousemove',function(e){
    if(S.walk.on&&document.pointerLockElement){
      A.walk.yaw-=e.movementX*.0022;
      A.walk.pitch=Math.max(-1.4,Math.min(1.4,A.walk.pitch-e.movementY*.0022));
    }
  });
  /* 状态初始化 */
  A.peel=0;
  A.bookmarks=[];
  A.annot={on:false,items:[]};
  A.flowOn=false;
  A.propOn=false;
  A.hsOn=true;
  A.walk={yaw:0,pitch:0};
  A.walkKeys={};
  /* 实时数据模拟 */
  setInterval(A.liveTick,1000);
  A.renderBkmList();
  if(A.renderPeelSteps)A.renderPeelSteps();
};

A.toggleMeasure=function(){
  const m=S.measure;
  m.mode=m.mode?'':'dist';
  if(m.mode){
    $$('#msModes button')[0].click();
    A.hint('测量模式：点选两点测距离 · Esc 退出');
  }else{
    m.labels.forEach(l=>l.el.remove());m.labels=[];
    A.hint('左键旋转 · 右键平移 · 滚轮缩放 · 双击聚焦');
  }
  const qb=$('#qbar [data-cmd=measure]');
  if(qb)qb.classList.toggle('on',!!m.mode);
};
A.makeLabel=function(){
  const el=document.createElement('div');
  el.className='ms-label';
  document.body.appendChild(el);
  return el;
};
A.featureClick=function(e){
  if(S.measure.mode)return A.measureClick(e);
  if(A.annot&&A.annot.on)return A.annotPlace(e);
  return false;
};
A.measureClick=function(e){
  const m=S.measure,h=A.pickAt(e.clientX,e.clientY);
  if(!h)return true;
  const T=T3();
  const mk=new T.Mesh(new T.SphereGeometry(.4,12,10),new T.MeshBasicMaterial({color:0xff9a3c}));
  mk.position.copy(h.point);
  A.scene.add(mk);m.marks.push(mk);
  m.pts.push(h.point.clone());
  const addLabel=pos=>{
    const el=A.makeLabel();
    m.labels.push({el,pos:pos.clone()});
    return el;
  };
  if(m.mode==='point'){
    const p=m.pts[0];
    addLabel(p).textContent='P ('+p.x.toFixed(2)+', '+p.z.toFixed(2)+', '+p.y.toFixed(2)+') m';
    A.addMsResult('坐标 ('+p.x.toFixed(1)+', '+p.z.toFixed(1)+', '+p.y.toFixed(1)+') m');
    m.pts=[];
  }else if(m.mode==='dist'&&m.pts.length===2){
    const d=m.pts[0].distanceTo(m.pts[1]);
    const txt=m.unit==='mm'?(d*1000).toFixed(0)+' mm':d.toFixed(2)+' m';
    addLabel(m.pts[0].clone().lerp(m.pts[1],.5)).textContent=txt;
    const line=new T.Line(new T.BufferGeometry().setFromPoints(m.pts),
      new T.LineBasicMaterial({color:0xffb46a}));
    A.scene.add(line);m.marks.push(line);
    A.addMsResult('距离 '+txt);
    m.pts=[];
  }else if(m.mode==='angle'&&m.pts.length===3){
    const b=m.pts[1],a2=m.pts[0],c2=m.pts[2];
    const v1=a2.clone().sub(b).normalize(),v2=c2.clone().sub(b).normalize();
    const ang=Math.acos(Math.max(-1,Math.min(1,v1.dot(v2))))*180/Math.PI;
    addLabel(b).textContent=ang.toFixed(1)+'°';
    A.addMsResult('角度 '+ang.toFixed(1)+'°');
    m.pts=[];
  }
  return true;
};
A.addMsResult=function(txt){
  const el=document.createElement('div');
  el.className='bom-row';
  el.innerHTML='<span class="n">📐 '+txt+'</span>';
  $('#msList').appendChild(el);
};
A.clearMeasure=function(){
  const m=S.measure;
  m.marks.forEach(o=>A.scene.remove(o));m.marks=[];
  m.labels.forEach(l=>l.el.remove());m.labels=[];
  m.results=[];m.pts=[];
  $('#msList').innerHTML='';
};
A.repositionLabels=function(){
  const T=T3(),cam=A.camActive||A.cam;
  if(!cam)return;
  const proj=p=>{
    const q=p.clone().project(cam);
    return {x:(q.x+1)/2*innerWidth,y:(-q.y+1)/2*innerHeight,front:q.z<1};
  };
  S.measure.labels.forEach(l=>{
    const s=proj(l.pos);
    if(!s.front){l.el.style.display='none';return;}
    l.el.style.display='';
    l.el.style.left=s.x+'px';l.el.style.top=s.y+'px';
  });
  if(A._annotPos){
    const s=proj(A._annotPos);
    $('#annotEditor').style.left=(s.x+14)+'px';
    $('#annotEditor').style.top=(s.y-20)+'px';
  }
  if(A._hsOpen){
    const sp=A._hsOpen.sp;
    if(sp&&sp.parent){
      const s=proj(sp.position);
      $('#hsCard').style.left=Math.min(s.x+18,innerWidth-260)+'px';
      $('#hsCard').style.top=Math.max(60,s.y-40)+'px';
    }
  }
};

/* ───────── 标注 ───────── */
A.toggleAnnot=function(){
  A.annot.on=!A.annot.on;
  A.hint(A.annot.on?'标注模式：在模型上点击放置标注 · Esc 退出':'左键旋转 · 右键平移 · 滚轮缩放 · 双击聚焦');
};
A.annotPlace=function(e){
  const h=A.pickAt(e.clientX,e.clientY);
  if(!h)return true;
  A._annotPos=h.point.clone();
  $('#annotEditor').classList.remove('hidden');
  const inp=$('#annotInput');
  inp.value='';
  setTimeout(()=>inp.focus(),30);
  return true;
};
A.annotConfirm=function(){
  const txt=$('#annotInput').value.trim();
  $('#annotEditor').classList.add('hidden');
  if(!txt||!A._annotPos){A._annotPos=null;return;}
  const T=T3();
  const cv=document.createElement('canvas');cv.width=64;cv.height=64;
  const c=cv.getContext('2d');
  c.beginPath();c.arc(32,26,12,0,7);c.fillStyle='#ff9a3c';c.fill();
  c.beginPath();c.moveTo(32,38);c.lineTo(24,60);c.lineTo(40,60);c.closePath();c.fill();
  const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cv),transparent:true,depthTest:false}));
  sp.position.copy(A._annotPos);sp.scale.set(3,3,1);
  A.scene.add(sp);
  A.annot.items.push({txt:txt,pos:A._annotPos.clone(),sprite:sp});
  A._annotPos=null;
  A.renderAnnotList();
  A.toast('标注已添加');
};
A.renderAnnotList=function(){
  const el=$('#annotList');el.innerHTML='';
  A.annot.items.forEach((it,i)=>{
    const d=document.createElement('div');
    d.className='bom-row';
    d.innerHTML='<span class="n">📍 '+it.txt+'</span><button class="q">✕</button>';
    d.addEventListener('click',ev=>{
      if(ev.target.tagName==='BUTTON')return;
      A.flyTo([it.pos.x+14,it.pos.y+8,it.pos.z+14],[it.pos.x,it.pos.y,it.pos.z],.8);
    });
    d.querySelector('button').addEventListener('click',()=>{
      A.scene.remove(it.sprite);A.annot.items.splice(i,1);A.renderAnnotList();
    });
    el.appendChild(d);
  });
};

/* ───────── 热点 ───────── */
A.toggleHotspots=function(){
  if(A.externalLoaded){
    A.hsOn=false;
    A.hotspots.forEach(s=>{s.visible=false;});
    $('#hsCard').classList.add('hidden');
    A.toast('当前 Blender 模型未配置热点元数据');
    return;
  }
  A.hsOn=!A.hsOn;
  A.hotspots.forEach(s=>{s.visible=A.hsOn;});
  if(!A.hsOn)$('#hsCard').classList.add('hidden');
  A.toast('信息热点 '+(A.hsOn?'显示':'隐藏'));
};
A.hotspotLive=function(h){
  const t=h.liveId?A.byId(h.liveId):A.byId(h.id);
  return t&&t.userData.meta&&t.userData.meta.live;
};
A.showHotspot=function(h,x,y){
  const card=$('#hsCard');
  const live=A.hotspotLive(h);
  let lv='';
  if(live){
    const ratio=live.temp/live.tempMax;
    const st=ratio>.9?'rd':ratio>.72?'yl':'gn';
    const stTxt={gn:'正常运行',yl:'注意',rd:'告警'}[st];
    lv='<div class="r" style="margin-top:6px;border-top:1px solid rgba(0,208,255,.15);padding-top:6px">'+
       '<span>状态</span><b><span class="badge '+st+'">'+stTxt+'</span></b></div>'+
       '<div class="r"><span>转速</span><b class="lv" data-lv="rpm">'+live.rpm+'</b></div>'+
       '<div class="r"><span>'+(live.unit==='V'?'电压':'功率')+'</span><b class="lv" data-lv="power">'+live.power+' '+(live.unit||'MW')+'</b></div>'+
       '<div class="r"><span>温度</span><b class="lv" data-lv="temp">'+live.temp+' °C</b></div>';
  }
  card.innerHTML='<button class="cls">✕</button><h4>'+h.n+' '+h.name+'</h4><div class="en">'+h.en+'</div>'+
    h.rows.map(r=>'<div class="r"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('')+lv;
  card.classList.remove('hidden');
  card.querySelector('.cls').addEventListener('click',()=>{
    card.classList.add('hidden');A._hsOpen=null;
  });
  A._hsOpen={h:h};
  card.style.left=Math.min(x+18,innerWidth-260)+'px';
  card.style.top=Math.max(60,y-30)+'px';
  const tgt=A.byId(h.id);
  if(tgt)A.select([tgt],{tree:false});
};
A.liveTick=function(){
  A.activeRegistry().forEach(o=>{
    const m=o.userData.meta;
    if(!m||!m.live)return;
    const l=m.live;
    if(l.rpmMax>1)l.rpm=Math.round(Math.max(0,Math.min(l.rpmMax,l.rpm+(Math.random()-.5)*4)));
    l.temp=+(Math.max(l.tempMax*.55,Math.min(l.tempMax,l.temp+(Math.random()-.5)*1.6))).toFixed(1);
  });
  if(A._hsOpen&&!$('#hsCard').classList.contains('hidden')){
    const live=A.hotspotLive(A._hsOpen.h);
    if(live){
      const c=$('#hsCard');
      const set=(k,val)=>{const el=c.querySelector('[data-lv="'+k+'"]');if(el)el.textContent=val;};
      set('rpm',live.rpm);
      set('power',live.power+' '+(live.unit||'MW'));
      set('temp',live.temp+' °C');
    }
  }
  if(S.sel.length===1){
    const l=S.sel[0].userData.meta.live;
    if(l){
      const set=(id,val)=>{const el=$(id);if(el)el.textContent=val;};
      set('#lvRpm',l.rpm);
      set('#lvPow',l.power+' '+(l.unit||'MW'));
      set('#lvTmp',l.temp+' °C');
    }
  }
};

/* ───────── 属性面板 ───────── */
A.renderProps=function(){
  const el=$('#propBody');
  if(!el)return;
  if(!S.sel.length){
    el.innerHTML='<div class="prow hud-hint">点击模型或结构树查看部件属性</div>';
    return;
  }
  if(S.sel.length>1){
    el.innerHTML='<div class="pp-name">已选择 '+S.sel.length+' 个对象</div>'+
      S.sel.map(o=>'<div class="pp-row"><span class="k">'+o.userData.meta.name+'</span><span class="v mono">'+o.userData.meta.id+'</span></div>').join('')+
      '<div class="hud-hint prow">可执行：隐藏(Del) · 隔离 · 反选隐藏</div>';
    return;
  }
  const m=S.sel[0].userData.meta;
  const T=T3();
  const box=new T.Box3().setFromObject(S.sel[0]);
  const sz=box.getSize(new T.Vector3()),ct=box.getCenter(new T.Vector3());
  const row=(k,v)=>v!==undefined&&v!==null&&v!==''?'<div class="pp-row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>':'';
  const w=m.weight!=null?(typeof m.weight==='number'?(m.weight>1000?(m.weight/1000).toFixed(1)+' t':m.weight+' kg'):m.weight):null;
  let live='';
  if(m.live){
    const l=m.live;
    const st=l.temp/l.tempMax>.9?'rd':l.temp/l.tempMax>.72?'yl':(l.rpm===0&&l.power===0)?'gy':'gn';
    const stTxt={gn:'正常运行',yl:'注意',rd:'告警',gy:'停机'}[st];
    live='<div class="pp-sec">DIGITAL TWIN · 实时数据（模拟）</div>'+
      '<div class="pp-row"><span class="k">设备状态</span><span class="v"><span class="badge '+st+'">'+stTxt+'</span></span></div>'+
      '<div class="pp-row"><span class="k">转速 RPM</span><span class="v live-v" id="lvRpm">'+l.rpm+'</span></div>'+
      '<div class="pp-row"><span class="k">'+(l.unit==='V'?'电压':'功率')+'</span><span class="v live-v" id="lvPow">'+l.power+' '+(l.unit||'MW')+'</span></div>'+
      '<div class="pp-row"><span class="k">温度</span><span class="v live-v" id="lvTmp">'+l.temp+' °C</span></div>';
  }
  el.innerHTML=
    '<div class="pp-name">'+m.name+'</div>'+
    '<div class="pp-en">'+(m.en||'')+'</div>'+
    row('ID',m.id)+row('系统',m.system)+row('类型',m.type)+row('甲板区域',m.deck)+
    row('所在舱室',m.compartment)+row('厂商',m.manufacturer)+row('型号',m.model)+
    row('重量',w)+row('材料',m.material)+row('安装日期',m.install)+row('上次检验',m.insp)+
    row('外包尺寸 纵×横×垂',sz.length()<10000&&sz.length()>.01?sz.x.toFixed(1)+' × '+sz.z.toFixed(1)+' × '+sz.y.toFixed(1)+' m':null)+
    row('中心坐标','('+ct.x.toFixed(1)+', '+ct.z.toFixed(1)+', '+ct.y.toFixed(1)+')')+
    live;
};

/* ───────── 搜索 ───────── */
A.doSearch=function(text){
  const drop=$('#searchDrop'),sb=$('#searchBox');
  text=(text||'').trim().toLowerCase();
  if(!text){drop.style.display='none';return;}
  const hits=[];
  A.activeRegistry().forEach(o=>{
    const m=o.userData.meta;
    if(m.id&&A.activeFeatureObject(m.id)!==o)return;
    const hay=((m.name||'')+' '+(m.en||'')+' '+(m.id||'')).toLowerCase();
    if(hay.includes(text))hits.push(o);
  });
  hits.sort((a,b)=>(a.userData.meta.kind==='sys'?1:0)-(b.userData.meta.kind==='sys'?1:0));
  drop.innerHTML='';
  hits.slice(0,12).forEach(o=>{
    const m=o.userData.meta;
    const d=document.createElement('div');
    d.className='sr';
    d.innerHTML='<b>'+m.name+'</b><span class="sys">'+(m.system||m.type||'')+'</span><span class="sid">'+m.id+'</span>';
    d.addEventListener('mousedown',()=>{
      A.select([o]);
      A.fitView(o);
      sb.value='';
      drop.style.display='none';
      A.toast('已定位：'+m.name);
    });
    drop.appendChild(d);
  });
  if(!hits.length)drop.innerHTML='<div class="sr hud-hint">未找到匹配部件</div>';
  drop.style.display='block';
};

/* ───────── BOM ───────── */
A.buildBOM=function(){
  const el=$('#bomScroll');
  if(!el)return;
  el.innerHTML='';
  A.modelRoots().forEach(root=>{
    if(!root.userData.meta||root.name==='Compartments')return;
    /* GLTF 的场景根只承载一个中间 Scene 节点；BOM 直接展开到系统层。 */
    let systems=[root];
    if(root===A.externalModel){
      const stage=root.children.find(c=>c.userData.meta);
      const importedSystems=stage?.children?.filter(c=>c.userData.meta&&c.userData.meta.kind==='sys')||[];
      if(importedSystems.length)systems=importedSystems;
    }
    systems.forEach(sys=>{
      if(!sys.userData.meta||sys.name==='Compartments')return;
      const g=document.createElement('div');
      g.className='bom-grp';
      g.textContent=sys.userData.meta.name+' · '+sys.userData.meta.en;
      el.appendChild(g);
      const kids=sys.children.filter(c=>c.userData.meta);
      (kids.length?kids:[sys]).forEach(ch=>{
        const m=ch.userData.meta;
        let qty=0;
        App.eachMesh(ch,()=>qty++);
        const w=m.weight!=null?(typeof m.weight==='number'?(m.weight>1000?(m.weight/1000).toFixed(1)+' t':m.weight+' kg'):m.weight):'—';
        const d=document.createElement('div');
        d.className='bom-row';
        d.innerHTML='<span class="n">'+m.name+' <span style="color:var(--dim)">'+(m.en||'')+'</span></span><span class="q">×'+(qty||1)+'</span><span class="w">'+w+'</span>';
        d.addEventListener('click',()=>{A.select([ch]);A.fitView(ch);});
        el.appendChild(d);
      });
    });
  });
};

/* ───────── 甲板 / 舱室 / 系统 列表 ───────── */
A.buildDeckList=function(){
  const el=$('#deckList');
  if(!el)return;
  el.innerHTML='';
  [['驾驶甲板',24.7],['主甲板',12.3],['二层甲板',4.3],['内底板',-3.7],['双层底',-8.3]].forEach(d=>{
    const b=document.createElement('button');
    b.innerHTML=d[0]+'<span class="en">Z = '+d[1]+' m</span>';
    b.addEventListener('click',()=>{
      A.setSectionMode('y');
      S.section.val=d[1];
      $('#secSlider').value=d[1];
      A.updateSecVal();
      A.applySection();
      A.flyTo([0,d[1]+115,26],[0,d[1],0],1);
      A.showPop('pop-decks');
      A.toast('已切换至 '+d[0]+' · 剖切高度 '+d[1]+' m');
    });
    el.appendChild(b);
  });
};
A.buildCompList=function(){
  const el=$('#compList');
  if(!el)return;
  el.innerHTML='';
  const comps=A.activeCompartmentRoot();
  if(!comps){el.innerHTML='<div class="prow hud-hint">当前模型未提供可识别的舱室/液舱节点</div>';return;}
  comps.visible=true;
  (comps?comps.children:[]).filter(c=>c.userData.meta).forEach(c=>{
    const m=c.userData.meta;
    const b=document.createElement('button');
    b.innerHTML=m.name+'<span class="en">'+m.en+'</span>';
    b.addEventListener('click',()=>{
      App.pushUndo();
      ['SYS-HULL','SYS-SUPER'].forEach(id=>{
        const o=A.byId(id);
        if(o)App.setOpacity(o,.06,false);
      });
      comps.visible=true;
      c.visible=true;
      const T=T3();
      const box=new T.Box3().setFromObject(c);
      const center=m.center?new T.Vector3(m.center[0],m.center[1],m.center[2]):box.getCenter(new T.Vector3());
      const size=box.getSize(new T.Vector3()).length();
      A.flyTo([center.x+size*.42,center.y+size*.3,center.z+size*.42],[center.x,center.y,center.z],1);
      A.showPop('pop-comps');
      A.toast('已进入 '+m.name+' · 船壳已透明化');
    });
    el.appendChild(b);
  });
};
A.buildSysList=function(){
  const el=$('#sysList');
  if(!el)return;
  el.innerHTML='';
  const flow=A.activeFlow();
  if(!flow.length){
    el.innerHTML='<div class="prow hud-hint">当前模型没有可识别的管路路径，已保留系统节点浏览。</div>';
    return;
  }
  flow.forEach(sys=>{
    const canFlow=Array.isArray(sys.curves)&&sys.curves.length>0;
    const d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:7px;margin-top:6px';
    d.innerHTML='<span class="dot" style="background:'+sys.color+'"></span>'+
      '<span style="flex:1">'+sys.name+'<span class="en">'+sys.en+'</span></span>'+
      '<button data-a="flow" '+(canFlow?'':'disabled')+' style="border:1px solid var(--bd);border-radius:4px;padding:3px 8px;font-size:11px">'+(canFlow?'流动':'无路径')+'</button>'+
      '<button data-a="iso" style="border:1px solid var(--bd);border-radius:4px;padding:3px 8px;font-size:11px">隔离</button>'+
      '<button data-a="eye" style="border:1px solid var(--bd);border-radius:4px;padding:3px 8px;font-size:11px">👁</button>';
    d.querySelector('[data-a="flow"]').addEventListener('click',ev=>{
      if(!canFlow){A.toast('当前模型未提供该管路的可动画路径');return;}
      sys._flow=!sys._flow;
      A.ensureFlowPoints();
      sys._pts.visible=sys._flow;
      ev.target.style.background=sys._flow?sys.color:'';
      ev.target.style.color=sys._flow?'#04121e':'';
    });
    d.querySelector('[data-a="iso"]').addEventListener('click',()=>A.isolate(sys.group));
    d.querySelector('[data-a="eye"]').addEventListener('click',ev=>{
      sys.group.visible=!sys.group.visible;
      ev.target.style.opacity=sys.group.visible?1:.35;
    });
    el.appendChild(d);
  });
};

/* ───────── 管路流动粒子 ───────── */
A.ensureFlowPoints=function(){
  const T=T3();
  A.activeFlow().forEach(sys=>{
    if(sys._pts)return;
    if(!sys.curves||!sys.curves.length)return;
    const N=sys.curves.length*16;
    const pos=new Float32Array(N*3);
    const pts=new T.Points(
      new T.BufferGeometry(),
      new T.PointsMaterial({color:sys.color,size:1.15,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));
    pts.userData.params=[];
    for(let i=0;i<N;i++)pts.userData.params.push({ci:Math.floor(i/16),t:Math.random(),sp:.06+Math.random()*.05});
    pts.geometry.setAttribute('position',new T.BufferAttribute(pos,3));
    pts.visible=!!sys._flow;
    pts.frustumCulled=false;
    (sys.external&&sys.group?sys.group:A.scene).add(pts);
    sys._pts=pts;
  });
};
A.toggleFlow=function(){
  const flow=A.activeFlow();
  if(!flow.length||!flow.some(s=>s.curves&&s.curves.length)){
    A.flowOn=false;
    A.toast('当前模型没有可动画的管路路径');
    return;
  }
  A.flowOn=!A.flowOn;
  A.ensureFlowPoints();
  flow.forEach(s=>{
    if(s._pts)s._pts.visible=A.flowOn;
    if(A.flowOn)s._flow=true;
  });
  const b=$('#flowBtn');
  if(b)b.textContent=A.flowOn?'⏸ 流动动画':'▶ 流动动画';
  A.toast(A.flowOn?'管路流动动画开启 · 粒子沿管路运行':'管路流动动画关闭');
};

/* ───────── 推进演示 ───────── */
A.togglePropAnim=function(silent){
  A.propOn=silent?true:!A.propOn;
  const T=T3();
  if(A.propOn&&!A._propPts){
    A._propCurve=A.buildPropulsionPath();
    if(!A._propCurve){
      A.propOn=false;
      if(!silent)A.toast('当前模型缺少推进链路节点（ME/GB/SH/PP），无法对齐演示');
      return;
    }
    const N=14,pos=new Float32Array(N*3);
    A._propPts=new T.Points(
      new T.BufferGeometry(),
      new T.PointsMaterial({color:'#ffb14d',size:1.6,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));
    A._propPts.userData.params=[];
    for(let i=0;i<N;i++)A._propPts.userData.params.push({t:i/N});
    A._propPts.geometry.setAttribute('position',new T.BufferAttribute(pos,3));
    A._propPts.frustumCulled=false;
    (A.externalLoaded&&App.externalModel?App.externalModel:A.scene).add(A._propPts);
  }
  if(A._propPts)A._propPts.visible=A.propOn;
  if(!silent)A.toast(A.propOn?'推进演示：主机 → 齿轮箱 → 轴系 → 螺旋桨（能量流）':'推进演示已停止');
};

/* ───────── 教学漫游 ───────── */
A.tourSteps=[
  {name:'STEP 1 · 主机',title:'主机 MAIN ENGINE',desc:'低速柴油机 MAN 6G70ME-C · 额定功率 11.6 MW · 位于机舱中部',
   id:'ME-001',cam:[[-32,17,30],[-58,5,0]],dur:6},
  {name:'STEP 2 · 齿轮箱',title:'齿轮箱 GEARBOX',desc:'减速齿轮箱 · 传动比 5.2 : 1 · 将主机转速降至桨效最优区间',
   id:'GB-001',cam:[[-26,12,24],[-41.5,-1,0]],dur:5},
  {name:'STEP 3 · 轴系',title:'轴系 SHAFT LINE',desc:'中间轴经艉轴管穿出船体 · 将扭矩传递至螺旋桨',
   id:'SH-001',cam:[[-62,8,20],[-80,-3,0]],dur:6},
  {name:'STEP 4 · 螺旋桨',title:'螺旋桨 PROPELLER',desc:'5 叶定距桨 · 直径 8.4 m · 演示旋转与能量流',
   id:'PP-001',cam:[[-82,6,26],[-104,-3,0]],dur:7,act:function(){if(!A.propOn)A.togglePropAnim(true);}},
  {name:'STEP 5 · 全船概览',title:'全船概览 OVERVIEW',desc:'推进系统漫游完成 · 船长 200 m · 演示结束',
   id:null,cam:[[138,82,138],[0,8,0]],dur:5}
];
A.startTour=function(){
  if(A.tour&&A.tour.on)return A.stopTour();
  A.refreshTourTargets();
  A.tour={on:true,playing:true,step:-1,t:0,speed:+($('#tlSpeed').value||1),
    durs:A.tourSteps.map(s=>s.dur),total:A.tourSteps.reduce((a,s)=>a+s.dur,0)};
  App.pushUndo();
  const keep=[A.activeFeatureObject('SYS-PROP'),A.activeFeatureObject('SYS-PIPE')].filter(Boolean);
  if(keep.length)A.ghostOthers(keep);
  $('#timeline').classList.remove('hidden');
  $('#tourCap').classList.remove('hidden');
  const ticks=$('#tlTicks');
  ticks.innerHTML='';
  let acc=0;
  A.tourSteps.forEach((s,i)=>{
    if(i>0){
      const tk=document.createElement('div');
      tk.className='tk';
      tk.style.left=(acc/A.tour.total*100)+'%';
      tk.innerHTML='<i>'+s.name.split('·')[1]+'</i>';
      ticks.appendChild(tk);
    }
    acc+=s.dur;
  });
  $('#tlPlay').textContent='⏸';
  A.tourGoto(0);
  A.toast('教学漫游开始：Ship Propulsion System Tour');
};
A.tourGoto=function(i){
  const t=A.tour;
  if(!t||!t.on)return;
  i=Math.max(0,Math.min(A.tourSteps.length-1,i));
  let acc=0;
  for(let k=0;k<i;k++)acc+=t.durs[k];
  t.t=acc+.01;
  t.playing=true;
  $('#tlPlay').textContent='⏸';
};
A.tourSeek=function(tt){
  const t=A.tour;
  if(!t)return;
  t.t=Math.max(0,Math.min(t.total,tt));
  let i=0,acc=0;
  while(i<t.durs.length-1&&t.t>=acc+t.durs[i]){acc+=t.durs[i];i++;}
  if(i!==t.step){
    t.step=i;
    const s=A.tourSteps[i];
    $('#tcStep').textContent=s.name;
    $('#tcTitle').textContent=s.title;
    $('#tcDesc').textContent=s.desc;
    if(s.id){
      const o=A.activeFeatureObject(s.id);
      if(o)A.select([o],{tree:false});
    }
    if(s.act)s.act();
  }
};
A.tourPlayPause=function(){
  const t=A.tour;
  if(!t)return;
  t.playing=!t.playing;
  $('#tlPlay').textContent=t.playing?'⏸':'▶';
};
A.stopTour=function(){
  if(!A.tour||!A.tour.on)return;
  A.tour.on=false;
  $('#timeline').classList.add('hidden');
  $('#tourCap').classList.add('hidden');
  A.clearGhost();
  if(A.propOn){
    A.propOn=false;
    if(A._propPts)A._propPts.visible=false;
  }
  A.toast('漫游结束');
};
A.tickTour=function(dt){
  const t=A.tour;
  if(!t||!t.on)return;
  if(t.playing){
    t.t+=dt*t.speed;
    if(t.t>=t.total){
      t.t=t.total-.01;
      t.playing=false;
      $('#tlPlay').textContent='▶';
    }
    A.tourSeek(t.t);
  }
  let i=0,acc=0;
  while(i<t.durs.length-1&&t.t>=acc+t.durs[i]){acc+=t.durs[i];i++;}
  const k=ease(Math.min(1,(t.t-acc)/t.durs[i]));
  const cur=A.tourSteps[i],nxt=A.tourSteps[Math.min(i+1,A.tourSteps.length-1)];
  A.cam.position.lerpVectors(v3(cur.cam[0]),v3(nxt.cam[0]),k);
  A.controls.target.lerpVectors(v3(cur.cam[1]),v3(nxt.cam[1]),k);
  $('#tlFill').style.width=(t.t/t.total*100)+'%';
  $('#tlLabel').textContent=(t.playing?'▶ ':'⏸ ')+cur.name;
};

/* ───────── 行走漫游 ───────── */
A.toggleWalk=function(){
  const w=S.walk;
  w.on=!w.on;
  const canvas=A.renderer.domElement;
  if(w.on){
    A.controls.enabled=false;
    A.cam.position.set(40,14.6,0);
    A.walk.yaw=-Math.PI/2;
    A.walk.pitch=0;
    $('#walkHint').classList.remove('hidden');
    $('#cross').classList.remove('hidden');
    const qb=$('#qbar [data-cmd="walk"]');
    if(qb)qb.classList.add('on');
    if(canvas.requestPointerLock)canvas.requestPointerLock();
    A.hint('行走模式：WASD 移动 · 鼠标转向 · Q/E 升降 · Esc 退出');
  }else{
    A.controls.enabled=true;
    if(document.exitPointerLock)document.exitPointerLock();
    $('#walkHint').classList.add('hidden');
    $('#cross').classList.add('hidden');
    const qb=$('#qbar [data-cmd="walk"]');
    if(qb)qb.classList.remove('on');
    const d=new (T3()).Vector3(-Math.cos(A.walk.yaw),0,-Math.sin(A.walk.yaw)).multiplyScalar(10);
    A.controls.target.copy(A.cam.position).add(d);
  }
};
A.tickWalk=function(dt){
  if(!S.walk.on)return;
  const k=A.walkKeys,sp=(k.shift?34:14)*dt;
  const fwd=new (T3()).Vector3(-Math.cos(A.walk.yaw),0,-Math.sin(A.walk.yaw));
  const right=new (T3()).Vector3(-fwd.z,0,fwd.x);
  const mv=new (T3()).Vector3();
  if(k.w)mv.add(fwd);
  if(k.s)mv.sub(fwd);
  if(k.d)mv.add(right);
  if(k.a)mv.sub(right);
  if(k.e)mv.y+=1;
  if(k.q)mv.y-=1;
  if(mv.lengthSq()>0){
    mv.normalize();
    A.cam.position.addScaledVector(mv,sp);
  }
  A.cam.position.y=Math.max(1.6,Math.min(58,A.cam.position.y));
  A.cam.position.x=Math.max(-400,Math.min(400,A.cam.position.x));
  A.cam.position.z=Math.max(-220,Math.min(220,A.cam.position.z));
  const dir=new (T3()).Vector3(
    -Math.cos(A.walk.pitch)*Math.cos(A.walk.yaw),
    Math.sin(A.walk.pitch),
    -Math.cos(A.walk.pitch)*Math.sin(A.walk.yaw));
  A.cam.lookAt(A.cam.position.clone().add(dir));
};

/* ───────── 剥离模式 ───────── */
A.peelStages=[
  {n:'S0 · 整船 FULL SHIP',f:function(){
    A.showAll();A.resetDisplay();A.setExplode(0);
  }},
  {n:'S1 · 剥离外壳 OFF HULL',f:function(){
    A.showAll();A.resetDisplay();
    ['SYS-HULL','SYS-SUPER'].forEach(id=>{
      const o=A.byId(id);
      if(o)App.setOpacity(o,.07,false);
    });
  }},
  {n:'S2 · 剥离甲板 OFF DECKS',f:function(){
    A.peelStages[1].f();
    ['DECK-MAIN','DECK-2ND','DECK-TT','DECK-DB','HULL-FRAMES','BHD-1','BHD-2','BHD-3','BHD-4','BHD-5','BHD-6']
      .forEach(id=>{
        const o=A.byId(id);
        if(o)o.visible=false;
      });
  }},
  {n:'S3 · 显示舱室 COMPARTMENTS',f:function(){
    A.peelStages[2].f();
    const c=A.activeCompartmentRoot();
    if(c)c.visible=true;
  }},
  {n:'S4 · 系统视图 SYSTEMS',f:function(){
    A.showAll();A.resetDisplay();
    A.ghostOthers([A.byId('SYS-PIPE'),A.byId('SYS-PROP'),A.byId('SYS-PWR')]);
  }},
  {n:'S5 · 设备聚焦 EQUIPMENT',f:function(){
    A.showAll();A.resetDisplay();
    A.ghostOthers([A.byId('SYS-PROP'),A.byId('SYS-PWR'),A.byId('SYS-DECK'),A.byId('SYS-TANK')]);
    const p=A.byId('SYS-PIPE');
    if(p)App.setOpacity(p,.25,true);
  }}
];
A.peelTo=function(i){
  i=Math.max(0,Math.min(A.peelStages.length-1,i));
  A.peel=i;
  App.pushUndo();
  A.peelStages[i].f();
  $('#peelDesc').textContent='当前层：'+A.peelStages[i].n;
  $$('#peelBtns button, #peelSteps button').forEach(b=>b.classList.toggle('on',+b.dataset.s===i));
};
A.renderPeelSteps=function(){
  [['#peelBtns','#peelDesc'],['#peelSteps']].forEach(pair=>{
    const el=$(pair[0]);
    if(!el)return;
    el.innerHTML='';
    A.peelStages.forEach((s,i)=>{
      const b=document.createElement('button');
      b.textContent=s.n;
      b.dataset.s=i;
      b.addEventListener('click',()=>A.peelTo(i));
      el.appendChild(b);
    });
  });
};

/* ───────── 书签 ───────── */
A.saveBookmark=function(name){
  name=(name||'').trim()||('视角 '+String(A.bookmarks.length+1).padStart(2,'0'));
  A.bookmarks.push({name:name,pos:A.cam.position.toArray(),tgt:A.controls.target.toArray()});
  $('#bkmName').value='';
  $('#bkmName2').value='';
  A.renderBkmList();
  A.toast('书签已保存：'+name);
};
A.renderBkmList=function(){
  ['#bkmList','#bkmList2'].forEach(sel=>{
    const el=$(sel);
    if(!el)return;
    el.innerHTML='';
    if(!A.bookmarks.length){
      el.innerHTML='<div class="hud-hint prow">暂无书签 · 保存当前视角后可一键恢复</div>';
      return;
    }
    A.bookmarks.forEach((b,i)=>{
      const d=document.createElement('div');
      d.style.cssText='display:flex;gap:5px;margin-top:5px';
      d.innerHTML='<button style="flex:1;text-align:left;border:1px solid var(--bd);border-radius:4px;padding:5px 9px;font-size:12px">'+b.name+'</button>'+
        '<button data-x="1" style="border:1px solid var(--bd);border-radius:4px;padding:5px 8px;font-size:11px">✕</button>';
      d.querySelector('button').addEventListener('click',()=>A.flyTo(b.pos,b.tgt,.9));
      d.querySelector('[data-x]').addEventListener('click',()=>{A.bookmarks.splice(i,1);A.renderBkmList();});
      el.appendChild(d);
    });
  });
};

/* ───────── 内置 Blender 船模 / 外部 GLB 导入 ───────── */
A._importMeta=function(o,fallbackId,fallbackKind){
  const raw=o&&o.userData&&typeof o.userData==='object'?o.userData:{};
  const sourceMeta=raw.meta&&typeof raw.meta==='object'
    ?Object.assign({},raw,raw.meta):Object.assign({},raw);
  delete sourceMeta.meta;
  const meta=Object.assign({},sourceMeta);
  meta.id=String(meta.id||fallbackId);
  meta.name=meta.name||o.name||fallbackId;
  meta.en=meta.en||meta.name;
  meta.system=meta.system||'外部模型';
  meta.type=meta.type||fallbackKind;
  meta.kind=meta.kind||(fallbackKind==='sys'?'sys':(o.children&&o.children.length?'sub':'part'));
  return meta;
};

A._prepareImportedMaterial=function(material){
  if(!material)return;
  const m=material.clone?material.clone():material;
  m.userData=m.userData||{};
  m.userData.baseOpacity=m.opacity;
  m.userData.baseEmissive=m.emissive?m.emissive.getHex():0;
  m.userData.baseEI=m.emissiveIntensity!==undefined?m.emissiveIntensity:1;
  return m;
};

A._metaRank=function(kind){return ({part:1,sub:2,sys:3}[kind]||0);};
A._clearImportedState=function(){
  if(A.tour&&A.tour.on)A.stopTour();
  if(S.ghosted)App.clearGhost();
  if(A.select)A.select([]);
  const oldFlows=[...(App.flow||[]),...(A.externalFlow||[])];
  oldFlows.forEach(sys=>{
    if(sys._pts){sys._pts.parent?.remove(sys._pts);sys._pts=null;}
    sys._flow=false;
  });
  if(A._propPts){A._propPts.parent?.remove(A._propPts);A._propPts=null;}
  A._propCurve=null;A.propOn=false;A.flowOn=false;A.externalFlow=[];
  if(A.tourSteps)A.tourSteps.forEach(s=>{delete s.baseCam;});
  App.clearBlenderPresentation?.();
  if(App.externalModel)App.model.root.remove(App.externalModel);
  App.externalModel=null;App.externalLoaded=false;
  App.externalRegistry=[];App.externalByIdMap={};
  App.registry=App.baseRegistry;
  App.activeByIdMap=App.baseByIdMap;
  App.byIdMap=App.activeByIdMap;
  S.undoStack.length=0;S.redoStack.length=0;
  App.model.root.children.forEach(c=>{if(c.userData.meta)c.visible=true;});
  if(App.water)App.water.visible=true;
  App.hotspots.forEach(h=>h.visible=true);
};

A._attachImportedGLTF=function(gltf,fileName){
  A._clearImportedState();
  const T=T3(),g=gltf.scene;
  const box=new T.Box3().setFromObject(g);
  const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  const scale=180/Math.max(size.x,size.y,size.z,.001);
  const isBuiltin=/ship-blender\.glb$/i.test(fileName||'');
  const modelName=isBuiltin?'Blender 精细船模':'外部模型 · '+(fileName||'未命名模型');
  const wrap=new T.Group();
  wrap.name=isBuiltin?'BlenderFineShip':'ExternalModel';
  g.position.sub(center);
  wrap.add(g);
  wrap.scale.setScalar(scale);
  wrap.userData.meta={id:'EXT-BLENDER-SHIP',name:modelName,
    en:isBuiltin?'BLENDER FINE SHIP MODEL':'IMPORTED MODEL',system:'外部模型',type:'Imported',kind:'sys',source:fileName,
    detailLevel:isBuiltin?'high':'external'};
  wrap.userData.selectable=true;

  const externalMap={};
  const register=function(o,fallbackId,fallbackKind){
    const meta=A._importMeta(o,fallbackId,fallbackKind);
    o.userData.meta=meta;
    o.userData.selectable=true;
    if(!App.externalRegistry.includes(o))App.externalRegistry.push(o);
    if(meta.id){
      const previous=externalMap[meta.id];
      const previousKind=previous?.userData?.meta?.kind;
      if(!previous||A._metaRank(meta.kind)>A._metaRank(previousKind))externalMap[meta.id]=o;
    }
    if(o.isMesh){
      o.castShadow=true;o.receiveShadow=true;
      if(Array.isArray(o.material))o.material=o.material.map(A._prepareImportedMaterial);
      else o.material=A._prepareImportedMaterial(o.material);
      if(!A.pickables.includes(o))A.pickables.push(o);
    }
    return o;
  };

  // 给 GLTF 场景根也挂元数据，确保结构树可以展开到系统级节点。
  register(g,'EXT-BLENDER-SCENE','sub');
  let n=0;
  g.traverse(function(o){
    if(o===g)return;
    if(o.isMesh)register(o,'EXT-P'+String(++n).padStart(3,'0'),'part');
    else if(o.isObject3D&&o.children&&o.children.length)
      register(o,'EXT-G'+String(++n).padStart(3,'0'),'sub');
  });
  register(wrap,'EXT-BLENDER-SHIP','sys');

  App.model.root.add(wrap);
  App.externalModel=wrap;
  App.externalLoaded=true;
  App.scene.updateMatrixWorld(true);
  if(isBuiltin){
    /* 只有项目自带的 Blender GLB 使用其参考相机/灯光/海面；
       任意用户导入的 GLB 保留平台的通用适配视图。 */
    if(App.water)App.water.visible=false;
    App.applyBlenderPresentation(wrap,center,scale);
  }else{
    if(App.water)App.water.visible=true;
    A.fitView(wrap);
  }
  App.externalByIdMap=externalMap;
  App.registry=App.externalRegistry;
  App.activeByIdMap=App.externalByIdMap;
  App.byIdMap=App.activeByIdMap;
  A.externalFlow=A.bindFlowToActiveModel();
  App.hideProceduralDemo();
  App.hotspots.forEach(h=>h.visible=false);
  App.buildTree();
  A.buildBOM();
  App.computeExplode();
  A.refreshTourTargets();
  App.updateStats();
  $('#stModel').textContent=isBuiltin?'BLENDER 精细船模 · 200M':String(fileName||'外部模型').toUpperCase();
  App.pushUndo();
  A.toast('已接入 '+modelName+' · '+n+' 个可识别节点');
  return wrap;
};

A.loadGLBBuffer=function(buffer,fileName){
  return new Promise((resolve,reject)=>{
    try{
      new A.GLTFLoader().parse(buffer,'',gltf=>{
        try{resolve(A._attachImportedGLTF(gltf,fileName));}
        catch(err){reject(err);}
      },reject);
    }catch(err){reject(err);}
  });
};

A.loadGLB=function(file){
  if(!file)return Promise.resolve(null);
  A.toast('正在解析 '+file.name+' …',6000);
  return new Promise((resolve,reject)=>{
    const rd=new FileReader();
    rd.onload=()=>A.loadGLBBuffer(rd.result,file.name).then(resolve).catch(err=>{
      A.toast('GLB 解析失败：'+err.message);reject(err);
    });
    rd.onerror=()=>{const err=rd.error||new Error('文件读取失败');A.toast(err.message);reject(err);};
    rd.readAsArrayBuffer(file);
  });
};

A.loadGLBUrl=function(url,fileName='ship-blender.glb'){
  A.toast('正在加载 '+fileName+' …',6000);
  return fetch(url,{cache:'no-store'}).then(response=>{
    if(!response.ok)throw new Error('HTTP '+response.status+'：'+url);
    return response.arrayBuffer();
  }).then(buffer=>A.loadGLBBuffer(buffer,fileName)).catch(err=>{
    A.toast('Blender 船模加载失败：'+err.message);
    throw err;
  });
};

/* ───────── 热力图（演示） ───────── */
A.toggleHeatmap=function(){
  const T=T3();
  if(!A._heat){
    A._heat={saved:[],mats:[]};
    ['HULL-OUTER','SUP-T1','SUP-T2','SUP-T3','SUP-T4'].forEach(id=>{
      const o=A.byId(id);
      if(!o)return;
      App.eachMesh(o,function(m){
        if(!m.geometry.attributes.color){
          const p=m.geometry.attributes.position,n=p.count;
          const col=new Float32Array(n*3);
          for(let i=0;i<n;i++){
            const x=p.getX(i),y=p.getY(i);
            let t=.5+.5*Math.sin(x*.11)*Math.cos(y*.15+x*.03)+.18*Math.sin(x*.31+y*.21);
            t=Math.max(0,Math.min(1,t));
            const c=new T.Color().setHSL(.66-.66*t,.95,.5);
            col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;
          }
          m.geometry.setAttribute('color',new T.BufferAttribute(col,3));
        }
        A._heat.saved.push(m);
        A._heat.mats.push(m.material);
      });
    });
  }
  A._heatOn=!A._heatOn;
  A._heat.saved.forEach(function(m,i){
    if(A._heatOn){
      m.material=new T.MeshStandardMaterial({vertexColors:true,metalness:.4,roughness:.55,side:T.DoubleSide});
    }else{
      m.material=A._heat.mats[i];
    }
  });
  A.toast(A._heatOn?'温度热力图（演示数据）：蓝=低温 → 红=高温':'已退出热力图');
};

/* ───────── 帮助 ───────── */
A.showHelp=function(){
  const el=$('#helpModal');
  el.innerHTML='<div class="card">'+
    '<h3>OCEAN·DT 操作指南</h3>'+
    '<table>'+
    '<tr><td>左键拖动</td><td>旋转视图</td></tr>'+
    '<tr><td>右键拖动</td><td>平移视图</td></tr>'+
    '<tr><td>滚轮</td><td>缩放</td></tr>'+
    '<tr><td>双击对象</td><td>聚焦该部件</td></tr>'+
    '<tr><td>Ctrl + 点击</td><td>多选</td></tr>'+
    '<tr><td>E / S / X / M</td><td>爆炸 / 剖切 / X-Ray / 测量</td></tr>'+
    '<tr><td>W</td><td>行走漫游（WASD + 鼠标）</td></tr>'+
    '<tr><td>F / R</td><td>适配视图 / 全部复位</td></tr>'+
    '<tr><td>H / Delete</td><td>全部显示 / 隐藏所选</td></tr>'+
    '<tr><td>P</td><td>截图导出 PNG</td></tr>'+
    '<tr><td>Ctrl+Z / Ctrl+Y</td><td>撤销 / 重做</td></tr>'+
    '<tr><td>F1 / Esc</td><td>帮助 / 退出当前模式</td></tr>'+
    '</table>'+
    '<p class="hud-hint" style="margin-top:12px">支持拖入外部 GLB/GLTF 模型，自动接入结构树 / 搜索 / 属性系统。'+
    '剖切支持横剖（按肋位）、纵剖、水平（按甲板高度）与六面剖面盒；管路系统支持流动粒子动画与分系统隔离。</p>'+
    '<button class="x" id="helpClose">关闭</button></div>';
  el.classList.remove('hidden');
  $('#helpClose').addEventListener('click',()=>el.classList.add('hidden'));
  el.addEventListener('click',function(ev){if(ev.target===el)el.classList.add('hidden');},{once:true});
};

/* ───────── 特性主循环 ───────── */
A.tickFeatures=function(dt,t){
  if(A._hoverTick)A._hoverTick();
  const mast=A.activeFeatureObject('NV-MAST');
  if(mast&&mast.userData.spin)mast.userData.spin.rotation.y=t*.9;
  const flow=A.activeFlow();
  if(A.flowOn||flow.some(s=>s._flow)){
    flow.forEach(function(sys){
      if(!sys._pts||!sys._pts.visible)return;
      const pos=sys._pts.geometry.attributes.position;
      sys._pts.userData.params.forEach(function(p,i){
        p.t=(p.t+dt*p.sp)%1;
        const pt=sys.curves[p.ci].getPointAt(p.t);
        pos.setXYZ(i,pt.x,pt.y,pt.z);
      });
      pos.needsUpdate=true;
    });
  }
  if(A.propOn){
    const prop=A.activeFeatureObject('PP-001');
    if(prop)prop.rotation.x-=dt*5;
    if(A._propPts){
      const pos=A._propPts.geometry.attributes.position;
      A._propPts.userData.params.forEach(function(p,i){
        p.t=(p.t+dt*.09)%1;
        const pt=A._propCurve.getPointAt(p.t);
        pos.setXYZ(i,pt.x,pt.y,pt.z);
      });
      pos.needsUpdate=true;
    }
  }
  A.tickTour(dt);
  A.tickWalk(dt);
  A.repositionLabels();
};
})();
