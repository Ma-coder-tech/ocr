"""Source coverage and printed continuation admission. No financial semantics.

The source inventory is a separately retained reference, not a self-attestation
in a possibly modified packet. The caller must verify it against original bytes
and an independent native export. It cannot establish content absent from that
export; complete status is expressly relative to that evidence boundary.
"""
import copy
import re
import statistics


def source_inventory(packet):
    from structure import digest
    return {'schema': 'native-source-inventory-v1', 'sourceSha256': packet['sourceSha256'],
            'pages': [{'page': p['page'], 'fingerprint': digest(p), 'fragmentCount': len(p['fragments'])} for p in packet['pages']]}


def source_context(packet):
    from structure import lines, words, norm, line_y, numeric
    refs, banners = {}, set()
    for p in packet['pages']:
        rows = lines(p)
        for i, row in enumerate(rows):
            if not norm(words(row)).startswith('fees'): continue
            prefix=[]
            for f in row:
                prefix.append(f)
                if norm(words(prefix))=='fees':break
            if norm(words(prefix))!='fees':continue
            for f in prefix:refs[f['id']]='section_banner';banners.add(f['id'])
            left=min(f['x'] for f in prefix); y=min(f['y'] for f in prefix)
            nearby=[f for r in rows[max(0,i-1):i+2] for f in r]
            prose=[f for f in nearby if len(f['text'])>45 and f['x']>left+20 and abs(f['y']-y)<12]
            if len(prose)!=1:continue
            first=prose[0]
            for f in prefix:refs[f['id']]='section_banner';banners.add(f['id'])
            refs[first['id']]='banner_paragraph'
            end_y=first['y']; text=first['text']
            candidates=sorted([r for r in rows[max(0,i-1):i+4] if any(f['y']>end_y for f in r)],key=line_y)
            for nxt in candidates:
                if text.rstrip().endswith(('.',':')):break
                rest=[f for f in nxt if f['id'] not in refs]
                if not rest:continue
                if len(rest)!=1:break
                f=rest[0]
                if f['y']-end_y>first['height']*1.8 or f['x']<left-2 or f['font']!=first['font'] or numeric(f['text']):break
                refs[f['id']]='banner_paragraph';end_y=f['y'];text=f['text']

    return refs, banners


def page_identity(page):
    from structure import lines, words, norm
    top = [r for r in lines(page) if min(f['y'] for f in r) < page['height']*.16]
    identity, numbered = {}, None
    for row in top:
        text = words(row)
        m = re.search(r'Page\s+(\d+)\s+of\s+(\d+)', text, re.I)
        if m: numbered = tuple(map(int, m.groups()))
        for key in ('merchantnumber', 'statementperiod'):
            n = norm(text)
            if key in n:
                value=n.split(key,1)[1]
                value=re.split(r'page\d+of\d+|website|customerservice|merchantnumber|statementperiod',value)[0]
                if value:
                    if key in identity:identity['ambiguous']=True
                    identity[key]=value
    return identity, numbered


def row_label(row):
    # Printed textual cells only, rather than a label containing numeric totals.
    from structure import numeric
    return ' '.join(c['rawText'] for c in row['cells'] if c['rawText'] and not numeric(c['rawText'])).strip()


def matching_closure(table, row):
    from structure import norm
    label = norm(row_label(row)); title = norm(table['title'])
    return label == 'total'+title or label == 'total'+title+'fees'


def finish_coverage(packet, out, reference, contexts, banners):
    from structure import digest, norm, lines, words, line_y, numeric, finalize_totals, center
    out['schema'] = 'printed-coverage-v1'
    out['sourceInventoryStatus'] = 'matched' if reference is not None and source_inventory(packet) == reference else 'missing' if reference is None else 'mismatch'
    out['completenessBoundary'] = 'supported_printed_scope_relative_to_independently_retained_native_export'
    out['extractionCompleteness'] = 'not_proven_beyond_native_export'
    pages = {p['page']: p for p in packet['pages']}
    fs = {f['id']: f for p in packet['pages'] for f in p['fragments']}
    tables = {t['id']: t for t in out['tables']}
    links = out['continuations']

    # Exactly one primary ledger entry for every source fragment. Cross-page
    # header references remain secondary references to their original entries.
    ledger = {ref: {'fragmentRef': ref, 'page': p['page'], 'classification': 'unassigned', 'reason': 'not_in_supported_table'}
              for p in packet['pages'] for ref in [f['id'] for f in p['fragments']]}
    for ref, reason in contexts.items(): ledger[ref].update(classification='context', reason=reason)
    for p in packet['pages']:
        for row in lines(p):
            text = norm(words(row)); y = line_y(row)
            # Metadata must be identified, not silently discarded just because
            # a fragment sits near an edge or repeats on another page.
            meta = (y < p['height']*.14 and any(k in text for k in ['merchantnumber','customerservice','statementperiod','yourcardprocessingstatement','website','phone','page']))
            postal = y > p['height']*.91 and not re.search(r'\d[,.]\d{2}\b|[$£€]',words(row)) and (text.replace('.','').startswith('pobox') or bool(re.search(r'\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b',words(row))))
            printer = y > p['height']*.95 and bool(re.fullmatch(r'([a-zA-Z])\1{3,}\s+[\d\s]+[a-zA-Z]?',words(row)))
            if meta or postal or printer:
                for f in row: ledger[f['id']].update(classification='page_furniture', reason='printed_metadata' if meta else 'postal_footer' if postal else 'printer_control_footer')
    for t in out['tables']:
        rows = lines(pages[t['page']])
        for i in t['headerRows']:
            for f in rows[i]: ledger[f['id']].update(classification='table_header', tableRef=t['id'], reason='explicit_header_region')
        for ref in t.get('titleRefs', []):
            if ledger[ref]['classification'] == 'unassigned': ledger[ref].update(classification='table_header', tableRef=t['id'], reason='printed_title')
        for r in t['rows']:
            if r['kind'] == 'attached_fragment_row': continue
            for ref in r['fragmentRefs']:
                previous = ledger[ref]
                if previous['classification'] == 'table_row' and previous.get('rowRef') != r['id']:
                    previous.update(classification='conflict', reason='multiple_logical_row_owners')
                else: previous.update(classification='table_row', tableRef=t['id'], rowRef=r['id'], reason=r['kind'])

    for t in out['tables']:
        p = pages[t['page']]; rows = t['rows']; source_rows = lines(p)
        start = min((line_y(source_rows[i]) for i in t['headerRows']), default=min((r['y'] for r in rows), default=0))
        end = max((r['y']+max(fs[x]['height'] for x in r['fragmentRefs']) for r in rows), default=start)
        if t['openEnd']: end = p['height']
        # Include the corridor from a continuation's banner to its first row.
        if t['headerMode']=='inherited_proposal':
            candidates = [fs[x]['y'] for x in banners if ledger[x]['page']==t['page'] and fs[x]['y'] <= start]
            start = min(candidates, default=start)
        unexplained = [ref for ref, item in ledger.items() if item['page']==t['page'] and start <= fs[ref]['y'] <= end and item['classification'] in ('unassigned','conflict')]
        t['coverage'] = {'startY':start, 'endY':end, 'unexplainedFragmentRefs':unexplained,
                         'boundary': 'explicit_header' if t['headerMode']!='inherited_proposal' else 'inherited_candidate'}

    # Evaluate a complete candidate chain together, including its named end.
    # Geometry alone never admits a headerless join.
    incoming = {c['to']:c for c in links if c['status']=='accepted' or 'no_repeated_column_headers' in c['reasons']}
    outgoing = {c['from']:c for c in incoming.values()}
    for link in links:
        if 'no_repeated_column_headers' not in link['reasons']: continue
        a, b = tables[link['from']], tables[link['to']]
        chain = [b]; root = a; seen = {b['id']}
        while root['id'] in incoming and incoming[root['id']]['from'] not in seen:
            seen.add(root['id']); root = tables[incoming[root['id']]['from']]
        last = b
        while last['id'] in outgoing and outgoing[last['id']]['to'] not in seen:
            seen.add(last['id']); last = tables[outgoing[last['id']]['to']]; chain.append(last)
        reasons=[]; pa,pb=pages[a['page']],pages[b['page']]
        ia,na=page_identity(pa); ib,nb=page_identity(pb)
        if out['sourceInventoryStatus']!='matched': reasons.append('source_inventory_unverified')
        if a['page']+1!=b['page']: reasons.append('nonadjacent_source_pages')
        if not na or not nb or nb!=(na[0]+1,na[1]): reasons.append('printed_pagination_not_consecutive')
        if not ia or set(ia)!= {'merchantnumber','statementperiod'} or ia!=ib: reasons.append('statement_identity_unverified_or_changed')
        if abs(pa['width']-pb['width'])>1 or abs(pa['height']-pb['height'])>1: reasons.append('page_geometry_changed')
        if not a['openEnd']: reasons.append('predecessor_closed')
        if root['headerMode']=='inherited_proposal': reasons.append('no_explicit_chain_start')
        totals=[r for r in last['rows'] if r['kind']=='total']
        if not totals or not last['closedByTotal'] or not matching_closure(root,totals[-1]): reasons.append('matching_named_end_not_observed')
        if root['kind']!='fees' or len(root['columns'])!=3: reasons.append('headerless_schema_not_supported')
        details=[r for t in chain for r in t['rows'] if r['kind']=='detail']
        prior=[r for r in root['rows'] if r['kind']=='detail' and r['status']=='accepted']
        if not details or not prior: reasons.append('no_aligned_detail_evidence')
        if any(t['coverage']['unexplainedFragmentRefs'] for t in [a]+chain): reasons.append('unexplained_continuation_material')
        metadata_end=max((fs[ref]['y']+fs[ref]['height'] for ref,item in ledger.items() if item['page']==b['page'] and item['classification']=='page_furniture' and fs[ref]['y']<pb['height']*.2),default=0)
        if any(item['page']==b['page'] and item['classification']=='unassigned' and metadata_end+2<fs[ref]['y']<b['coverage']['startY'] for ref,item in ledger.items()):reasons.append('unexplained_material_before_continuation')
        if any(r['status']!='accepted' for t in chain for r in t['rows']): reasons.append('ambiguous_continuation_row')
        if len(root['columns'])==3 and prior:
            right=statistics.median(max(fs[x]['x']+fs[x]['width'] for x in r['cells'][-1]['fragmentRefs']) for r in prior)
            desc_left=min(fs[x]['x'] for r in prior for x in r['cells'][0]['fragmentRefs'])
            def type_edge(r,mode):
                values=[fs[x] for x in r['cells'][1]['fragmentRefs']]
                return min(f['x'] for f in values) if mode=='left' else max(f['x']+f['width'] for f in values) if mode=='right' else statistics.mean(center(f) for f in values)
            typed=[r for r in details if r['cells'][1]['fragmentRefs']]
            modes=[]
            for mode in ['left','center','right']:
                edges=[type_edge(r,mode) for r in prior if r['cells'][1]['fragmentRefs']]
                if edges and max(edges)-min(edges)<=3 and all(abs(type_edge(r,mode)-statistics.median(edges))<=3 for r in typed):modes.append(mode)
            if not modes:reasons.append('inherited_type_alignment_failed')
            for t in chain:
                for r in t['rows']:
                    if r['kind']=='detail':
                        if not all(c['rawText'] for c in r['cells']): reasons.append('missing_printed_role');continue
                        amounts=[fs[x] for x in r['cells'][-1]['fragmentRefs']]
                        types=[fs[x] for x in r['cells'][1]['fragmentRefs']]
                        if abs(max(f['x']+f['width'] for f in amounts)-right)>3: reasons.append('inherited_column_alignment_failed')
                        if numeric(r['cells'][1]['rawText']): reasons.append('numeric_value_in_type_column')
                    if r['kind']=='printed_group_heading' and (min(fs[x]['x'] for x in r['fragmentRefs']) < desc_left-24 or norm(row_label(r)).endswith('fees')):
                        reasons.append('intervening_section_heading')
        # Anything between the last predecessor row and its page end is already
        # covered above. Also require that this is the first table on next page.
        if any(t['page']==b['page'] and t['coverage']['startY']<b['coverage']['startY'] for t in out['tables'] if t['id']!=b['id']): reasons.append('intervening_table')
        link.update(status='accepted' if not reasons else 'unresolved', reasons=sorted(set(reasons)) or ['consecutive_identity_bound_pages_aligned_roles_named_end_and_covered_corridor'],
                    evidence={'rootTableRef':root['id'],'closingTableRef':last['id'],'printedPages':[na,nb], 'identityMatched':ia==ib and bool(ia)})

    # Rebuild membership from scratch in source order after admitting joins.
    for t in out['tables']:
        for key in ['priorMemberRows','priorCoverageIssues','priorClosedTotals','priorStartUnknown']:t.pop(key,None)
        inbound=next((c for c in links if c['to']==t['id'] and c['status']=='accepted'),None)
        if inbound:
            a=tables[inbound['from']];t['openStart']=False
            t['priorMemberRows']=list(a['openMemberRows']);t['priorCoverageIssues']=list(a['openCoverageIssues'])
            t['priorClosedTotals']=copy.deepcopy(a['closedTotalRoots']);t['priorStartUnknown']=a['openStartUnknown']
        finalize_totals(t)
        lineage=(tables[inbound['from']].get('lineage',[])+[inbound['from']]) if inbound else []
        t['lineage']=lineage
        component=[tables[x] for x in lineage]+[t]
        problems=[]
        if out['sourceInventoryStatus']!='matched':problems.append('source_inventory_unverified')
        for left,right in zip(component,component[1:]):
            ia,na=page_identity(pages[left['page']]);ib,nb=page_identity(pages[right['page']])
            if set(ia)!={'merchantnumber','statementperiod'} or ia!=ib or not na or not nb or nb!=(na[0]+1,na[1]):
                problems.append('cross_page_identity_or_pagination_unverified')
        if any(x['openStart'] for x in component) or t.get('priorStartUnknown') or (t['headerMode']=='inherited_proposal' and not inbound):problems.append('start_scope_unresolved')
        if any(x['coverage']['unexplainedFragmentRefs'] for x in component):problems.append('unexplained_source_material')
        if any(r['status']!='accepted' for x in component for r in x['rows']):problems.append('unresolved_row')
        if t['closedByTotal'] and t['kind']=='fees' and len(t['columns'])==3:
            closes=[r for r in t['rows'] if r['kind']=='total']
            if not closes or not matching_closure(t,closes[-1]):problems.append('closing_title_mismatch')
        if any(total['status']!='accepted_printed_run' for total in t['totals']):problems.append('total_membership_unresolved')
        # A repeated explicit header is not proof of a fresh start when a prior
        # page has unexplained rows fitting this same grid.
        if not inbound and t['kind']=='fees' and len(t['columns'])==3 and t['page']-1 in pages:
            from structure import assign, money
            previous=pages[t['page']-1]
            for row in lines(previous):
                if not all(ledger[f['id']]['classification']=='unassigned' for f in row):continue
                candidate=assign(row,t,previous)
                cells=candidate['cells']
                if candidate['status']=='accepted' and all(c['rawText'] for c in cells) and not numeric(cells[1]['rawText']) and money(cells[-1]['rawText']):
                    problems.append('unassigned_compatible_predecessor');break
        t['coverage']['issues']=problems
        t['coverage']['membershipStatus']='complete' if not problems and t['closedByTotal'] else 'partial' if not t['closedByTotal'] else 'unresolved'
        for total in t['totals']:
            total['printedMembershipStatus']='complete' if not problems and total['status']=='accepted_printed_run' else 'unresolved'
            total['coverageReasons']=problems+total['reasons']
        # An earlier page is a segment, not a complete table by itself.
        t['coverage']['scopePages']=[tables[x]['page'] for x in lineage]+[t['page']]
    out['coverageLedger']=list(ledger.values())
    out['sourceAccounting']={'inputFragments':len(fs),'ledgerEntries':len(ledger),'unassignedFragments':sum(x['classification']=='unassigned' for x in ledger.values()),
                             'wholeDocumentUnderstood':False}
    out.pop('resultFingerprint',None);out['resultFingerprint']=digest(out)
    return out
