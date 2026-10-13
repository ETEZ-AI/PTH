"""Build a shared-model BPMN 2.0, SVG and high-resolution PNG diagram.

Run with the bundled Python runtime. No browser or network interaction is used.
The BPMN is a non-executable business model reconstructed from synthetic interviews.
"""
from pathlib import Path
import json
from html import escape
from lxml import etree as E
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
W, H, SCALE = 2160, 2870, 2
TITLE = '生产岗位培训与工序交接传统人工流程'
SOURCE = 'https://fde-discovery-lab-67046.app.workbuddy.host/fsg/lab?case=fsg-production-handover'
LANES = [
    ('L01', '业务负责人及交付协调', 80, 500),
    ('L02', '现场执行及培训', 580, 500),
    ('L03', '交接接收方', 1080, 500),
    ('L04', '质量复核', 1580, 500),
]
NODES = [
    dict(id='S01', kind='startEvent', name='任务提出', lane='L01', x=330,y=295,w=42,h=42,lines=['S01 任务提出'],label=(376,278,250,34)),
    dict(id='T01', kind='task', name='确认任务范围与适用要求', lane='L01', x=330,y=390,w=310,h=94,lines=['确认任务范围','与适用要求']),
    dict(id='T02', kind='task', name='收集有效指引及培训资料', lane='L02', x=830,y=530,w=310,h=94,lines=['收集有效指引','及培训资料']),
    dict(id='T03', kind='task', name='核对培训记录与变更覆盖', lane='L02', x=830,y=660,w=310,h=94,lines=['核对培训记录','与变更覆盖']),
    dict(id='G01', kind='exclusiveGateway', name='依据明确且记录齐备？', lane='L02', x=830,y=800,w=72,h=72,lines=['G01 依据明确','且记录齐备？'],label=(890,771,178,62)),
    dict(id='T04', kind='task', name='补齐或澄清依据', lane='L01', x=330,y=800,w=310,h=94,lines=['补齐或澄清依据']),
    dict(id='T05', kind='task', name='编制并提交交接包', lane='L02', x=830,y=940,w=310,h=94,lines=['编制并提交交接包']),
    dict(id='T06', kind='task', name='按原始记录核对交接', lane='L03', x=1330,y=1080,w=310,h=94,lines=['按原始记录','核对交接']),
    dict(id='G02', kind='exclusiveGateway', name='是否发现异常？', lane='L03', x=1330,y=1220,w=72,h=72,lines=['G02 是否','发现异常？'],label=(1388,1245,165,58)),
    dict(id='T07', kind='task', name='登记原始异常', lane='L02', x=830,y=1220,w=310,h=94,lines=['登记原始异常']),
    dict(id='T08', kind='task', name='确认责任人与处理期限', lane='L01', x=330,y=1360,w=310,h=94,lines=['确认责任人','与处理期限']),
    dict(id='T09', kind='task', name='人工质量复核', lane='L04', x=1830,y=1500,w=310,h=94,lines=['人工质量复核']),
    dict(id='G03', kind='exclusiveGateway', name='复核结论？', lane='L04', x=1830,y=1660,w=72,h=72,lines=['G03 复核结论？'],label=(1620,1568,250,36)),
    dict(id='T10', kind='task', name='修正记录并提交变更', lane='L02', x=830,y=1660,w=310,h=94,lines=['修正记录','并提交变更']),
    dict(id='T11', kind='task', name='授权负责人确认变更', lane='L01', x=330,y=1840,w=310,h=94,lines=['授权负责人','确认变更']),
    dict(id='T12', kind='task', name='保留未结项并进入人工队列', lane='L04', x=1830,y=1900,w=310,h=94,lines=['保留未结项','并进入人工队列']),
    dict(id='T13', kind='task', name='记录接收确认意见', lane='L03', x=1330,y=2030,w=310,h=94,lines=['记录接收确认意见']),
    dict(id='W01', kind='intermediateCatchEvent', name='补充证据已提交并触发复核', lane='L04', x=1830,y=2090,w=48,h=48,lines=['W01 补充证据已提交','并触发复核'],label=(1620,2140,370,63)),
    dict(id='G04', kind='exclusiveGateway', name='接收方确认？', lane='L03', x=1330,y=2220,w=72,h=72,lines=['G04 接收方确认？'],label=(1388,2193,178,60)),
    dict(id='T14', kind='task', name='归档来源及确认链', lane='L01', x=330,y=2360,w=310,h=94,lines=['归档来源及确认链']),
    dict(id='E01', kind='endEvent', name='交接记录闭环', lane='L01', x=330,y=2490,w=42,h=42,lines=['E01 交接记录闭环']),
]
ND={n['id']:n for n in NODES}
FLOWS=[]
def flow(fid,src,dst,pts,label='',labelbox=None,condition=None):
    FLOWS.append(dict(id=fid,source=src,target=dst,points=pts,name=label,label=labelbox,condition=condition))
flow('F01','S01','T01',[(330,316),(330,343)])
flow('F02','T01','T02',[(330,437),(330,470),(830,470),(830,483)])
flow('F03','T02','T03',[(830,577),(830,613)])
flow('F04','T03','G01',[(830,707),(830,764)])
flow('F05','G01','T04',[(794,800),(485,800)],'否',(610,764,90,30),'依据不明或记录不齐')
flow('F06','T04','T02',[(330,753),(330,530),(675,530)],'补齐后重新核对',(345,552,260,32))
flow('F07','G01','T05',[(830,836),(830,893)],'是',(844,850,80,28),'依据明确且记录齐备')
flow('F08','T05','T06',[(830,987),(830,1020),(1330,1020),(1330,1033)])
flow('F09','T06','G02',[(1330,1127),(1330,1184)])
flow('F10','G02','T07',[(1294,1220),(985,1220)],'是',(1130,1182,80,30),'发现异常')
flow('F11','G02','T09',[(1366,1220),(1830,1220),(1830,1453)],'否',(1540,1182,80,30),'未发现异常')
flow('F12','T07','T08',[(830,1267),(830,1360),(485,1360)])
flow('F13','T08','T09',[(330,1407),(330,1500),(1675,1500)])
flow('F14','T09','G03',[(1830,1547),(1830,1624)])
flow('F15','G03','T10',[(1794,1660),(985,1660)],'需修正',(1360,1620,190,30),'复核结论为需修正')
flow('F16','T10','T11',[(830,1707),(830,1840),(485,1840)])
flow('F17','T11','T05',[(175,1840),(130,1840),(130,940),(675,940)],'确认后重新提交',(360,900,270,30))
flow('F18','G03','T12',[(1866,1660),(2010,1660),(2010,1900),(1985,1900)],'待核查',(1870,1618,138,32),'证据或关键字段仍待核查')
flow('F19','T12','W01',[(1830,1947),(1830,2066)])
flow('F20','W01','T09',[(1854,2090),(2040,2090),(2040,1500),(1985,1500)])
flow('F21','G03','T13',[(1830,1696),(1830,1750),(1330,1750),(1330,1983)],'通过',(1525,1710,110,30),'授权人员复核通过')
flow('F22','T13','G04',[(1330,2077),(1330,2184)])
flow('F23','G04','T07',[(1294,2220),(1050,2220),(1050,1160),(830,1160),(830,1173)],'否 记录异议并回查',(1075,2250,252,32),'接收方提出异议或未确认')
flow('F24','G04','T14',[(1330,2256),(1330,2360),(485,2360)],'是',(1360,2300,80,30),'接收方明确确认')
flow('F25','T14','E01',[(330,2407),(330,2469)])

NOTES=[
    '建模说明：依据合成访谈重建，待业务确认。已确认主链为任务确认 → 培训记录 → 工序交接 → 异常回报 → 质量复核。',
    'G01 具体阈值、G03 处理路径、G04 确认关口及接收岗位拆分为建模建议；本图暂按逐单质量复核建模，频次待确认。',
    '全部任务由人员在原系统或表格办理；W01 为条件等待，未结项不结束流程。E01 仅代表交接记录闭环，不代表生产放行。',
]

NS={'bpmn':'http://www.omg.org/spec/BPMN/20100524/MODEL','bpmndi':'http://www.omg.org/spec/BPMN/20100524/DI','dc':'http://www.omg.org/spec/DD/20100524/DC','di':'http://www.omg.org/spec/DD/20100524/DI','xsi':'http://www.w3.org/2001/XMLSchema-instance'}
def el(parent,tag,**attrs):
    p,n=tag.split(':'); return E.SubElement(parent,'{%s}%s'%(NS[p],n),{k:str(v) for k,v in attrs.items()})
def bounds(parent,x,y,w,h): return el(parent,'dc:Bounds',x=x,y=y,width=w,height=h)
root=E.Element('{%s}definitions'%NS['bpmn'], nsmap=NS,id='Definitions_ProductionHandover',targetNamespace='https://example.invalid/fsg/production-handover',exporter='FDE business analysis',exporterVersion='1.0')
el(root,'bpmn:documentation').text='非执行模型。合成访谈重建、待业务确认。'+SOURCE
collab=el(root,'bpmn:collaboration',id='Collaboration_ProductionHandover')
el(collab,'bpmn:participant',id='Participant_Service',name='业务交付协作流程',processRef='Process_ProductionHandover')
proc=el(root,'bpmn:process',id='Process_ProductionHandover',name=TITLE,isExecutable='false')
el(proc,'bpmn:documentation').text='\n'.join(NOTES)
ls=el(proc,'bpmn:laneSet',id='LaneSet_01')
for lid,name,x,width in LANES:
    la=el(ls,'bpmn:lane',id=lid,name=name)
    for n in NODES:
        if n['lane']==lid: el(la,'bpmn:flowNodeRef').text=n['id']
for n in NODES:
    attrs=dict(id=n['id'],name=n['name'])
    if n['kind']=='exclusiveGateway': attrs['gatewayDirection']='Diverging'
    node=el(proc,'bpmn:'+n['kind'],**attrs)
    if n['kind']=='task': el(node,'bpmn:documentation').text='人工办理，使用既有原系统或表格；详细输入输出及权限参见业务分析文档。'
    for f in FLOWS:
        if f['target']==n['id']: el(node,'bpmn:incoming').text=f['id']
    for f in FLOWS:
        if f['source']==n['id']: el(node,'bpmn:outgoing').text=f['id']
    if n['id']=='W01':
        cd=el(node,'bpmn:conditionalEventDefinition',id='ConditionalEventDefinition_W01')
        co=el(cd,'bpmn:condition');co.set('{%s}type'%NS['xsi'],'bpmn:tFormalExpression');co.text='补充证据已提交，且责任人已请求重新复核'
for f in FLOWS:
    sf=el(proc,'bpmn:sequenceFlow',id=f['id'],sourceRef=f['source'],targetRef=f['target'],**({'name':f['name']} if f['name'] else {}))
    if f['condition']:
        ce=el(sf,'bpmn:conditionExpression');ce.set('{%s}type'%NS['xsi'],'bpmn:tFormalExpression');ce.text=f['condition']
for i,txt in enumerate(NOTES,1):
    ann=el(proc,'bpmn:textAnnotation',id=f'Note_{i}');el(ann,'bpmn:text').text=txt
diagram=el(root,'bpmndi:BPMNDiagram',id='BPMNDiagram_01',name=TITLE)
plane=el(diagram,'bpmndi:BPMNPlane',id='BPMNPlane_01',bpmnElement='Collaboration_ProductionHandover')
ps=el(plane,'bpmndi:BPMNShape',id='Participant_Service_di',bpmnElement='Participant_Service',isHorizontal='false');bounds(ps,80,174,2000,2406)
for lid,name,x,width in LANES:
    sh=el(plane,'bpmndi:BPMNShape',id=lid+'_di',bpmnElement=lid,isHorizontal='false');bounds(sh,x,200,width,2380)
for n in NODES:
    attrs=dict(id=n['id']+'_di',bpmnElement=n['id'])
    if n['kind']=='exclusiveGateway':attrs['isMarkerVisible']='true'
    sh=el(plane,'bpmndi:BPMNShape',**attrs);bounds(sh,n['x']-n['w']/2,n['y']-n['h']/2,n['w'],n['h'])
    if n['kind']!='task':
        bb=n.get('label',(n['x']-170,n['y']+38,340,34))
        bl=el(sh,'bpmndi:BPMNLabel');bounds(bl,*bb)
for f in FLOWS:
    ed=el(plane,'bpmndi:BPMNEdge',id=f['id']+'_di',bpmnElement=f['id'])
    for x,y in f['points']:el(ed,'di:waypoint',x=x,y=y)
    if f['label']:
        bl=el(ed,'bpmndi:BPMNLabel');bounds(bl,*f['label'])
for i in range(1,4):
    sh=el(plane,'bpmndi:BPMNShape',id=f'Note_{i}_di',bpmnElement=f'Note_{i}');bounds(sh,80,2670+(i-1)*43,2000,36)
OUT.joinpath('传统人工流程.bpmn').write_bytes(E.tostring(root,pretty_print=True,encoding='UTF-8',xml_declaration=True))

# Shared drawing primitives keep the editable vector and raster views consistent.
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">',f'<title id="title">{TITLE}</title>',f'<desc id="desc">四泳道传统人工业务 BPMN 图。合成访谈重建、待业务确认。全部人工任务，含异常、修改及等待闭环。</desc>', '<style>text{font-family:"PingFang SC","Heiti SC","STHeiti",sans-serif}</style>']
im=Image.new('RGB',(W*SCALE,H*SCALE),'white'); dr=ImageDraw.Draw(im)
font_regular='/System/Library/Fonts/STHeiti Light.ttc';font_bold='/System/Library/Fonts/STHeiti Medium.ttc'
INK='#243746'; MUTED='#637380'; LINE='#536878'; ACCENT='#24495C'; BORDER='#BAC7CF'
def rect(x,y,w,h,fill='white',stroke=None,sw=1,r=0):
    attrs=f'x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"'
    if stroke: attrs+=f' stroke="{stroke}" stroke-width="{sw}"'
    if r:attrs+=f' rx="{r}"'
    svg.append('<rect '+attrs+'/>')
    box=(round(x*SCALE),round(y*SCALE),round((x+w)*SCALE),round((y+h)*SCALE))
    fn=dr.rounded_rectangle if r else dr.rectangle
    fn(box,**({'radius':r*SCALE} if r else {}),fill=fill,outline=stroke,width=max(1,round(sw*SCALE)))
def line(points,color=LINE,width=2.4,dash=False):
    svg.append(f'<polyline points="'+ ' '.join(f'{x},{y}' for x,y in points)+f'" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"'+(' stroke-dasharray="7 7"' if dash else '')+'/>')
    dr.line([(round(x*SCALE),round(y*SCALE)) for x,y in points],fill=color,width=round(width*SCALE),joint='curve')
def polygon(points,fill='white',stroke=INK,sw=2.5):
    svg.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in points)+f'" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
    pp=[(round(x*SCALE),round(y*SCALE)) for x,y in points];dr.polygon(pp,fill=fill);dr.line(pp+[pp[0]],fill=stroke,width=round(sw*SCALE),joint='curve')
def ellipse(x,y,r,fill='white',stroke=INK,sw=2.4):
    svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
    dr.ellipse(((x-r)*SCALE,(y-r)*SCALE,(x+r)*SCALE,(y+r)*SCALE),fill=fill,outline=stroke,width=round(sw*SCALE))
def text(s,x,y,size=23,bold=False,color=INK,anchor='middle'):
    weight='600' if bold else '400'
    svg.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" dominant-baseline="middle" fill="{color}">{escape(s)}</text>')
    font=ImageFont.truetype(font_bold if bold else font_regular,size*SCALE)
    anchorp={'middle':'mm','start':'lm','end':'rm'}[anchor]
    dr.text((x*SCALE,y*SCALE),s,font=font,fill=color,anchor=anchorp)
def arrow(points):
    x,y=points[-1];a,b=points[-2];dx=1 if x>a else -1 if x<a else 0;dy=1 if y>b else -1 if y<b else 0
    polygon([(x,y),(x-11*dx+4.6*dy,y-11*dy-4.6*dx),(x-11*dx-4.6*dy,y-11*dy+4.6*dx)],LINE,LINE,1)
rect(0,0,W,H,'#FFFFFF')
text('传统人工流程  /  BPMN 2.0',80,47,20,False,MUTED,'start')
text(TITLE,80,99,43,True,INK,'start')
text('合成访谈重建 · 待业务确认    |    流程方向：由上至下    |    所有任务均由人员办理',80,151,22,False,MUTED,'start')
rect(80,174,2000,2406,'#FFFFFF',BORDER,1.6)
text('业务交付协作流程',1080,187,16,False,MUTED)
for i,(lid,name,x,width) in enumerate(LANES):
    rect(x,200,width,2380,'#FAFCFD' if i%2==0 else '#FFFFFF',BORDER,1)
    rect(x,200,width,60,'#EAF0F4',BORDER,1)
    text(name,x+width/2,230,25,True,ACCENT)

# Draw sequence flows, with small line-jumps where paths cross.
# A crossing has no connector and carries no business meaning.
drawn=[]
crossings=[]
for f in FLOWS:
    for (a,b),(c,d) in zip(f['points'],f['points'][1:]):
        for ox1,oy1,ox2,oy2 in drawn:
            if a==c and oy1==oy2 and min(b,d)<oy1<max(b,d) and min(ox1,ox2)<a<max(ox1,ox2):
                ellipse(a,oy1,7.3,fill='white',stroke='white',sw=0.1);crossings.append((a,oy1))
            elif b==d and ox1==ox2 and min(a,c)<ox1<max(a,c) and min(oy1,oy2)<b<max(oy1,oy2):
                ellipse(ox1,b,7.3,fill='white',stroke='white',sw=0.1);crossings.append((ox1,b))
        line([(a,b),(c,d)])
        drawn.append((a,b,c,d))
    arrow(f['points'])
for n in NODES:
    x,y,w,h=n['x'],n['y'],n['w'],n['h']
    if n['kind']=='task':
        rect(x-w/2,y-h/2,w,h,'#FFFFFF',ACCENT,2.2,12)
        text(n['id'],x,y-h/2+18,16,True,MUTED)
        yy=y+10 if len(n['lines'])==1 else y-3
        for k,t in enumerate(n['lines']):text(t,x,yy+29*k,24)
    elif n['kind']=='exclusiveGateway':
        polygon([(x,y-h/2),(x+w/2,y),(x,y+h/2),(x-w/2,y)],'#FFFDF5',INK,2.5)
        line([(x-10,y-10),(x+10,y+10)],INK,3)
        line([(x-10,y+10),(x+10,y-10)],INK,3)
        lx,ly,lw,lh=n['label']
        for k,t in enumerate(n['lines']):text(t,lx+lw/2,ly+16+k*27,21,True)
    elif n['kind']=='startEvent':
        ellipse(x,y,w/2,'#FFFFFF',INK,2.5)
        text(n['lines'][0],x+46,y,21,False,INK,'start')
    elif n['kind']=='endEvent':
        ellipse(x,y,w/2,'#FFFFFF',INK,4.7)
        text(n['lines'][0],x,y+43,21,True)
    else:
        ellipse(x,y,w/2,'#FFFFFF',INK,2)
        ellipse(x,y,w/2-5,'#FFFFFF',INK,1.5)
        # BPMN conditional event marker, a sheet with horizontal rule lines.
        rect(x-8,y-12,16,24,'#FFFFFF',INK,1.2)
        for yy in [y-7,y-2,y+3,y+8]:line([(x-5,yy),(x+5,yy)],INK,1)
        lx,ly,lw,lh=n['label']
        for k,t in enumerate(n['lines']):text(t,lx+lw/2,ly+16+k*27,21)
for f in FLOWS:
    if f['label']:
        x,y,w,h=f['label'];rect(x,y,w,h,'#FFFFFF');text(f['name'],x+w/2,y+h/2,20,False,INK)

line([(80,2625),(2080,2625)],BORDER,1.2)
text('符号',80,2655,20,True,INK,'start')
ellipse(177,2655,12,sw=2);text('开始 / 结束事件',199,2655,19,False,MUTED,'start')
rect(460,2643,37,24,stroke=INK,sw=1.7,r=5);text('人工办理任务',512,2655,19,False,MUTED,'start')
polygon([(780,2641),(794,2655),(780,2669),(766,2655)],'#FFFDF5',INK,1.7);text('X',780,2656,17,True);text('排他判断：只走一条分支',810,2655,19,False,MUTED,'start')
ellipse(1174,2655,13,sw=1.8);ellipse(1174,2655,9,sw=1.2);text('条件等待',1200,2655,19,False,MUTED,'start')
line([(1400,2655),(1468,2655)],LINE,2.3);arrow([(1400,2655),(1468,2655)]);text('顺序流',1485,2655,19,False,MUTED,'start')
text('线条跨越处无连接关系',1710,2655,19,False,MUTED,'start')
for i,txt in enumerate(NOTES):text(txt,80,2711+i*44,20,False,MUTED,'start')
text('来源：案例角色访谈及 36 项调查事实  ·  制图版本 1.0  ·  2026-10-13',80,2830,18,False,MUTED,'start')
svg.append('</svg>');OUT.joinpath('传统人工流程.svg').write_text('\n'.join(svg),encoding='utf-8')
im.save(OUT/'传统人工流程.png',dpi=(240,240))

# Local semantic/structural validation. XSD validation is optional when the OMG
# schema files are present; network access is intentionally not required.
doc=E.parse(str(OUT/'传统人工流程.bpmn'))
ids=doc.xpath('//@id');assert len(ids)==len(set(ids)),'duplicate IDs'
expected={n['id'] for n in NODES}; assert len(expected)==21
for n in NODES:
    assigns=doc.xpath(f'//bpmn:lane/bpmn:flowNodeRef[text()="{n["id"]}"]',namespaces=NS)
    assert len(assigns)==1,(n['id'],'lane assignment')
    inc=[f for f in FLOWS if f['target']==n['id']];out=[f for f in FLOWS if f['source']==n['id']]
    assert n['kind']=='startEvent' or inc,(n['id'],'no incoming')
    assert n['kind']=='endEvent' or out,(n['id'],'no outgoing')
    if n['kind']=='exclusiveGateway':assert len(out)>=2 and all(f['condition'] for f in out)
    sh=doc.xpath(f'//bpmndi:BPMNShape[@bpmnElement="{n["id"]}"]/dc:Bounds',namespaces=NS);assert len(sh)==1
for f in FLOWS:
    assert f['source'] in expected and f['target'] in expected
    edge=doc.xpath(f'//bpmndi:BPMNEdge[@bpmnElement="{f["id"]}"]/di:waypoint',namespaces=NS);assert len(edge)>=2
    assert all(a==c or b==d for (a,b),(c,d) in zip(f['points'],f['points'][1:])),f['id']
    for n in NODES:
        if n['id'] in (f['source'],f['target']):continue
        left=n['x']-n['w']/2;right=n['x']+n['w']/2;top=n['y']-n['h']/2;bottom=n['y']+n['h']/2
        for (a,b),(c,d) in zip(f['points'],f['points'][1:]):
            hit=(a==c and left<a<right and max(min(b,d),top)<min(max(b,d),bottom)) or (b==d and top<b<bottom and max(min(a,c),left)<min(max(a,c),right))
            assert not hit,(f['id'],'crosses node',n['id'])
def reachable(start,reverse=False):
    reached={start}; todo=[start]
    while todo:
        cur=todo.pop()
        for f in FLOWS:
            a,b=(f['target'],f['source']) if reverse else (f['source'],f['target'])
            if a==cur and b not in reached:reached.add(b);todo.append(b)
    return reached
assert reachable('S01')==expected,'unreachable nodes'
assert reachable('E01',True)==expected,'nodes without possible completion path'
assert ND['W01']['kind']=='intermediateCatchEvent'
assert [f['target'] for f in FLOWS if f['source']=='W01']==['T09']
assert doc.xpath('string(//bpmn:process/@isExecutable)',namespaces=NS)=='false'
assert not doc.xpath('//bpmn:exclusiveGateway[@default]',namespaces=NS)
xsd_status='未执行：当前环境无法解析 OMG 下载域名；已完成本地 XML 及语义结构校验。'
xsd=HERE/'xsd/BPMN20.xsd'
if xsd.exists():
    schema=E.XMLSchema(E.parse(str(xsd)));schema.assertValid(doc);xsd_status='OMG BPMN 2.0 XML Schema 校验通过。'
report={
 'version':'1.0','date':'2026-10-13','source':SOURCE,
 'artifacts':['传统人工流程.bpmn','传统人工流程.svg','传统人工流程.png'],
 'model':{'participants':1,'lanes':4,'tasks':14,'exclusive_gateways':4,'events':3,'sequence_flows':25,'message_flows':0,'executable':False},
 'checks':{'xml_well_formed':True,'unique_ids':True,'lane_membership_complete':True,'source_target_references_resolve':True,'all_nodes_reachable_from_start':True,'all_nodes_have_possible_path_to_end':True,'gateway_branches_have_conditions':True,'no_default_pass':True,'bpmndi_complete':True,'orthogonal_routing':True,'flows_do_not_intersect_unrelated_nodes':True,'waiting_event_not_end':True},
 'xsd_validation':xsd_status,'editor_import_validation':'未执行，未声称已实际导入编辑器。',
 'visual':{'svg_size':[W,H],'png_size':[W*SCALE,H*SCALE],'png_font':'STHeiti Light / Medium（当前 macOS 可用中文字体）','svg_font_stack':'PingFang SC, Heiti SC, STHeiti, sans-serif','line_crossings_without_connection':list(dict.fromkeys(crossings))},
 'notes':NOTES,'nodes':NODES,'flows':FLOWS,
}
HERE.joinpath('diagram_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
HERE.joinpath('README.md').write_text('''# 传统人工流程图源文件

`build_diagram.py` 从同一组节点、连线与坐标生成 BPMN 2.0 XML、SVG 和 PNG；包含完整 BPMNDI。

- BPMN 是非执行模型，所有任务按人工办理表述。
- SVG 可放大；PNG 为 4320 × 5740 像素，适用于文档嵌入。
- 四条泳道位于同一参与者池内，无跨池顺序流；未将客户设为逐单强制审批人。
- W01 是带条件事件定义的中间捕获事件，保留等待状态，补证后重回 T09。
- 所有判断使用排他网关，分支含条件，无默认通过。
- `diagram_validation.json` 保留节点、连线、建模注释与实际校验边界。
- 本地已检查 XML 可解析、唯一 ID、节点归属、源目标引用、可达性、网关条件、DI 完整性及连线不穿越无关节点。
- 当前网络无法下载 OMG XSD，因此没有宣称通过完整 Schema 校验；也没有宣称实际导入编辑器验证。

图示依据合成案例访谈重建，关键关口、接收岗位及逐单复核频次均待业务确认。
规范来源：https://www.omg.org/spec/BPMN/2.0.2
''',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in ['nodes','flows']},ensure_ascii=False,indent=2))
