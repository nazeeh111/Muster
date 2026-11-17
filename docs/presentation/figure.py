"""Render source-derived eligibility and complete assignment comparisons; stdlib only."""
from pathlib import Path
from html import escape
import json
ROOT=Path(__file__).resolve().parent
BEFORE=json.loads((ROOT/'before-project.json').read_text());AFTER=json.loads((ROOT/'after-project.json').read_text())
RESULTS={k:json.loads((ROOT/f'{k}-result.json').read_text()) for k in ['before','after']}
COLORS={'paper':'#f3f7f6','ink':'#243c48','muted':'#536770','rule':'#c8d5d5','green':'#2b665d','soft':'#e8f1ee','white':'#ffffff','red':'#a2262c'}
# This is an eligibility graph, not a timing, physical, or min-cost-network layout.
# Edges are computed from roles and availability; capacity is the actual total cap.
DRIVERS=[p for p in BEFORE['positions'] if p['roleId']=='driver']
EDGES=[(p['id'],person['id']) for p in DRIVERS for person in BEFORE['people'] if p['roleId'] in person['roles'] and p['blockId'] in person['availability']]
assert EDGES==[('collection','ada'),('delivery','ada')]
assert next(p for p in BEFORE['people'] if p['id']=='ada')['maxAssignments']==1
assert RESULTS['before']['shortage']['positionIds']==[p['id'] for p in DRIVERS]
assert RESULTS['before']['shortage']['capacity']==1 and RESULTS['after']['shortage'] is None
NAMES={p['id']:p['name'] for p in BEFORE['people']}
ASSIGNED={k:{a['positionId']:a['personId'] for a in v['assignments']} for k,v in RESULTS.items()}
def render(mobile):
 w,h=(420,952) if mobile else (1160,760);slug='capacity-mobile' if mobile else 'capacity';items=[]
 def text(x,y,s,size=16,role='ink',weight=400,serif=False):items.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="var(--{role})" font-weight="{weight}"'+(' class="display"' if serif else '')+'>'+escape(str(s))+'</text>')
 def rect(x,y,width,height,fill='white',stroke='rule',rx=0):items.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{rx}" fill="var(--{fill})" stroke="var(--{stroke})"/>')
 def line(x1,y1,x2,y2):items.append(f'<path d="M{x1} {y1}H{x2}" stroke="var(--rule)"/>' if y1==y2 else f'<path d="M{x1} {y1}V{y2}" stroke="var(--rule)"/>')
 items.append(f'<rect width="{w}" height="{h}" fill="var(--paper)"/>')
 m=24 if mobile else 48
 text(m,44 if mobile else 48,'Muster',18,'green',600)
 if mobile:
  text(m,96,'Two driver positions.',32,serif=True);text(m,138,'One available assignment.',32,serif=True)
  text(m,180,'Actual synthetic rota, before the edit.',15,'muted')
  gx,gy=0,0
 else:
  text(m,108,'Two driver positions.',48,serif=True);text(m,170,'One available assignment.',48,serif=True)
  text(m,215,'Actual synthetic rota. Eligibility is not enough; total capacity also matters.',18,'muted')
  gx,gy=24,68
 # Orthogonal eligibility links, distinct attach points, no arrow direction implied.
 items.append(f'<g transform="translate({gx},{gy})">')
 items.append('<path data-edge="collection:ada" d="M188 228H208Q216 228 216 236V244Q216 252 224 252H244" fill="none" stroke="var(--muted)" stroke-width="2"/>')
 items.append('<path data-edge="delivery:ada" d="M188 324H200Q208 324 208 316V284Q208 276 216 276H244" fill="none" stroke="var(--muted)" stroke-width="2"/>')
 rect(24,196,164,64);rect(24,292,164,64);rect(244,236,152,64,'soft','green')
 text(36,220,'Friday',14,'muted');text(36,244,'Collect produce',17,weight=600)
 text(36,316,'Saturday',14,'muted');text(36,340,'Deliver parcels',17,weight=600)
 text(260,261,'Ada',19,weight=600);text(260,285,'Total cap: 1',16)
 items.append('</g>')
 if mobile:
  text(m,400,'Two eligible positions, capacity one.',18,'red',600)
  text(m,429,'At least one must stay unfilled.',16,'muted')
  ty=535;cx=[24,234,326];rowheight=47
  text(m,482,'One stated change',23,serif=True);text(m,510,'Cy is available on Saturday.',17,'green',600)
 else:
  text(48,472,'Two eligible positions, capacity one.',22,'red',600)
  text(48,505,'At least one must stay unfilled.',19,'muted')
  text(600,278,'One stated change',30,serif=True);text(600,313,'Cy is available on Saturday.',21,'green',600)
  ty=360;cx=[600,850,1008];rowheight=47
 text(cx[0],ty,'Position',14,'muted');text(cx[1],ty,'Before',14,'muted');text(cx[2],ty,'After',14,'muted')
 for i,p in enumerate(BEFORE['positions']):
  y=ty+33+i*rowheight
  line(cx[0],y+13,w-m,y+13)
  text(cx[0],y,p['label'],16)
  for k,x in [('before',cx[1]),('after',cx[2])]:
   person=ASSIGNED[k].get(p['id']);s=NAMES[person] if person else 'Unfilled';text(x,y,s,16,'red' if person is None else 'ink',600 if p['id']=='delivery' else 400)
 if mobile:
  text(m,817,'Bob’s welcome-desk lock stays fixed.',16,'green',600)
  text(m,856,'4/5 filled',24,'red',600);text(234,856,'5/5 filled',24,'green',600)
  text(m,892,'Before: 1 reference change. After: 0.',15,'muted')
  text(m,924,'Declared model, not real-world consent.',14,'muted')
 else:
  text(600,649,'Bob’s welcome-desk lock stays fixed.',18,'green',600)
  text(48,600,'4/5 filled',34,'red',600);text(248,600,'5/5 filled',34,'green',600)
  text(48,638,'Before: 1 reference change. After: 0.',18,'muted')
  line(48,692,w-48,692);text(48,728,'Source-derived eligibility and all five assignments. Declared model, not real-world consent.',17,'muted')
 desc='The two driver positions are both eligible for Ada, but her total assignment cap is one; making Cy available on Saturday changes actual coverage from four of five to five of five while Bob’s locked assignment stays fixed.'
 style=':root{'+''.join(f'--{k}:{v};' for k,v in COLORS.items())+'--body:Arial,sans-serif;--display:Georgia,serif;}text{font-family:var(--body)}text.display{font-family:var(--display)}'
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="{slug}-title {slug}-desc"><title id="{slug}-title">Two driver positions, one available assignment</title><desc id="{slug}-desc">{escape(desc)}</desc><style>{style}</style>'+''.join(items)+'</svg>'
 (ROOT/f'{slug}.svg').write_text(svg+'\n')
 html=f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Muster: a shared capacity constraint</title><style>:root{{--paper:{COLORS["paper"]};}}body{{margin:0;background:var(--paper)}}svg{{display:block;width:100%;max-width:{w}px;height:auto;margin:auto}}</style></head><body>{svg}</body></html>'
 (ROOT/f'{slug}.html').write_text(html+'\n')
 return {'file':f'{slug}.svg','width':w,'height':h,'eligibility_edges':EDGES,'before_assignments':ASSIGNED['before'],'after_assignments':ASSIGNED['after'],'scope':'Eligibility links, not the complete solver network; all five assignments shown. Actual named-block example, not timed mode.'}
if __name__=='__main__':
 print(json.dumps([render(False),render(True)],indent=2))
