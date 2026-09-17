"""Disconnected printed structure v1. No financial claims, providers or runtime imports.

All associations carry original fragment refs. Admission is geometric/structural,
never based on an expected amount, file name, merchant or a reconciling sum.
"""
from __future__ import annotations
import copy,hashlib,json,math,re,statistics

def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def norm(s):return re.sub(r'\s+','',s).lower()
def words(fs):return ' '.join(f['text'] for f in sorted(fs,key=lambda f:f['x']))
def money(s):return bool(re.fullmatch(r'(?:-?\$?\d[\d,]*\.\d{2}|\(\$?\d[\d,]*\.\d{2}\)|0)',re.sub(r'\s+','',s)))
def numeric(s):return bool(re.fullmatch(r'[-$()\d,.\s%]+',s)) and any(c.isdigit() for c in s)
def center(f):return f['x']+f['width']/2

def lines(page):
 out=[]
 for f in sorted(page['fragments'],key=lambda f:(f['baseline'],f['x'],f['id'])):
  found=[r for r in out[-3:] if abs(statistics.median(x['baseline'] for x in r)-f['baseline'])<=min(3.0,f['height']*.43)]
  if found:found[-1].append(f)
  else:out.append([f])
 return [sorted(r,key=lambda f:f['x']) for r in out]

def line_y(row):return min(f['y'] for f in row)
def heading(row):
 s=words(row).strip();n=norm(s)
 return (not any(numeric(f['text']) for f in row) and (max(f['height'] for f in row)>=9 or n.startswith(('summaryby','amountsfundedby','amountssubmitted','fees','interchangecharges','totalgrossreportable','chargebacks/reversals','adjustments/chargebacks','thirdpartytransactions'))))
def furniture(row,page):
 s=norm(words(row));y=line_y(row)
 return y>page['height']*.94 or y<page['height']*.14 and any(k in s for k in ['merchantnumber','customerservice','statementperiod','yourcardprocessingstatement','pobox','page','website','phone'])

def col(label,refs,cx,role=None):return {'printedLabel':label,'headerRefs':[f['id'] for f in refs],'center':cx,'role':role or ('amount' if 'amount' in norm(label) or norm(label)=='total' else 'count' if norm(label)=='items' else 'text')}

def header_at(rows,i,page):
 r=rows[i];ns=[norm(f['text']) for f in r];s=norm(words(r))
 # Explicit six-column dated fee schema.
 if all(x in ns for x in ['date','type','description','volume','rate','total']):
  cs=[col(f['text'],[f],center(f),'amount' if norm(f['text'])=='total' else 'basis_or_volume' if norm(f['text'])=='volume' else 'rate' if norm(f['text'])=='rate' else 'text') for f in r]
  return {'kind':'fees','columns':cs,'headerRows':[i],'title':'Fees charged','titleRefs':[],'headerMode':'explicit'}
 # Three-column fee grid: unlabelled left description remains explicitly unlabelled.
 if 'type' in ns and 'amount' in ns and len(r)<=4:
  typ=next(f for f in r if norm(f['text'])=='type');amt=next(f for f in r if norm(f['text'])=='amount')
  left=[f for f in r if f['x']<typ['x'] and norm(f['text']) not in ['type','amount']]
  title=words(left) or 'Fees';title_refs=[f['id'] for f in left]
  if not left:
   for prev in reversed(rows[max(0,i-3):i]):
    if heading(prev) and 'fee' in norm(words(prev)):title=words(prev);title_refs=[f['id'] for f in prev];break
  cs=[col(None,[],max(0,typ['x']-page['width']*.45),'unlabelled_text'),col(typ['text'],[typ],center(typ),'text'),col(amt['text'],[amt],center(amt),'amount')]
  return {'kind':'fees','columns':cs,'headerRows':[i],'title':title,'titleRefs':title_refs,'headerMode':'explicit_with_unlabelled_left_column'}
 # Two-line funding columns, individually anchored by their printed words.
 if 'date' in ns and 'batch' in ns and 'funded' in ns and i+1<len(rows):
  nxt=rows[i+1]
  if line_y(nxt)-line_y(r)>14:return None
  cs=[]
  for f in r:
   under=[g for g in nxt if abs(center(g)-center(f))<max(16,f['width']*.55) and not numeric(g['text'])]
   if len(under)!=1:return None
   label=f['text']+' '+under[0]['text'];cs.append(col(label,[f,under[0]],center(f),'amount' if norm(f['text']) not in ['date','batch'] else 'text'))
  if len(cs)!=7:return None
  return {'kind':'funding','columns':cs,'headerRows':[i,i+1],'title':'Amounts funded by batch','titleRefs':[],'headerMode':'explicit_multiline'}
 # Batch summary with multi-level gross/refund/submitted headers.
 if 'batch' in ns and any('submitdate'==n for n in ns) and ns.count('items')>=2:
  near=[f for row in rows[max(0,i-2):min(len(rows),i+2)] for f in row if abs(f['baseline']-r[0]['baseline'])<26]
  leaves=[f for f in r if norm(f['text']) in ['batch','submitdate','items','amount']]
  avg=[f for f in near if norm(f['text']) in ['average','ticket']]
  parents=[f for f in near if norm(f['text'])=='refunds' or 'totalgrosssales' in norm(f['text']) or 'totalamountyousubmitted' in norm(f['text'])]
  if len(avg)!=2 or len(parents)!=3:return None
  cs=[col(f['text'],[f],center(f)) for f in leaves]+[col('Average Ticket',avg,statistics.mean(center(f) for f in avg),'amount')]
  cs.sort(key=lambda c:c['center']);parents.sort(key=center)
  for c in cs:
   if norm(c['printedLabel']) not in ['items','amount']:continue
   parent=min(parents,key=lambda p:abs(center(p)-c['center']));c['headerPath']=[parent['text'],c['printedLabel']];c['headerRefs'].insert(0,parent['id'])
  return {'kind':'batch','columns':cs,'headerRows':sorted({j for j in range(max(0,i-2),min(len(rows),i+2)) if any(f in near and (f in parents or f in avg or f in leaves) for f in rows[j])}),'title':'Summary by batch','titleRefs':[],'headerMode':'explicit_multilevel'}
 return None

def assign(row,table,page):
 cs=table['columns'];centers=[c['center'] for c in cs]
 bounds=[0]+[(a+b)/2 for a,b in zip(centers,centers[1:])]+[page['width']]
 if cs[0]['role']=='unlabelled_text':bounds[1]=centers[1]-(centers[2]-centers[1])/2
 cells=[{'column':i,'rawText':'','normalizedText':'','fragmentRefs':[]} for i in range(len(cs))]
 buckets=[[] for c in cs];problems=[]
 for f in row:
  j=next((i for i in range(len(cs)) if bounds[i]<=center(f)<bounds[i+1]),None)
  if j is None:problems.append('fragment_outside_column_frame');continue
  buckets[j].append(f)
 for i,fs in enumerate(buckets):
  fs.sort(key=lambda f:f['x']);cells[i].update(rawText=words(fs),normalizedText=re.sub(r'\s+','',words(fs)) if cs[i]['role'] in ['amount','count','rate','basis_or_volume'] else words(fs),fragmentRefs=[f['id'] for f in fs])
  for a,b in zip(fs,fs[1:]):
   if b['x']<a['x']+a['width']-.8:problems.append('overlapping_fragments')
   if cs[i]['role']!='unlabelled_text' and cs[i]['printedLabel'] not in ['Description'] and b['x']-(a['x']+a['width'])>max(a['height']*2,14):problems.append('disjoint_fragments_in_column')
  if fs and cs[i]['role']=='amount' and not money(words(fs)):problems.append('amount_lexeme_unresolved')
  if fs and cs[i]['role']=='count' and not re.fullmatch(r'[\d,\s]+',words(fs)):problems.append('count_lexeme_unresolved')
 refs=[f['id'] for f in row]
 return {'id':'r-'+digest(refs)[:16],'page':page['page'],'y':line_y(row),'fragmentRefs':refs,'cells':cells,'status':'accepted' if not problems else 'unresolved','reasons':sorted(set(problems))}

def assemble(packet,reference=None):
 from coverage import source_context, finish_coverage
 if packet.get('schema')!='positioned-native-evidence-v1' or not re.fullmatch('[0-9a-f]{64}',packet.get('sourceSha256','')):raise ValueError('Invalid source packet')
 seen=set();pages=packet['pages'];pnums=[p['page'] for p in pages]
 if pnums!=sorted(set(pnums)):raise ValueError('Duplicate or unordered source pages')
 for p in pages:
  for f in p['fragments']:
   if f['id'] in seen:raise ValueError('Duplicate fragment reference')
   seen.add(f['id'])
   if not f['text'] or any(not isinstance(f[k],(int,float)) or not math.isfinite(f[k]) for k in ['x','y','width','height','baseline']) or f['width']<0 or f['height']<=0:raise ValueError('Invalid fragment geometry')
 result={'schema':'printed-membership-v1','authority':'evaluation_only_no_financial_authority','sourceSha256':packet['sourceSha256'],'inputFingerprint':digest(packet),'tables':[],'continuations':[],'unassignedRows':[],'limitations':['Printed membership is not financial population identity or economic semantics.','Source absence cannot be disproved solely by an extracted text packet.','Wrapped rows without unique geometric attachment remain unresolved.']}
 contexts,banners=source_context(packet)
 pending_previous=None
 for page in pages:
  rs=lines(page);headers={};consumed=set()
  for i in range(len(rs)):
   if i in consumed:continue
   h=header_at(rs,i,page)
   if h:headers[min(h['headerRows'])]=h;consumed.update(h['headerRows'])
  active=None;last=None;body=[]
  def finish(reason):
   nonlocal active,last,body
   if active is not None:
    resolve_text_rows(active,packet)
    active['endReason']=reason;active['openEnd']=reason=='page_end' and not active.get('closedByTotal',False)
    finalize_totals(active)
    result['tables'].append(active);last=active;active=None;body=[]
  for i,r in enumerate(rs):
   if i in headers:
    finish('next_header');h=copy.deepcopy(headers[i]);active={**h,'id':f"t{page['page']}-{i}",'page':page['page'],'rows':[],'totals':[],'openStart':False,'closedByTotal':False}
    # Adjacent repeated headers are proposals; a closed predecessor cannot continue.
    if pending_previous and last is None:
     link_tables(pending_previous,active,result,page)
    continue
   if i in consumed:continue
   if all(f['id'] in contexts for f in r) and not any(f['id'] in banners for f in r):continue
   if furniture(r,page) or (line_y(r)>page['height']*.88 and sum(any(norm(words(q))==norm(words(r)) for q in lines(p)) for p in pages)>=2):continue
   s=words(r);n=norm(s)
   if active is None:
    # Headerless fee continuation requires adjacent open predecessor, explicit FEES heading,
    # same page width and later row validation. It remains unresolved, never guessed.
    if pending_previous and pending_previous['openEnd'] and heading(r) and n.startswith('fees') and pending_previous['kind']=='fees' and len(pending_previous['columns'])==3:
     h=copy.deepcopy({k:pending_previous[k] for k in ['kind','columns','title','titleRefs','headerMode']});h['headerMode']='inherited_proposal'
     active={**h,'id':f"t{page['page']}-{i}",'page':page['page'],'rows':[],'totals':[],'openStart':True,'closedByTotal':False,'headerRows':[]}
     result['continuations'].append({'from':pending_previous['id'],'to':active['id'],'status':'unresolved','reasons':['no_repeated_column_headers'],'sourcePages':[pending_previous['page'],page['page']]})
    else:result['unassignedRows'].append({'page':page['page'],'text':s,'fragmentRefs':[f['id'] for f in r]})
    continue
   is_total=bool(re.match(r'^(?:sub\s*totals?|totals?)\b',s.strip(),re.I))
   if heading(r) and not is_total and not ('fee' in n and n.startswith('fees') and len(active['rows'])==0):
    # Small textual group labels stay inside fees; major headings close scope.
    if max(f['height'] for f in r)>=9 or n.startswith(('summaryby','amounts','interchangecharges','totalgross','chargebacks/','adjustments/','thirdparty')):
     finish('section_boundary');result['unassignedRows'].append({'page':page['page'],'text':s,'fragmentRefs':[f['id'] for f in r]});continue
   ar=assign(r,active,page);numeric_cells=[c for c in ar['cells'] if c['rawText'] and numeric(c['rawText'])]
   if is_total and numeric_cells:
    ar['kind']='total';ar['label']=s[:s.rfind(numeric_cells[-1]['rawText'])].strip()
    active['rows'].append(ar)
    finalize_totals(active)
    is_child_rollup=bool(active['totals'][-1]['childTotalRefs'])
    if is_child_rollup or (not active['columns'][0]['printedLabel'] and norm(ar['label']).startswith('total')) or active['kind'] in ['funding','batch'] or norm(ar['label']).startswith(norm('Total '+active['title'])) or norm(ar['label'])=='total':
     active['closedByTotal']=True;finish('printed_closing_total')
    continue
   if numeric_cells:
    ar['kind']='detail'
    if not ar['cells'][-1]['rawText']:ar['status']='unresolved';ar['reasons'].append('missing_terminal_amount')
    # Every observed detail needs leading context. No unbound numeric fragments accepted.
    if not any(c['rawText'] for c in ar['cells'][:-1]):ar['status']='unresolved';ar['reasons'].append('missing_row_context')
    active['rows'].append(ar)
   else:
    # Preserve group headers; do not silently absorb possible wrapped descriptions.
    ar['kind']='group_or_wrap';ar['status']='unresolved';ar['reasons']=['text_only_row_requires_group_or_wrap_resolution'];active['rows'].append(ar)
  finish('page_end');pending_previous=last
 # Merge admitted continuation membership, keeping page-local identities intact.
 byid={t['id']:t for t in result['tables']}
 for link in result['continuations']:
  a,b=byid[link['from']],byid[link['to']]
  if link['status']=='accepted':
   b['priorMemberRows']=list(a['openMemberRows'])
   b['priorCoverageIssues']=list(a['openCoverageIssues'])
   b['priorClosedTotals']=copy.deepcopy(a['closedTotalRoots'])
   b['priorStartUnknown']=a['openStartUnknown']
   finalize_totals(b)
 for t in result['tables']:
  t['status']='accepted_rows_with_unresolved_scope' if t.get('openStart') or any(r['status']=='unresolved' and r['kind']!='group_or_wrap' for r in t['rows']) else 'structured'
 return finish_coverage(packet,result,reference,contexts,banners)

def resolve_text_rows(t,packet):
 fs={f['id']:f for p in packet['pages'] for f in p['fragments']}
 headers={ref for c in t['columns'] for ref in c['headerRefs']}
 headerfonts={fs[x]['font'] for x in headers if x in fs}
 descidx=next((i for i,c in enumerate(t['columns']) if c['printedLabel']=='Description'),0)
 for i,r in enumerate(t['rows']):
  if r['kind']!='group_or_wrap':continue
  occupied=[j for j,c in enumerate(r['cells']) if c['rawText']]
  if occupied!=[descidx]:continue
  raw=[fs[x] for x in r['fragmentRefs']]
  if t['columns'][0]['role']=='unlabelled_text':
   isgroup=all(f['font'] in headerfonts for f in raw)
  else:
   href=t['columns'][descidx]['headerRefs'];left=min(fs[x]['x'] for x in href)
   isgroup=abs(min(f['x'] for f in raw)-left)<=2
  if isgroup:
   r['kind']='printed_group_heading';r['status']='accepted';r['reasons']=['text_only_indented_or_header_font_group'];continue
  # Unique split label: next row has type/amount but no description. No guessing
  # where both neighboring rows already have descriptions or multiple candidates.
  nxt=t['rows'][i+1] if i+1<len(t['rows']) else None
  if nxt and nxt['kind']=='detail' and not nxt['cells'][descidx]['rawText'] and nxt['y']-r['y']<=max(f['height'] for f in raw)*1.5:
   nxt['cells'][descidx]=copy.deepcopy(r['cells'][descidx]);nxt['fragmentRefs']=r['fragmentRefs']+nxt['fragmentRefs'];nxt['id']='r-'+digest(nxt['fragmentRefs'])[:16]
   nxt['reasons']=[x for x in nxt['reasons'] if x!='missing_row_context'];nxt['status']='unresolved' if nxt['reasons'] else 'accepted'
   r['kind']='attached_fragment_row';r['status']='accepted';r['reasons']=['attached_to_unique_next_row'];r['logicalRowRef']=nxt['id']

def link_tables(a,b,result,page):
 reasons=[]
 if not a['openEnd']:reasons.append('predecessor_already_closed')
 if a['page']+1!=b['page']:reasons.append('nonadjacent_pages')
 if a['kind']!=b['kind'] or norm(a['title'])!=norm(b['title']):reasons.append('different_printed_scope')
 if [norm(c['printedLabel'] or '') for c in a['columns']]!=[norm(c['printedLabel'] or '') for c in b['columns']]:reasons.append('different_headers')
 if [[norm(s) for s in c.get('headerPath',[])] for c in a['columns']]!=[[norm(s) for s in c.get('headerPath',[])] for c in b['columns']]:reasons.append('different_parent_header_paths')
 if len(a['columns'])==len(b['columns']) and any(abs(x['center']-y['center'])>page['width']*.025 for x,y in zip(a['columns'],b['columns'])):reasons.append('column_alignment_changed')
 result['continuations'].append({'from':a['id'],'to':b['id'],'status':'accepted' if not reasons else 'rejected','reasons':reasons or ['adjacent_open_table_repeated_scope_and_headers'],'sourcePages':[a['page'],b['page']]})
 b['openStart']=bool(reasons) and a['openEnd'] and a['kind']==b['kind'] and norm(a['title'])==norm(b['title'])

def finalize_totals(t):
 pending=list(t.get('priorMemberRows',[]));children=copy.deepcopy(t.get('priorClosedTotals',[]));t['totals']=[];issues=list(t.get('priorCoverageIssues',[]));start_unknown=t.get('openStart',False) or t.get('priorStartUnknown',False)
 for r in t['rows']:
  if r['kind']=='group_or_wrap':issues.append(r['id'])
  if r['kind']=='detail':
   pending.append(r['id'])
   if r['status']!='accepted':issues.append(r['id'])
  if r['kind']=='total':
   members=list(pending);childrefs=[]
   if not pending and children:
    childrefs=[c['totalRowRef'] for c in children];members=[m for c in children for m in c['memberRowRefs']]
   reasons=[]
   if not members:reasons.append('no_observed_members')
   if start_unknown:reasons.append('start_scope_unresolved')
   if issues:reasons.append('member_row_unresolved')
   if r['status']!='accepted':reasons.append('total_row_unresolved')
   if childrefs and any(c['status']!='accepted_printed_run' for c in children):reasons.append('child_total_unresolved')
   if pending and children and r is t['rows'][-1] and t.get('closedByTotal'):reasons.append('mixed_child_totals_and_open_run_scope_unresolved')
   obj={'totalRowRef':r['id'],'memberRowRefs':members,'childTotalRefs':childrefs,'status':'accepted_printed_run' if not reasons else 'unresolved','reasons':reasons,'basis':'source_order_within_explicit_table_headers_not_arithmetic','financialCompleteness':'not_proven'}
   t['totals'].append(obj);children=[obj] if childrefs else children+[obj];pending=[];issues=[];start_unknown=False
 t['openMemberRows']=pending;t['openCoverageIssues']=issues;t['closedTotalRoots']=children;t['openStartUnknown']=start_unknown


def validate_saved(packet,saved,reference=None):
 """Recompute associations; hashes alone never confer admission."""
 return saved==assemble(packet,reference)

if __name__=='__main__':
 import sys
 from pathlib import Path
 packet=json.loads(Path(sys.argv[1]).read_text());reference=json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv)>3 else None;out=assemble(packet,reference);Path(sys.argv[2]).write_text(json.dumps(out,indent=2))
