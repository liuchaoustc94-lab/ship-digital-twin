/* ═══ OCEAN·DT 程序化示范船模型生成器 ═══
   总长 200m · 型宽 28m（主甲板 y=12）
   坐标系：+X 船首(BOW) · +Y 垂向 · +Z 左舷(PORT)
   所有主要模块均为独立 Group/Mesh，支持爆炸 / 隐藏 / 剖切 / 隔离 */
window.ShipBuilder = (function(){
  let T;                       // THREE
  const registry = [];         // 全部已注册可选对象
  const flowSystems = [];      // 管路系统（曲线，供流动动画）
  const hotspots = [];         // 信息热点
  let idSeq = 100;

  /* ── 型线函数 ── */
  function breadth(x){                       // 半宽
    if(x < -85){ const t=Math.max(0,(x+100)/15); return 9+5*Math.pow(t,.8); }
    if(x <= 40) return 14;
    if(x <= 96){ const t=(x-40)/56; return 14*(1-Math.pow(t,2.1))+.35; }
    return .35;
  }
  function sheerY(x){ const a=Math.abs(x); return a<=40?0:1.5*Math.pow((a-40)/60,1.6); }
  function keelY(x){
    if(x>60){ const t=(x-60)/40; return -9+6*t*t; }
    if(x<-85){ const t=(-85-x)/15; return -9+2.4*t*t; }
    return -9;
  }
  function secScale(y){                      // 横剖面饱满度（船底收拢）
    if(y<=-7.5) return .42;
    if(y<=-3)   return .42+.58*(y+7.5)/4.5;
    return 1;
  }
  const DECK=12, D2=4, TT=-4;                // 主甲板 / 二层甲板 / 内底

  /* ── 基础工厂（统一约定：parent 在前，material 在后） ── */
  function M(color,o={}){
    const p={color, metalness:o.metal??.55, roughness:o.rough??.55};
    if(o.emissive){p.emissive=o.emissive;p.emissiveIntensity=o.ei??.55;}
    if(o.opacity!=null){p.opacity=o.opacity;p.transparent=true;}
    if(o.side)p.side=o.side;
    return new T.MeshStandardMaterial(p);
  }
  function bind(o,meta){
    if(o.userData.meta){ Object.assign(o.userData.meta,meta); return o; }
    o.userData.meta=Object.assign({id:autoId((meta&&meta.name)||'PART')},meta);
    o.userData.selectable=true; registry.push(o); return o;
  }
  function autoId(n){ return (n||'P').replace(/[^\w]+/g,'').slice(0,10).toUpperCase()+'-'+String(++idSeq).padStart(4,'0'); }
  function mesh(geo,mat,parent,meta,pos,rot){
    const m=new T.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true;
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    if(rot)m.rotation.set(rot[0],rot[1],rot[2]);
    parent.add(m); if(meta)bind(m,meta);
    return m;
  }
  function box(parent,mat,w,h,d,meta,pos,rot){ return mesh(new T.BoxGeometry(w,h,d),mat,parent,meta,pos,rot); }
  function cyl(parent,mat,rt,rb,h,seg,meta,pos,rot){ return mesh(new T.CylinderGeometry(rt,rb,h,seg),mat,parent,meta,pos,rot); }
  function group(parent,meta,name){
    const g=new T.Group(); parent.add(g);
    if(meta)bind(g,meta); if(name)g.name=name;
    return g;
  }
  function labelSprite(text,parent,pos,scale=1,color='#00d0ff'){
    const cv=document.createElement('canvas');cv.width=256;cv.height=64;
    const c=cv.getContext('2d');
    c.fillStyle='rgba(4,14,26,.75)';c.beginPath();c.roundRect(4,10,248,44,10);c.fill();
    c.strokeStyle=color;c.lineWidth=2;c.stroke();
    c.fillStyle='#eaf7ff';c.font='600 20px "Microsoft YaHei UI",sans-serif';
    c.textAlign='center';c.textBaseline='middle';c.fillText(text,128,33);
    const tx=new T.CanvasTexture(cv);
    const sp=new T.Sprite(new T.SpriteMaterial({map:tx,transparent:true,depthTest:false}));
    sp.position.set(pos[0],pos[1],pos[2]); sp.scale.set(16*scale,4*scale,1);
    sp.userData.selectable=false; parent.add(sp); return sp;
  }

  /* ═══ 船体结构 ═══ */
  function buildHull(root){
    const g=group(root,{id:'SYS-HULL',name:'船体结构',en:'HULL STRUCTURE',type:'Assembly',kind:'sys'},'HullStructure');
    const matHull=M('#4b5d70',{metal:.85,rough:.42,side:T.DoubleSide});

    /* 外壳 —— 纵向放样 */
    const NX=64, levels=[-9,-7.5,-5,-2,0,2,5,8,10.5];
    const pos=[],idx=[];
    const vidx=(si,li,side)=>(si*(levels.length+1)+li)*2+side;
    for(let si=0;si<=NX;si++){
      const x=-100+200*si/NX,B=breadth(x),top=DECK+sheerY(x),ky=keelY(x);
      for(let li=0;li<levels.length;li++){
        const lz=levels[li];
        const yy=(lz>=10.5)?top:ky+(lz+9)/19.5*(top-ky-1.5);
        const w=B*secScale(lz);
        pos.push(x,yy,w, x,yy,-w);
      }
      pos.push(x,top,B*.99, x,top,-B*.99);
    }
    for(let si=0;si<NX;si++)for(let li=0;li<levels.length;li++){
      const a=vidx(si,li,0),b=vidx(si+1,li,0),c=vidx(si+1,li+1,0),d=vidx(si,li+1,0);
      idx.push(a,b,c, a,c,d, b+1,a+1,d+1, b+1,d+1,c+1);
    }
    const hg=new T.BufferGeometry();
    hg.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    hg.setIndex(idx);hg.computeVertexNormals();
    mesh(hg,matHull,g,{id:'HULL-OUTER',name:'船体外壳',en:'OUTER HULL',system:'船体结构',deck:'主甲板',type:'Shell',weight:4200000,manufacturer:'沪东中华',material:'EH36 高强钢'});
    cyl(g,M('#45566a',{metal:.85,rough:.45}),.4,.7,17,10,{id:'HULL-STEM',name:'艏柱',en:'STEM',system:'船体结构',type:'Plate',weight:8600,material:'铸钢'},[100,6.5,0]);
    const trH=DECK+1.4-keelY(-100);
    box(g,matHull.clone(),.5,trH,18,{id:'HULL-TRANSOM',name:'艉封板',en:'TRANSOM',system:'船体结构',type:'Plate',weight:42000,material:'EH36 钢'},[-100.1,keelY(-100)+trH/2,0]);

    /* 甲板板 */
    function deckPlate(y0,x0,x1,name,en,id,sheerOn,color,weight){
      const NS=40,p2=[],ix=[];
      for(let i=0;i<=NS;i++){const x=x0+(x1-x0)*i/NS,B=breadth(x)*.985;p2.push(x,0,B, x,0,-B);}
      for(let i=0;i<NS;i++){const a=i*2;ix.push(a,a+2,a+3, a,a+3,a+1);}
      const dg=new T.BufferGeometry();
      dg.setAttribute('position',new T.Float32BufferAttribute(p2,3));
      dg.setIndex(ix);
      const pa=dg.attributes.position;
      for(let i=0;i<pa.count;i++) pa.setY(i, y0+(sheerOn?sheerY(pa.getX(i)):0));
      dg.computeVertexNormals();
      return mesh(dg,M(color||'#5d6f80',{metal:.7,rough:.6,side:T.DoubleSide}),g,
        {id,name,en,system:'船体结构',type:'Deck',weight,material:'AH36 钢'});
    }
    deckPlate(DECK,-100,96,'主甲板','MAIN DECK','DECK-MAIN',true,'#66788a',186000);
    deckPlate(D2,-85,56,'二层甲板','SECOND DECK','DECK-2ND',false,'#4d5d6e',92000);
    deckPlate(TT,-98,90,'内底板','TANK TOP','DECK-TT',false,'#42525f',120000);
    deckPlate(-8.6,-88,58,'双层底板','DOUBLE BOTTOM','DECK-DB',false,'#3a4a58',88000);

    /* 横舱壁 */
    const bhdMat=M('#54687c',{metal:.7,rough:.55,side:T.DoubleSide});
    [[-88,'艉尖舱壁','AFT PEAK BHD'],[-35,'机舱前壁','ENG RM FWD BHD'],[0,'货舱横壁 1','CARGO BHD 1'],[32,'货舱横壁 2','CARGO BHD 2'],[64,'货舱横壁 3','CARGO BHD 3'],[88,'艏尖舱壁','FWD PEAK BHD']].forEach((b,i)=>{
      const x=b[0],B=breadth(x),h=DECK+sheerY(x)-TT;
      box(g,bhdMat,.35,h,B*1.96,{id:'BHD-'+(i+1),name:b[1],en:b[2],system:'船体结构',type:'Bulkhead',weight:Math.round(h*B*1.96*.12),material:'AH36 钢'},[x,TT+h/2,0]);
    });
    /* 肋骨框架 + 龙骨 */
    const frMat=M('#3f4f5f',{metal:.6,rough:.6});
    const frG=group(g,{id:'HULL-FRAMES',name:'肋骨框架',en:'FRAMES',system:'船体结构',type:'Sub-Assembly',kind:'sub',weight:214000,material:'钢'},'Frames');
    for(let x=-90;x<=90;x+=10){
      const B=breadth(x)*.94,h=DECK+sheerY(x)-(-8.5);
      box(frG,frMat,.28,h,.55,null,[x,-8.5+h/2,B]);
      box(frG,frMat,.28,h,.55,null,[x,-8.5+h/2,-B]);
      box(frG,frMat,.28,1,B*2,null,[x,-8.2,0]);
    }
    const kg=group(frG,{id:'HULL-KEEL',name:'龙骨',en:'KEEL',system:'船体结构',type:'Part',weight:68000,material:'钢'},'Keel');
    box(kg,M('#39485a',{metal:.8,rough:.5}),1.1,.9,180,null,[0,-8.9,0]);
    box(kg,M('#39485a'),1.1,.9,84,null,[78,-6.2,0]);
    return g;
  }

  /* ═══ 上层建筑 ═══ */
  function buildSuper(root){
    const g=group(root,{id:'SYS-SUPER',name:'上层建筑',en:'SUPERSTRUCTURE',type:'Assembly',kind:'sys'},'Superstructure');
    const wall=M('#7f8ea0',{metal:.5,rough:.5});
    const wall2=M('#8b9aae',{metal:.5,rough:.48});
    const glass=M('#0affff',{emissive:'#00d5ff',ei:.7,metal:.2,rough:.15,opacity:.7});
    const tiers=[[-78,-38,12,15,22],[-76,-44,15,18,21],[-74,-46,18,21,19.5],[-73,-47,21,24.2,19.5]];
    tiers.forEach((t,i)=>{
      const bm=i===3?wall2:wall;
      box(g,bm,t[1]-t[0],t[3]-t[2],t[4]*2,
        {id:'SUP-T'+(i+1),name:'甲板室第'+(i+1)+'层',en:'DECKHOUSE TIER '+(i+1),system:'上层建筑',deck:'驾驶甲板',type:'House',weight:52000-i*8000,material:'铝合金'},
        [(t[0]+t[1])/2,(t[2]+t[3])/2,0]);
      const wy=(t[2]+t[3])/2+.6,ww=(t[3]-t[2])*.4;
      mesh(new T.BoxGeometry(t[1]-t[0]-2.5,ww,.3),glass,g,null,[(t[0]+t[1])/2,wy,t[4]+.05]);
      mesh(new T.BoxGeometry(t[1]-t[0]-2.5,ww,.3),glass,g,null,[(t[0]+t[1])/2,wy,-t[4]-.05]);
      if(i>=2) mesh(new T.BoxGeometry(.3,ww,t[4]*2-3),glass,g,null,[t[1]+.05,wy,0]);
    });
    box(g,wall2,4,.5,8,{id:'SUP-WING',name:'驾驶室翼台',en:'BRIDGE WING',system:'上层建筑',deck:'驾驶甲板',type:'Platform',weight:6800},[-48,24.4,10]);
    box(g,wall2,4,.5,8,null,[-48,24.4,-10]);
    /* 烟囱 */
    const fg=group(g,{id:'SUP-FUNNEL',name:'烟囱',en:'FUNNEL',system:'上层建筑',deck:'驾驶甲板',type:'Assembly',weight:34000,kind:'sub'});
    cyl(fg,M('#6b7c8e',{metal:.5,rough:.5}),1.7,2.5,8.5,4,null,[-41,28,0],[0,Math.PI/4,0]);
    cyl(fg,M('#20242a',{rough:.4}),1.55,1.55,1.4,4,null,[-40.6,32.2,0],[0,Math.PI/4,0]);
    /* 救生艇 */
    const lb=group(g,{id:'SUP-BOAT',name:'救生艇',en:'LIFEBOATS',system:'上层建筑',type:'Sub-Assembly',weight:8400,kind:'sub'});
    [[1,'P'],[-1,'S']].forEach(s=>{
      const b=mesh(new T.CapsuleGeometry(.9,3.4,4,10),M('#ff7a1a',{rough:.45,metal:.3}),lb,
        {id:'LIFEBOAT-'+s[1],name:'救生艇 '+s[1],en:'LIFEBOAT',system:'上层建筑',deck:'第二层',type:'Craft',weight:4200,manufacturer:'Norsafe'},[-66,16.6,s[0]*11.6]);
      b.rotation.z=Math.PI/2;
    });
    return g;
  }

  /* ═══ 推进系统 ═══ */
  function buildPropulsion(root,flow){
    const g=group(root,{id:'SYS-PROP',name:'推进系统',en:'PROPULSION',type:'Assembly',kind:'sys'},'Propulsion');
    const eng=M('#38678c',{metal:.6,rough:.42});
    const eng2=M('#2d5576',{metal:.6,rough:.45});
    const dk=M('#4a5a6c',{metal:.7,rough:.5});
    const meMeta={id:'ME-001',name:'主机',en:'MAIN ENGINE · MAN 6G70ME-C',system:'推进系统',deck:'内底',compartment:'机舱',type:'Engine',weight:720000,manufacturer:'MAN Energy Solutions',model:'6G70ME-C',material:'铸钢/合金',install:'2023-05-12',insp:'2026-06-30'};
    const me=group(g,Object.assign({kind:'sub'},meMeta),'MainEngine');
    box(me,dk,21,1.6,10.5,{id:'ME-BED',name:'主机底座',en:'BEDPLATE',system:'推进系统',type:'Part',weight:96000,material:'铸钢'},[-58,-3.3,0]);
    box(me,eng2,19,6,9.6,{id:'ME-BLOCK',name:'机体',en:'CYLINDER BLOCK',system:'推进系统',type:'Part',weight:210000,material:'球墨铸铁'},[-58,.9,0]);
    box(me,eng,17,2.4,7.5,{id:'ME-AFRAME',name:'气缸体',en:'FRAME BOX',system:'推进系统',type:'Part',weight:88000,material:'铸铁'},[-58,4.9,0]);
    const heads=group(me,{id:'ME-HEADS',name:'气缸盖组',en:'CYLINDER HEADS',system:'推进系统',type:'Sub-Assembly',weight:64000,kind:'sub'});
    for(let i=0;i<5;i++){
      const x=-65.5+i*3.8;
      cyl(heads,M('#39719b',{metal:.6,rough:.4}),1.45,1.45,2.6,18,null,[x,7.3,0]);
      cyl(heads,M('#284f6e',{metal:.65,rough:.38}),1.7,1.7,1.1,18,null,[x,9,0]);
      cyl(heads,M('#8a97a5',{metal:.8,rough:.3}),.5,.5,1.6,10,null,[x,10.1,0]);
    }
    cyl(me,M('#b8c4cf',{metal:.85,rough:.3}),1.5,1.5,3.2,16,{id:'ME-TURBO',name:'涡轮增压器',en:'TURBOCHARGER',system:'推进系统',type:'Part',weight:12000,manufacturer:'ABB'},[-50.5,7.8,3.4],[Math.PI/2,0,0]);
    cyl(me,M('#7d4a1e',{metal:.5,rough:.5}),1,1,17,14,{id:'ME-EXH',name:'排气管',en:'EXHAUST MANIFOLD',system:'推进系统',type:'Part',weight:9800},[-58,10.6,-2.2],[0,0,Math.PI/2]);
    bind(me,meMeta);   // 覆盖回主 meta（含 live 数据）
    me.userData.meta.live={rpm:78,power:11.6,temp:82,rpmMax:100,tempMax:95,powerMax:12.6};

    /* 齿轮箱 */
    const gb=group(g,{id:'GB-001',name:'齿轮箱',en:'GEARBOX',system:'推进系统',deck:'内底',compartment:'机舱',type:'Machinery',weight:46000,manufacturer:'Renk AG',material:'铸铁',install:'2023-05-20',kind:'sub'});
    box(gb,eng,6,5,7,null,[-41.5,-.9,0]);
    cyl(gb,M('#8a97a5',{metal:.8,rough:.35}),.9,.9,5,14,null,[-41.5,2.6,0],[0,0,Math.PI/2]);

    /* 轴系 + 螺旋桨 */
    const shaftRun=group(g,{id:'SH-001',name:'轴系·螺旋桨',en:'SHAFT LINE',system:'推进系统',compartment:'机舱',type:'Assembly',kind:'sub'},'ShaftLine');
    cyl(shaftRun,M('#9fb0be',{metal:.9,rough:.25}),.5,.5,56,14,{id:'SH-SHAFT',name:'中间轴',en:'INTERMEDIATE SHAFT',system:'推进系统',type:'Shaft',weight:52000,material:'锻钢'},[-70,-3.3,0],[0,0,Math.PI/2]);
    cyl(shaftRun,M('#9fb0be',{metal:.9,rough:.25}),.62,.62,8,14,null,[-96.5,-3.3,0],[0,0,Math.PI/2]);
    cyl(shaftRun,M('#54687c',{metal:.7,rough:.5}),1.25,1,7,14,{id:'SH-TUBE',name:'艉轴管',en:'STERN TUBE',system:'推进系统',type:'Part',weight:14000},[-98.5,-3.3,0],[0,0,Math.PI/2]);
    const prop=group(shaftRun,{id:'PP-001',name:'螺旋桨',en:'PROPELLER · 5叶定距',system:'推进系统',compartment:'船外',type:'Propeller',weight:28000,manufacturer:'MMG',diameter:'8.4 m',material:'镍铝青铜',kind:'sub'},'Propeller');
    prop.position.set(-104.6,-3.3,0);
    cyl(prop,M('#a8743f',{metal:.75,rough:.35}),1.15,.5,2.6,16,null,[0,0,0],[0,0,Math.PI/2]);
    const bladeShape=new T.Shape();
    bladeShape.moveTo(0,-.9); bladeShape.bezierCurveTo(1.5,-1.1,3.2,-.6,4.6,.1);
    bladeShape.bezierCurveTo(3.4,.9,1.6,1.1,0,.9); bladeShape.lineTo(0,-.9);
    const bladeGeo=new T.ExtrudeGeometry(bladeShape,{depth:.28,bevelEnabled:true,bevelThickness:.12,bevelSize:.3,bevelSegments:2});
    bladeGeo.rotateX(Math.PI/2);
    for(let i=0;i<5;i++){
      const bl=mesh(bladeGeo,M('#c9a25a',{metal:.8,rough:.32}),prop,
        {id:'PP-B'+(i+1),name:'桨叶 '+(i+1),en:'BLADE '+(i+1),system:'推进系统',type:'Blade',weight:4200,material:'NiAl Bronze'});
      bl.rotation.x=i*Math.PI*2/5; bl.rotateOnAxis(new T.Vector3(0,1,0),.6);
    }
    prop.userData.meta.live={rpm:78,power:11.6,temp:38,rpmMax:100,tempMax:70,powerMax:12.6};

    /* 舵系 */
    const rud=group(g,{id:'RD-001',name:'舵系',en:'RUDDER SYSTEM',system:'推进系统',compartment:'舵机舱',type:'Assembly',kind:'sub'},'Rudder');
    box(rud,M('#4d5f70',{metal:.8,rough:.4}),1.3,7,3.6,{id:'RD-BLADE',name:'舵叶',en:'RUDDER BLADE',system:'推进系统',type:'Part',weight:38000,material:'EH36 钢'},[-103.5,-4.6,0]);
    cyl(rud,M('#8a97a5',{metal:.85,rough:.3}),.35,.35,7,10,null,[-102.9,-.6,0]);
    box(rud,M('#39658a',{metal:.6,rough:.45}),4.5,3,4.5,{id:'SG-001',name:'舵机',en:'STEERING GEAR',system:'推进系统',type:'Machinery',weight:22000,manufacturer:'Hydramarine'},[-96,4.2,0]);

    flow.push({id:'LO',name:'滑油系统',en:'LUBE OIL',color:'#d8b13a',curves:[
      new T.CatmullRomCurve3([new T.Vector3(-68,-2.6,.5),new T.Vector3(-75,-2.6,2.5),new T.Vector3(-80,-2.6,2.5),new T.Vector3(-66,-2.6,2.8),new T.Vector3(-62,-2.7,1)])]});
  }

  /* ═══ 电力系统 ═══ */
  function buildPower(root){
    const g=group(root,{id:'SYS-PWR',name:'电力系统',en:'POWER SYSTEM',type:'Assembly',kind:'sys'},'PowerSystem');
    const body=M('#3e6b52',{metal:.5,rough:.5});
    for(let i=0;i<3;i++){
      const z=-6+i*6;
      const gz=group(g,{id:'GEN-00'+(i+1),name:'发电机组 '+(i+1),en:'DG '+(i+1)+' · CAT C3512',system:'电力系统',deck:'内底',compartment:'机舱',type:'Generator',weight:52000,manufacturer:'Caterpillar',install:'2023-05-18',insp:'2026-07-02',kind:'sub'});
      box(gz,M('#39485a'),5.2,.6,3,null,[-80,-3.4,z]);
      box(gz,body,3.9,2.7,2.4,null,[-80,-1.7,z]);
      cyl(gz,M('#8a97a5',{metal:.7,rough:.4}),.5,.5,1.8,10,null,[-78.6,-.2,z],[0,0,Math.PI/2]);
      cyl(gz,M('#6b7c8e'),.32,.32,4.5,8,null,[-81,1.6,z]);
      gz.userData.meta.live={rpm:75,power:+(2.1+i*.3).toFixed(1),temp:76-i*3,rpmMax:100,tempMax:92,powerMax:2.8};
    }
    const sb=group(g,{id:'SB-001',name:'主配电板',en:'MAIN SWITCHBOARD',system:'电力系统',deck:'二层甲板',compartment:'机舱',type:'Panel',weight:18000,manufacturer:'ABB',kind:'sub'});
    for(let i=0;i<4;i++) box(sb,M('#2e4a3d',{metal:.4,rough:.55}),.9,3.4,1.9,null,[-36.5,1,-3+i*2]);
    mesh(new T.BoxGeometry(.2,.5,7.4),M('#00ffae',{emissive:'#00ffae',ei:.9}),sb,null,[-36,2.6,0]);
    sb.userData.meta.live={rpm:0,power:8.6,temp:52,rpmMax:1,tempMax:80,powerMax:11};
    box(g,M('#5a6a7a',{metal:.6,rough:.5}),2.3,2.7,2.3,{id:'TR-001',name:'变压器',en:'TRANSFORMER 2200kVA',system:'电力系统',compartment:'机舱',type:'Machinery',weight:12000,manufacturer:'ABB'},[-36.5,.4,5.5]);
    const bat=group(g,{id:'BT-001',name:'应急蓄电池组',en:'EMERGENCY BATTERY',system:'电力系统',compartment:'机舱',type:'Battery',weight:8600,kind:'sub'});
    box(bat,M('#27313d',{metal:.3,rough:.6}),2.6,2.2,1.3,null,[-36.5,.1,9]);
    for(let i=0;i<4;i++) box(bat,M('#315a7d',{emissive:'#1e88e5',ei:.25}),.5,.8,1.1,null,[-37.6+i*.75,.35,9]);
    bat.userData.meta.live={rpm:0,power:24,temp:31,rpmMax:1,tempMax:55,powerMax:24,unit:'V'};
  }

  /* ═══ 管路系统 ═══ */
  function buildPiping(root,flow){
    const g=group(root,{id:'SYS-PIPE',name:'管路系统',en:'PIPING SYSTEM',type:'Assembly',kind:'sys'},'Piping');
    const defs=[
      {id:'FO',name:'燃油系统',en:'FUEL OIL',color:'#ff8c1a',r:.34,pts:[
        [[-73,-5.2,-4],[-73,-2.8,-4],[-68,-2.8,-1.5],[-62,-2.6,-1.5]],
        [[-73,-5.2,4],[-70,-2.8,3],[-64,-2.8,1.5],[-62,-2.7,1.2]]]},
      {id:'CW',name:'冷却水系统',en:'COOLING WATER',color:'#2f9bff',r:.4,pts:[
        [[-60,-3,-2],[-72,-3,-4],[-84,-3.6,-6],[-88,-5,-8]],
        [[-60,-3,2],[-72,-3,4],[-84,-3.6,6],[-88,-5,8]]]},
      {id:'BL',name:'压载水系统',en:'BALLAST',color:'#00d5d5',r:.45,pts:[
        [[-18,-5.5,8],[-28,-3.5,7],[-33,-3,7],[-33,11,9.5]],
        [[30,-5.5,8],[10,-4,8],[-20,-4,8.2],[-33,-3,7.5]],
        [[-33,11,9.5],[-60,11.2,10],[-90,11.4,9],[-97,9,8]]]},
      {id:'FF',name:'消防系统',en:'FIRE FIGHTING',color:'#ff4d4d',r:.3,pts:[
        [[-80,12.8,0],[-40,12.9,0],[0,13,0],[40,13.2,0],[80,13.6,0]]]},
      {id:'FW',name:'淡水系统',en:'FRESH WATER',color:'#57d977',r:.22,pts:[
        [[-76,13.4,-4],[-70,13.4,-4],[-66,15.8,-3],[-56,15.8,-3],[-50,15.9,0]]]},
      {id:'CA',name:'压缩空气',en:'COMPRESSED AIR',color:'#9be3ff',r:.2,pts:[
        [[-63,-1.6,-3],[-70,-2,-4],[-78,-2.2,-4.5]]]}
    ];
    defs.forEach(d=>{
      const sg=group(g,{id:'PIPE-'+d.id,name:d.name,en:d.en,system:'管路系统',type:'Pipeline',kind:'sub'});
      const curves=[];
      d.pts.forEach((pp,ci)=>{
        const cu=new T.CatmullRomCurve3(pp.map(p=>new T.Vector3(p[0],p[1],p[2])));
        curves.push(cu);
        const tm=mesh(new T.TubeGeometry(cu,60,d.r,10),M(d.color,{metal:.45,rough:.42,emissive:d.color,ei:.12}),sg,
          {id:'PIPE-'+d.id+'-'+(ci+1),name:d.name+'管段 '+(ci+1),en:d.en+' LINE',system:'管路系统',type:'Pipeline',weight:1200+ci*400,material:'无缝钢管'});
        tm.castShadow=false;
      });
      if(['FO','FF','CW'].includes(d.id)){
        const p=d.pts[0][1];
        cyl(sg,M(d.color,{metal:.6,rough:.4}),.55,.55,.5,10,{id:'VLV-'+d.id,name:d.name+'阀件',en:'VALVE',system:'管路系统',type:'Valve',weight:85},[p[0],p[1]+.8,p[2]]);
      }
      flow.push({id:d.id,name:d.name,en:d.en,color:d.color,curves,group:sg});
    });
    /* 泵组（机舱） */
    const pumps=[
      {id:'PUMP-F01',name:'燃油泵 01',en:'FUEL PUMP 01',c:'#ff8c1a',p:[-68,-3.1,4.2]},
      {id:'PUMP-F02',name:'燃油泵 02',en:'FUEL PUMP 02',c:'#ff8c1a',p:[-64,-3.1,4.2]},
      {id:'PUMP-C01',name:'冷却泵',en:'COOLING PUMP',c:'#2f9bff',p:[-74,-3.1,-4.6]},
      {id:'PUMP-B01',name:'压载泵',en:'BALLAST PUMP',c:'#00d5d5',p:[-30,-3.1,6]},
      {id:'PUMP-FW1',name:'淡水泵',en:'FRESH WATER PUMP',c:'#57d977',p:[-40,-3.1,-6.5]}
    ];
    pumps.forEach(pm=>{
      const pg=group(g,{id:pm.id,name:pm.name,en:pm.en,system:'管路系统',deck:'内底',compartment:'机舱',type:'Pump',weight:850,manufacturer:'Grundfos',kind:'sub'});
      cyl(pg,M('#39485a'),1.05,1.15,.5,14,null,[pm.p[0],pm.p[1]-.2,pm.p[2]]);
      cyl(pg,M(pm.c,{metal:.55,rough:.42,emissive:pm.c,ei:.1}),.72,.78,1.5,14,null,[pm.p[0],pm.p[1]+.7,pm.p[2]]);
      cyl(pg,M('#8a97a5',{metal:.8,rough:.35}),.18,.18,1.1,8,null,[pm.p[0],pm.p[1]+1.8,pm.p[2]]);
      pg.userData.meta.live={rpm:1450,power:68,temp:64,rpmMax:1800,tempMax:85,powerMax:90,unit:'kW'};
    });
  }

  /* ═══ 舱室分区（透明示意壳） ═══ */
  function buildCompartments(root){
    const g=group(root,{id:'SYS-COMP',name:'舱室分区',en:'COMPARTMENTS',type:'Assembly',kind:'sys'},'Compartments');
    g.visible=false;
    [
      {id:'CMP-ER',name:'机舱',en:'ENGINE ROOM',c:'#00d0ff',x:-60,y:3.5,w:50,h:15,d:26},
      {id:'CMP-SG',name:'舵机舱',en:'STEERING GEAR RM',c:'#00d0ff',x:-92.5,y:3.5,w:14,h:15,d:16},
      {id:'CMP-H1',name:'货舱 1',en:'CARGO HOLD 1',c:'#8fd3ff',x:-14,y:3.5,w:28,h:15,d:24},
      {id:'CMP-H2',name:'货舱 2',en:'CARGO HOLD 2',c:'#8fd3ff',x:16,y:3.5,w:28,h:15,d:24},
      {id:'CMP-H3',name:'货舱 3',en:'CARGO HOLD 3',c:'#8fd3ff',x:48,y:3.5,w:26,h:15,d:22},
      {id:'CMP-FP',name:'艏尖舱',en:'FORE PEAK',c:'#8fd3ff',x:82,y:2.5,w:26,h:13,d:14},
      {id:'CMP-BR',name:'驾驶室',en:'BRIDGE',c:'#ffd166',x:-60,y:22.6,w:25,h:3,d:18},
      {id:'CMP-AC',name:'居住区',en:'ACCOMMODATION',c:'#ffd166',x:-59,y:16.4,w:34,h:8,d:20}
    ].forEach(d=>{
      const cg=group(g,{id:d.id,name:d.name,en:d.en,system:'舱室分区',compartment:d.name,deck:'全船',type:'Compartment',kind:'sub'});
      const m=new T.Mesh(new T.BoxGeometry(d.w,d.h,d.d),
        new T.MeshStandardMaterial({color:d.c,transparent:true,opacity:.06,side:T.DoubleSide,depthWrite:false}));
      m.position.set(d.x,d.y,0); m.userData.selectable=false; cg.add(m);
      const e=new T.LineSegments(new T.EdgesGeometry(m.geometry),
        new T.LineBasicMaterial({color:d.c,transparent:true,opacity:.4}));
      e.position.copy(m.position); e.userData.selectable=false; cg.add(e);
      labelSprite(d.name+' · '+d.en,cg,[d.x,d.y+d.h/2+2,0],.8,d.c);
      cg.userData.shell=m; cg.userData.meta.center=[d.x,d.y,0];
    });
  }
  function buildTanks(root){
    const g=group(root,{id:'SYS-TANK',name:'液舱',en:'TANKS',type:'Assembly',kind:'sys'},'Tanks');
    [
      {id:'TK-FO',name:'燃油舱',en:'FUEL OIL TANK',c:'#ffa040',x:-73,y:-6.6,z:0,w:18,h:4.6,d:20},
      {id:'TK-B1',name:'压载舱 P',en:'BALLAST TANK P',c:'#4da6ff',x:-5,y:-6.6,z:7,w:30,h:4.6,d:11},
      {id:'TK-B2',name:'压载舱 S',en:'BALLAST TANK S',c:'#4da6ff',x:-5,y:-6.6,z:-7,w:30,h:4.6,d:11},
      {id:'TK-FP',name:'艏压载舱',en:'FWD BALLAST',c:'#4da6ff',x:76,y:-6,z:0,w:16,h:4,d:10},
      {id:'TK-FW',name:'淡水舱',en:'FRESH WATER TK',c:'#57d977',x:-38,y:-6.4,z:-6.5,w:6,h:4.4,d:8}
    ].forEach(d=>{
      const tg=group(g,{id:d.id,name:d.name,en:d.en,system:'液舱',compartment:'双层底',deck:'双层底',type:'Tank',weight:(d.w*d.h*d.d*.85|0)+' t',kind:'sub'});
      const m=new T.Mesh(new T.BoxGeometry(d.w,d.h,d.d),
        new T.MeshStandardMaterial({color:d.c,transparent:true,opacity:.16,side:T.DoubleSide,metalness:.3,roughness:.4}));
      m.position.set(d.x,d.y,d.z); tg.add(m);
      const e=new T.LineSegments(new T.EdgesGeometry(m.geometry),new T.LineBasicMaterial({color:d.c,transparent:true,opacity:.55}));
      e.position.copy(m.position); tg.add(e);
      tg.userData.shell=m; tg.userData.meta.center=[d.x,d.y,d.z];
    });
  }

  /* ═══ 甲板机械 ═══ */
  function buildDeckEquip(root){
    const g=group(root,{id:'SYS-DECK',name:'甲板机械',en:'DECK EQUIPMENT',type:'Assembly',kind:'sys'},'DeckEquip');
    const or=M('#ff8c2a',{metal:.45,rough:.5});
    [[-14,'货舱1舱盖'],[16,'货舱2舱盖'],[47,'货舱3舱盖']].forEach((h,i)=>{
      const hg=group(g,{id:'HC-00'+(i+1),name:h[1],en:'HATCH COVER '+(i+1),system:'甲板机械',deck:'主甲板',type:'Hatch Cover',weight:78000,kind:'sub'});
      box(hg,M('#5d6f80',{metal:.6,rough:.5}),24,2.4,14,null,[h[0],13.2,0]);
      box(hg,or,24.6,.5,14.6,{id:'HC-00'+(i+1)+'C',name:h[1]+'盖板',en:'COVER PLATE',system:'甲板机械',deck:'主甲板',type:'Part',weight:52000},[h[0],14.7,0]);
    });
    [[1,'克令吊 1'],[31,'克令吊 2']].forEach((c,i)=>{
      const cg=group(g,{id:'CR-00'+(i+1),name:c[1],en:'DECK CRANE '+(i+1),system:'甲板机械',deck:'主甲板',type:'Crane',weight:168000,manufacturer:'Huisman',kind:'sub'});
      const px=c[0];
      cyl(cg,M('#7a4a20',{metal:.5,rough:.5}),1.5,1.8,3.2,16,null,[px,13.6,10.5]);
      box(cg,or,2.2,8,2.2,null,[px,19,10.5]);
      box(cg,M('#39536b',{metal:.6,rough:.4}),2.6,2.6,2.6,null,[px,23.5,10.5]);
      const jib=box(cg,or,15,1.1,1.1,{id:'CR-00'+(i+1)+'J',name:c[1]+'吊臂',en:'CRANE JIB',system:'甲板机械',type:'Part',weight:36000},[px+5.4,25.6,10.5]);
      jib.rotation.z=-.32;
      cyl(cg,M('#cccccc',{metal:.5}),.09,.09,9,6,null,[px+12.6,21.2,10.5]);
      box(cg,M('#666666',{metal:.6}),1.2,1,1.2,null,[px+12.6,17,10.5]);
      cg.userData.meta.live={rpm:0,power:180,temp:58,rpmMax:1,tempMax:85,powerMax:220,unit:'kW'};
    });
    const mo=group(g,{id:'EQ-MOOR',name:'系泊设备',en:'MOORING EQUIPMENT',system:'甲板机械',deck:'主甲板',type:'Sub-Assembly',weight:46000,kind:'sub'});
    [[1],[-1]].forEach((w,i)=>{
      box(mo,or,3,1.6,2.2,null,[-95,13.6,w[0]*6]);
      cyl(mo,M('#8a97a5',{metal:.7}),1.1,1.1,.7,12,null,[-96.2,14.7,w[0]*6],[Math.PI/2,0,0]);
    });
    for(let i=0;i<8;i++){
      const x=-95+i*26,B=breadth(x)-1.6;
      [[x,B],[x,-B]].forEach(p=>{
        cyl(mo,M('#44586b',{metal:.7}),.22,.28,1.2,8,null,[p[0],13.4,p[1]]);
        box(mo,M('#44586b'),1.1,.3,.45,null,[p[0],14,p[1]]);
      });
    }
    const wl=group(g,{id:'EQ-WIND',name:'锚机',en:'WINDLASS',system:'甲板机械',deck:'艏甲板',type:'Machinery',weight:14000,kind:'sub'});
    [[1],[-1]].forEach(s=>{
      box(wl,or,2.6,1.5,2,null,[86,15,s[0]*3.4]);
      cyl(wl,M('#8a97a5',{metal:.7}),1,1,.8,12,null,[86,16.1,s[0]*3.4],[Math.PI/2,0,0]);
    });
  }

  /* ═══ 通用系统 ═══ */
  function buildHVAC(root){
    const g=group(root,{id:'SYS-HVAC',name:'通风空调',en:'HVAC',type:'Assembly',kind:'sys'},'HVAC');
    const dm=M('#7f95a8',{metal:.5,rough:.5});
    box(g,dm,34,1,.9,{id:'HV-001',name:'送风总管',en:'SUPPLY DUCT',system:'通风空调',deck:'第一层',type:'Duct',weight:4200},[-58,12.7,6.5]);
    box(g,dm,34,1,.9,null,[-58,12.7,-6.5]);
    cyl(g,M('#9fb0be',{metal:.6,rough:.4}),1.1,1.3,1.4,12,{id:'HV-FAN1',name:'机舱轴流风机',en:'ENGINE FAN',system:'通风空调',deck:'主甲板',type:'Fan',weight:1800},[-38,12.7,9]);
    cyl(g,M('#9fb0be',{metal:.6,rough:.4}),1.1,1.3,1.4,12,{id:'HV-FAN2',name:'机舱抽风机',en:'EXHAUST FAN',system:'通风空调',deck:'主甲板',type:'Fan',weight:1800},[-38,12.7,-9]);
  }
  function buildElec(root){
    const g=group(root,{id:'SYS-ELEC',name:'电气网络',en:'ELECTRICAL',type:'Assembly',kind:'sys'},'Electrical');
    const tr=M('#c9a23a',{metal:.4,rough:.55});
    box(g,tr,48,.18,.6,{id:'EL-TRAY1',name:'机舱电缆桥架',en:'CABLE TRAY ER',system:'电气网络',deck:'机舱',type:'Tray',weight:2600},[-60,10.8,7]);
    box(g,tr,34,.18,.6,{id:'EL-TRAY2',name:'居住区电缆桥架',en:'CABLE TRAY ACC',system:'电气网络',deck:'第一层',type:'Tray',weight:1800},[-57,13.6,-8]);
    [[-33,2,-8],[-33,2,8]].forEach((p,i)=>box(g,M('#3d4c5c',{metal:.4,rough:.5}),1.4,1.8,1.4,
      {id:'EL-JB'+(i+1),name:'接线箱 '+(i+1),en:'JUNCTION BOX',system:'电气网络',type:'Box',weight:210},p));
  }
  function buildNavCom(root){
    const g=group(root,{id:'SYS-NAV',name:'通导设备',en:'NAV & COMMS',type:'Assembly',kind:'sys'},'NavCom');
    const mast=group(g,{id:'NV-MAST',name:'雷达桅',en:'RADAR MAST',system:'通导设备',deck:'罗经甲板',type:'Mast',weight:6800,kind:'sub'});
    cyl(mast,M('#8a97a5',{metal:.7,rough:.4}),.22,.3,9,8,null,[-60,28.5,0]);
    box(mast,M('#8a97a5'),3.4,.25,.25,null,[-60,31.5,0]);
    box(mast,M('#8a97a5'),.25,.25,3.4,null,[-60,30,0]);
    const spin=new T.Group(); spin.position.set(-60,33.4,0); mast.add(spin);
    mesh(new T.BoxGeometry(5.2,.4,.2),M('#d7e2ea',{metal:.5,rough:.35}),spin,
      {id:'NV-RADAR',name:'X波段雷达',en:'X-BAND RADAR',system:'通导设备',deck:'罗经甲板',type:'Radar',weight:320,manufacturer:'Furuno'});
    mast.userData.spin=spin;
    mesh(new T.SphereGeometry(1.05,16,12),M('#b9c6d2',{metal:.3,rough:.5}),g,
      {id:'NV-SAT',name:'卫通天线罩',en:'SATCOM DOME',system:'通导设备',deck:'罗经甲板',type:'Antenna',weight:640},[-64,25.6,0]);
    mesh(new T.SphereGeometry(.8,14,10),M('#b9c6d2',{metal:.3,rough:.5}),g,
      {id:'NV-SAT2',name:'卫通天线罩 2',en:'VSAT DOME',system:'通导设备',deck:'罗经甲板',type:'Antenna',weight:520},[-56,25.3,0]);
    [[1,'#ff4040','左舷灯','NL-P'],[-1,'#3dff6e','右舷灯','NL-S']].forEach(n=>{
      mesh(new T.SphereGeometry(.32,10,8),M(n[1],{emissive:n[1],ei:2.2}),g,
        {id:n[3],name:n[2],en:'NAV LIGHT',system:'通导设备',deck:'驾驶甲板',type:'Light',weight:8},[-48.6,25,n[0]*13.5]);
    });
    mesh(new T.SphereGeometry(.3,10,8),M('#ffffff',{emissive:'#ffffff',ei:2}),g,
      {id:'NL-MH',name:'桅顶灯',en:'MASTHEAD LIGHT',system:'通导设备',deck:'罗经甲板',type:'Light',weight:8},[-60,33.8,0]);
  }

  /* ═══ 环境 ═══ */
  function buildEnv(root){
    const water=new T.Mesh(new T.PlaneGeometry(1600,900),
      new T.MeshStandardMaterial({color:'#0a3350',transparent:true,opacity:.62,metalness:.35,roughness:.35}));
    water.rotation.x=-Math.PI/2; water.position.y=0; water.receiveShadow=true;
    water.userData.selectable=false; water.name='Sea'; root.add(water);
    const ax=new T.Group(); ax.name='Axes'; ax.visible=false; root.add(ax);
    [[[130,0,0],'#ff5757'],[[0,60,0],'#4ade80'],[[0,0,60],'#4da6ff']].forEach(a=>{
      ax.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3(...a[0])]),
        new T.LineBasicMaterial({color:a[1]})));
    });
    const cone=new T.Mesh(new T.ConeGeometry(1.6,5,12),new T.MeshBasicMaterial({color:'#ff5757'}));
    cone.position.set(132,0,0); cone.rotation.z=-Math.PI/2; ax.add(cone);
    labelSprite('艏 BOW · +X',ax,[132,6,0],.7,'#ff8080');
    labelSprite('左舷 PORT · +Z',ax,[0,4,64],.7,'#8fc4ff');
    labelSprite('UP · +Y',ax,[0,64,0],.6,'#8effb0');
    return {water,axes:ax};
  }

  /* ═══ 主入口 ═══ */
  function build(THREE){
    T=THREE;
    const root=new T.Group(); root.name='SHIP';
    const flow=[];
    buildHull(root);
    buildSuper(root);
    buildPropulsion(root,flow);
    buildPower(root);
    buildPiping(root,flow);
    buildHVAC(root);
    buildElec(root);
    buildNavCom(root);
    buildDeckEquip(root);
    buildCompartments(root);
    buildTanks(root);
    const env=buildEnv(root);

    /* 信息热点 */
    [
      {n:'①',name:'主机',en:'MAIN ENGINE',pos:[-58,12.8,0],id:'ME-001',rows:[['型号','MAN 6G70ME-C'],['功率','11.6 MW'],['厂商','MAN ES']]},
      {n:'②',name:'齿轮箱',en:'GEARBOX',pos:[-41.5,3.4,0],id:'GB-001',rows:[['减速比','5.2 : 1'],['厂商','Renk AG']]},
      {n:'③',name:'发电机组',en:'GEN SET',pos:[-80,4.8,-6],id:'GEN-001',rows:[['型式','Cat C3512'],['功率','2.1 MW']]},
      {n:'④',name:'螺旋桨',en:'PROPELLER',pos:[-104.5,2,0],id:'PP-001',rows:[['直径','8.4 m'],['叶数','5']]},
      {n:'⑤',name:'舵机',en:'STEERING GEAR',pos:[-96,7.6,0],id:'SG-001',rows:[['型式','液压往复'],['转舵角','±35°']]},
      {n:'⑥',name:'克令吊',en:'DECK CRANE',pos:[1,27.5,10.5],id:'CR-001',rows:[['起重能力','150 t × 40 m'],['厂商','Huisman']]}
    ].forEach(h=>{
      const cv=document.createElement('canvas');cv.width=64;cv.height=64;
      const c=cv.getContext('2d');
      c.beginPath();c.arc(32,32,26,0,7);c.fillStyle='rgba(5,18,32,.88)';c.fill();
      c.strokeStyle='#00d0ff';c.lineWidth=3.5;c.stroke();
      c.fillStyle='#fff';c.font='700 24px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(h.n,32,34);
      const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(cv),transparent:true,depthTest:false}));
      sp.position.set(...h.pos); sp.scale.set(3.6,3.6,1);
      sp.userData.hotspot=h; sp.name='HS-'+h.id;
      root.add(sp); hotspots.push(sp);
    });

    return {root,registry,flow,hotspots,water:env.water,axes:env.axes,
      bounds:{x0:-112,x1:112,y0:-30,y1:60,z0:-60,z1:60}};
  }

  return {build,breadth,sheerY};
})();
