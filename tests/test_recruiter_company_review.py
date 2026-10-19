from scripts.recruiter_company_review import registry_match, compare

REGISTRY=[{'company_name':name,'careers_url':url,'ats_provider':'test'} for name,url in
          [('Apollo','https://apollo.example/careers'),('HP','https://hp.example/careers'),
           ('IBM','https://ibm.example/careers'),('Accenture','https://accenture.example/careers')]]


def test_meaningful_brand_words_cannot_be_silently_removed():
    for name in ['Apollo Microsystems (Habsiguda)','HP GlobalSoft Limited','Aruba Networks an HP Company']:
        assert registry_match(name,REGISTRY)==(None,'NONE')


def test_title_and_legal_aliases_are_only_suggestions():
    for name,canonical in [('Manager IBM','IBM'),('Accenture Services Pvt Ltd (Bangalore)','Accenture')]:
        row,kind=registry_match(name,REGISTRY)
        assert row['company_name']==canonical and kind=='ALIAS_CANDIDATE'
    assert registry_match('IBM',REGISTRY)[1]=='EXACT'


def test_comparison_preserves_lineage_and_never_approves_recruiters_or_alerts():
    source=[{'company_key':'ibm','company_name':'IBM','source_rows':'R0001;R0002','source_count':'2'},
            {'company_key':'data','company_name':'Data','source_rows':'R0003','source_count':'1'}]
    result=compare(source,REGISTRY)
    assert len(result)==2 and result[0]['source_rows']=='R0001;R0002'
    assert [r['verification_status'] for r in result]==['UNVERIFIED','REJECTED']
    assert all(r['automatic_alert_eligible']=='false' and r['recruiter_identity_status']=='UNVERIFIED' for r in result)
