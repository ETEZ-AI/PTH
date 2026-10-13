"""Generate a non-executable target BPMN and SVG from the same graph model."""
from pathlib import Path
from lxml import etree as E
from html import escape
import json

BASE=Path(__file__).resolve().parents[1]
OUT=BASE/'dist/assets'
W,H=3100,1420
lanes=[('L1','现场／当班',180),('L2','规则辅助',350),('L3','协调／资料',520),('L4','业务负责人',690),('L5','质量复核',860),('L6','接收人员',1030)]
nodes=[]
def node(i,kind,name,lane,x,y,lines=None,label=None):
    w,h=(180,70) if kind=='task' else (64,64) if kind=='exclusiveGateway' else (42,42)
    nodes.append(dict(id=i,kind=kind,name=name,lane=lane,x=x,y=y,w=w,h=h,lines=lines or [name],label=label))
node('S01','startEvent','建立交接任务','L3',230,610,label=(170,647,190,28))
node('T01','task','准备资料','L1',430,265,['准备资料','保留原始来源'])
node('T02','task','只读读取与关联','L2',620,435,['只读读取','与资料关联'])
node('G01','exclusiveGateway','资料可用？','L2',820,435,label=(755,473,150,30))
node('T03','task','规则辅助核对','L2',1020,435,['规则辅助核对','版本／缺项／引用'])
node('T04','task','当班字段核对','L1',1220,265,['当班字段核对','处理核对发现'])
node('G02','exclusiveGateway','存在阻塞？','L1',1420,265,label=(1340,188,165,32))
node('T05','task','登记问题并分派','L3',1110,610,['登记问题并分派','责任接受／期限'])
node('W01','intermediateCatchEvent','补证或处理条件就绪','L3',1280,610,label=(1196,650,142,60))
node('T06','task','补充或修正','L3',1450,610,['补充或修正','保留原值及修订'])
node('G06','exclusiveGateway','有业务变更？','L3',1660,610,label=(1565,651,185,30))
node('T07','task','确认业务变更','L4',1660,785,['确认业务变更','记录当前修订回执'])
node('G07','exclusiveGateway','负责人确认？','L4',1880,785,label=(1920,753,205,30))
node('T08','task','提交质量复核','L1',1630,265,['提交质量复核','锁定送审修订'])
node('T09','task','人工质量复核','L5',1830,945,['人工质量复核','通过／退回／待核查'])
node('G03','exclusiveGateway','质量结论','L5',2010,945,label=(1938,870,155,30))
node('T10','task','接收核对','L6',2180,1115,['接收核对','核对同一修订'])
node('G04','exclusiveGateway','接收确认？','L6',2370,1115,label=(2290,1153,170,30))
node('T11','task','归档条件检查','L2',2520,435,['归档条件检查','修订／来源／确认链'])
node('G05','exclusiveGateway','闭环条件满足？','L2',2670,435,label=(2575,365,190,30))
node('T12','task','归档证据包','L3',2820,610,['归档证据包','冻结本次记录'])
node('E01','endEvent','交接记录闭环','L3',2990,610,label=(2845,650,230,30))
nd={n['id']:n for n in nodes}
flows=[]
def flow(i,s,t,pts,name='',label=None,condition=None):
    flows.append(dict(id=i,source=s,target=t,points=pts,name=name,label=label,condition=condition))
flow('F01','S01','T01',[(251,610),(430,610),(430,300)])
flow('F02','T01','T02',[(520,265),(620,265),(620,400)])
flow('F03','T02','G01',[(710,435),(788,435)])
flow('F04','G01','T03',[(852,435),(930,435)],'是',(871,403,50,26),'资料唯一且可追溯')
flow('F05','G01','T05',[(820,467),(820,610),(1020,610)],'否：读取失败／歧义',(835,570,178,30),'读取失败、歧义或资料过期')
flow('F06','T03','T04',[(1110,435),(1220,435),(1220,300)])
flow('F07','T04','G02',[(1310,265),(1388,265)])
flow('F08','G02','T08',[(1452,265),(1540,265)],'否',(1468,231,55,28),'无关键阻塞问题且当班字段核对完成')
flow('F09','G02','T05',[(1420,297),(1420,510),(1110,510),(1110,575)],'是',(1434,340,54,28),'存在未解决的关键问题')
flow('F10','T05','W01',[(1200,610),(1259,610)])
flow('F11','W01','T06',[(1301,610),(1360,610)])
flow('F12','T06','G06',[(1540,610),(1628,610)])
flow('F13','G06','T02',[(1660,578),(1660,545),(620,545),(620,470)],'仅补证：重新核对',(663,513,274,27),'无业务变更，仅补充证据')
flow('F14','G06','T07',[(1660,642),(1660,750)],'有',(1670,707,52,28),'涉及需授权确认的业务变更')
flow('F15','T07','G07',[(1750,785),(1848,785)])
flow('F16','G07','T02',[(1880,753),(1880,525),(520,525),(520,435),(530,435)],'确认后重核',(1893,690,160,27),'对应授权负责人已确认当前修订')
flow('F17','G07','T06',[(1880,817),(1880,850),(1450,850),(1450,645)],'退回修正',(1535,817,150,28),'业务负责人退回且说明理由')
flow('F18','T08','T09',[(1720,265),(1830,265),(1830,910)])
flow('F19','T09','G03',[(1920,945),(1978,945)])
flow('F20','G03','T10',[(2010,977),(2010,1115),(2090,1115)],'通过',(2023,1050,75,28),'质量人员确认本修订通过')
flow('F21','G03','T06',[(1978,945),(1950,945),(1950,895),(1335,895),(1335,560),(1450,560),(1450,575)],'退回修改',(1525,906,155,28),'质量人员退回修改并说明理由')
flow('F22','G03','T05',[(2042,945),(2110,945),(2110,720),(1140,720),(1140,645)],'待核查',(2140,808,100,28),'质量人员判定证据或关键字段待核查')
flow('F23','T10','G04',[(2270,1115),(2338,1115)])
flow('F24','G04','T11',[(2402,1115),(2520,1115),(2520,470)],'接受',(2410,1070,88,28),'被指定接收人接受质量通过的同一修订')
flow('F25','G04','T05',[(2370,1147),(2370,1190),(1080,1190),(1080,645)],'退回：登记异议',(1580,1151,212,28),'接收人退回且说明理由')
flow('F26','T11','G05',[(2610,435),(2638,435)])
flow('F27','G05','T12',[(2702,435),(2820,435),(2820,575)],'是',(2740,401,52,28),'全部闭环条件满足且归档权限有效')
flow('F28','G05','T05',[(2670,467),(2670,490),(1070,490),(1070,575)],'否：缺证／修订失效',(2230,495,255,28),'缺少有效证据、确认链或修订已失效')
flow('F29','T12','E01',[(2910,610),(2969,610)])

NS={'bpmn':'http://www.omg.org/spec/BPMN/20100524/MODEL','bpmndi':'http://www.omg.org/spec/BPMN/20100524/DI','dc':'http://www.omg.org/spec/DD/20100524/DC','di':'http://www.omg.org/spec/DD/20100524/DI','xsi':'http://www.w3.org/2001/XMLSchema-instance'}
def el(p,tag,**kw):
    a,b=tag.split(':');return E.SubElement(p,'{%s}%s'%(NS[a],b),{k:str(v) for k,v in kw.items()})
def box(p,x,y,w,h):el(p,'dc:Bounds',x=x,y=y,width=w,height=h)
root=E.Element('{%s}definitions'%NS['bpmn'],nsmap=NS,id='Definitions_TargetHandover',targetNamespace='https://example.invalid/fde/handover-demo',exporter='FDE synthetic demo',exporterVersion='0.1')
el(root,'bpmn:documentation').text='合成数据演示；规则模式，AI 未接入；非执行 BPMN，不是流程引擎。真实确认应来自原有授权渠道。'
co=el(root,'bpmn:collaboration',id='Collaboration_Target')
el(co,'bpmn:participant',id='Participant_Target',name='交接闭环演示',processRef='Process_Target')
pr=el(root,'bpmn:process',id='Process_Target',name='生产岗位培训与工序交接目标闭环',isExecutable='false')
el(pr,'bpmn:documentation').text='对应 requirements.md 第 6 节。G06、G07、W01 为明确修订确认和等待路径增加的建模节点。'
ls=el(pr,'bpmn:laneSet',id='LaneSet_Target')
for i,name,y in lanes:
    lane=el(ls,'bpmn:lane',id=i,name=name)
    for n in nodes:
        if n['lane']==i:el(lane,'bpmn:flowNodeRef').text=n['id']
for n in nodes:
    no=el(pr,'bpmn:'+n['kind'],id=n['id'],name=n['name'],**({'gatewayDirection':'Diverging'} if n['kind']=='exclusiveGateway' else {}))
    if n['id'] in ['T07','T09','T10']:el(no,'bpmn:documentation').text='独立人工确认。演示记录无正式审批效力；真实试点读取或引用原有授权渠道的回执。'
    if n['id'] in ['T02','T03','T11']:el(no,'bpmn:documentation').text='确定性规则辅助。当前演示未接入 AI 或真实源系统；源数据只读。'
    for f in flows:
        if f['target']==n['id']:el(no,'bpmn:incoming').text=f['id']
    for f in flows:
        if f['source']==n['id']:el(no,'bpmn:outgoing').text=f['id']
    if n['id']=='W01':
        ev=el(no,'bpmn:conditionalEventDefinition',id='Condition_W01');c=el(ev,'bpmn:condition');c.set('{%s}type'%NS['xsi'],'bpmn:tFormalExpression');c.text='补充证据或人工处理条件已就绪，责任人员可继续办理'
for f in flows:
    sf=el(pr,'bpmn:sequenceFlow',id=f['id'],sourceRef=f['source'],targetRef=f['target'],**({'name':f['name']} if f['name'] else {}))
    if f['condition']:
        c=el(sf,'bpmn:conditionExpression');c.set('{%s}type'%NS['xsi'],'bpmn:tFormalExpression');c.text=f['condition']
notes=[
 '源系统只读：保留来源 ID、原始值、版本及读取时间；规则输出不是业务审批结论。',
 '业务变更、质量复核、接收分别人工确认同一修订；关键修订使相关下游确认失效。真实试点仍需原有授权渠道的可核验回执。',
 'W01 等待不结案；暂停为全局办理限制，恢复后重新核对有效性。归档仅代表交接记录闭环，不代表设备操作或生产放行。',
]
for i,t in enumerate(notes,1):a=el(pr,'bpmn:textAnnotation',id='Note'+str(i));el(a,'bpmn:text').text=t
dia=el(root,'bpmndi:BPMNDiagram',id='Diagram_Target');pl=el(dia,'bpmndi:BPMNPlane',id='Plane_Target',bpmnElement='Collaboration_Target')
sh=el(pl,'bpmndi:BPMNShape',id='Participant_di',bpmnElement='Participant_Target',isHorizontal='true');box(sh,25,180,3040,1020)
for i,name,y in lanes:sh=el(pl,'bpmndi:BPMNShape',id=i+'_di',bpmnElement=i,isHorizontal='true');box(sh,55,y,3010,170)
for n in nodes:
    sh=el(pl,'bpmndi:BPMNShape',id=n['id']+'_di',bpmnElement=n['id'],**({'isMarkerVisible':'true'} if n['kind']=='exclusiveGateway' else {}));box(sh,n['x']-n['w']/2,n['y']-n['h']/2,n['w'],n['h'])
    if n['label']:la=el(sh,'bpmndi:BPMNLabel');box(la,*n['label'])
for f in flows:
    ed=el(pl,'bpmndi:BPMNEdge',id=f['id']+'_di',bpmnElement=f['id'])
    for x,y in f['points']:el(ed,'di:waypoint',x=x,y=y)
    if f['label']:lb=el(ed,'bpmndi:BPMNLabel');box(lb,*f['label'])
for i in range(1,4):sh=el(pl,'bpmndi:BPMNShape',id='Note'+str(i)+'_di',bpmnElement='Note'+str(i));box(sh,70,1267+(i-1)*39,2940,31)
OUT.mkdir(parents=True,exist_ok=True);(OUT/'overall-flow.bpmn').write_bytes(E.tostring(root,pretty_print=True,encoding='UTF-8',xml_declaration=True))

svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title desc">','<title id="title">生产岗位培训与工序交接目标闭环</title>','<desc id="desc">六泳道目标 BPMN，包含只读规则核对、人工修订确认、质量复核、接收、归档和退回补证回路。规则模式，AI 未接入。合成演示。</desc>','<style>text{font-family:"PingFang SC","Heiti SC","Microsoft YaHei",sans-serif}</style>']
ink='#243E4A';linecolor='#617887';border='#CAD5DC'
def rect(x,y,w,h,fill='white',stroke=None,sw=1,r=0):svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" rx="{r}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')
def text(t,x,y,size=20,bold=False,color=ink,anchor='middle'):svg.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{600 if bold else 400}" text-anchor="{anchor}" dominant-baseline="middle" fill="{color}">{escape(t)}</text>')
def line(pts,color=linecolor,sw=2.2):svg.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in pts)+f'" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round"/>')
def poly(pts,fill='white',stroke=ink,sw=2):svg.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in pts)+f'" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
def circle(x,y,r,fill='white',stroke=ink,sw=2):svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
def arrow(pts):
    x,y=pts[-1];a,b=pts[-2];dx=(x>a)-(x<a);dy=(y>b)-(y<b)
    poly([(x,y),(x-9*dx+4*dy,y-9*dy-4*dx),(x-9*dx-4*dy,y-9*dy+4*dx)],linecolor,linecolor,1)
rect(0,0,W,H,'#FFFFFF')
text('生产岗位培训与工序交接目标闭环',65,58,38,True,ink,'start')
text('合成数据演示 · 规则模式 · AI 未接入 · 非执行 BPMN',65,106,22,False,'#697E88','start')
text('先核对依据，再由业务、质量和接收人员分别确认；所有退回和未结项均保留责任与处理记录。',65,148,21,False,'#697E88','start')
rect(25,180,3040,1020,'white',border,1.2)
for j,(i,name,y) in enumerate(lanes):
    rect(55,y,3010,170,'#F7FAFC' if j%2==0 else '#FFFFFF',border,1)
    rect(55,y,102,170,'#E8EFF3',border,1)
    parts=['业务','负责人'] if i=='L4' else name.split('／') if '／' in name else [name]
    for k,p in enumerate(parts):text(p,106,y+76+(k-(len(parts)-1)/2)*29,23,True)
    if i=='L2':text('规则模式',106,y+126,16,False,'#68808C')

drawn=[];crossings=[]
for f in flows:
    for (a,b),(c,d) in zip(f['points'],f['points'][1:]):
        for ox,oy,px,py in drawn:
            if a==c and oy==py and min(b,d)<oy<max(b,d) and min(ox,px)<a<max(ox,px):circle(a,oy,6.5,'white','white',0);crossings.append((a,oy))
            if b==d and ox==px and min(a,c)<ox<max(a,c) and min(oy,py)<b<max(oy,py):circle(ox,b,6.5,'white','white',0);crossings.append((ox,b))
        line([(a,b),(c,d)]);drawn.append((a,b,c,d))
    arrow(f['points'])
for n in nodes:
    x,y,w,h=n['x'],n['y'],n['w'],n['h']
    if n['kind']=='task':
        rect(x-w/2,y-h/2,w,h,'#FFFFFF',ink,1.8,9);text(n['id'],x,y-21,13,False,'#7A8A93')
        for k,t in enumerate(n['lines']):text(t,x,y+1+23*k,18.5,k==0)
    elif n['kind']=='exclusiveGateway':
        poly([(x,y-h/2),(x+w/2,y),(x,y+h/2),(x-w/2,y)],'#FFFCF0',ink,2)
        line([(x-8,y-8),(x+8,y+8)],ink,2.3);line([(x-8,y+8),(x+8,y-8)],ink,2.3)
    elif n['kind']=='intermediateCatchEvent':
        circle(x,y,21);circle(x,y,16,sw=1.4);rect(x-7,y-11,14,22,'white',ink,1)
        for yy in [-6,-2,2,6]:line([(x-4,y+yy),(x+4,y+yy)],ink,1)
    else:circle(x,y,21,sw=4 if n['kind']=='endEvent' else 2)
    if n['label']:
        lx,ly,lw,lh=n['label'];txt=(n['id']+' '+n['name'])
        if n['id']=='W01':text('W01 等待补证',lx+lw/2,ly+10,16);text('处理条件就绪',lx+lw/2,ly+32,16)
        else:text(txt,lx+lw/2,ly+lh/2,17.5,n['kind']=='exclusiveGateway')
for f in flows:
    if f['label']:
        x,y,w,h=f['label'];rect(x,y,w,h,'#FFFFFF');text(f['name'],x+w/2,y+h/2,17.5)
line([(65,1240),(3060,1240)],border,1)
text('阅读提示',65,1270,19,True,ink,'start')
text('菱形 X 为排他判断；双圈为条件等待；顺序流跨越处无连接；同一池的泳道表示职责分工。',200,1270,19,False,'#697E88','start')
for i,t in enumerate(notes):text(t,65,1310+i*33,18.5,False,'#697E88','start')
svg.append('</svg>');(OUT/'overall-flow.svg').write_text('\n'.join(svg),encoding='utf-8')

# Check graph semantics, XML identities/references and complete diagram information.
doc=E.parse(str(OUT/'overall-flow.bpmn'));ids=doc.xpath('//@id');assert len(ids)==len(set(ids))
expected=set(nd)
for n in nodes:
    assert len(doc.xpath(f'//bpmn:lane/bpmn:flowNodeRef[text()="{n["id"]}"]',namespaces=NS))==1
    assert len(doc.xpath(f'//bpmndi:BPMNShape[@bpmnElement="{n["id"]}"]/dc:Bounds',namespaces=NS))==1
    assert n['kind']=='startEvent' or any(f['target']==n['id'] for f in flows)
    assert n['kind']=='endEvent' or any(f['source']==n['id'] for f in flows)
    if n['kind']=='exclusiveGateway':assert len([f for f in flows if f['source']==n['id']])>=2 and all(f['condition'] for f in flows if f['source']==n['id'])
for f in flows:
    assert f['source'] in expected and f['target'] in expected
    assert len(doc.xpath(f'//bpmndi:BPMNEdge[@bpmnElement="{f["id"]}"]/di:waypoint',namespaces=NS))>=2
def reach(start,rev=False):
    reached={start};todo=[start]
    while todo:
        cur=todo.pop()
        for f in flows:
            a,b=(f['target'],f['source']) if rev else (f['source'],f['target'])
            if a==cur and b not in reached:reached.add(b);todo.append(b)
    return reached
assert reach('S01')==expected and reach('E01',True)==expected
intersections=[]
for f in flows:
    for n in nodes:
        if n['id'] in [f['source'],f['target']]:continue
        left,right,top,bottom=n['x']-n['w']/2,n['x']+n['w']/2,n['y']-n['h']/2,n['y']+n['h']/2
        for (a,b),(c,d) in zip(f['points'],f['points'][1:]):
            hit=(a==c and left<a<right and max(min(b,d),top)<min(max(b,d),bottom)) or (b==d and top<b<bottom and max(min(a,c),left)<min(max(a,c),right))
            if hit:intersections.append([f['id'],n['id']])
assert not intersections,intersections
result={'format':'BPMN 2.0, non-executable','dimensions':[W,H],'lanes':len(lanes),'nodeCount':len(nodes),'sequenceFlows':len(flows),'checks':{'xml_parse':True,'unique_ids':True,'source_target_refs':True,'node_lane_membership':True,'start_reachability':True,'possible_completion_path':True,'diagram_shapes_and_edges':True,'conditional_gateway_branches':True,'flows_do_not_cross_unrelated_nodes':True},'xsd_or_editor_import':'Not performed; no claim of actual editor import or full schema validation.','limitations':['Synthetic demo, rules only, no live AI','Business confirmation, quality confirmation, receiving confirmation remain separate human actions','Pause is a global handling constraint described in notes, not a separate execution engine path'],'nodes':nodes,'flows':flows}
(BASE/'diagram-source/validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['nodes','flows']},ensure_ascii=False,indent=2))
