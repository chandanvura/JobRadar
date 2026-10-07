import pytest
from scraper.public_career_json import records


def atlassian():
    return dict(id=123,portalId=17,portalJobPost=dict(id=123,portalId=17,portalUrl='https://globalcareers-atlassian.icims.com/jobs/123/engineer/job'),title='Engineer',locations=['Bengaluru - India','Remote - India'],overview='About role',qualifications='<p>Python requirements</p>',responsibilities='Build software')


@pytest.mark.parametrize('failure',[None,'duplicate','employer','identity','requirements'])
def test_full_atlassian_array_integrity(failure):
    row=atlassian();payload=[row]
    if failure=='duplicate':payload.append(row)
    if failure=='employer':row['portalJobPost']['portalUrl']='https://unrelated.test/jobs/123/engineer/job'
    if failure=='identity':row['portalJobPost']['id']=124
    if failure=='requirements':row.update(overview='',qualifications='',responsibilities='')
    if failure:
        with pytest.raises(ValueError):records(payload,'atlassian')
    else:
        jobs=records(payload,'atlassian');assert len(jobs)==1 and 'Python requirements' in jobs['123']['description'] and 'Remote - India' in jobs['123']['location']


def avalara():
    return dict(permalink='avalara',isSandbox=False,includeJdOnPage=True,employerProfile=dict(name='Avalara',emailDomain='avalara.com'),jobs=[dict(permalink='abc',title='Engineer',status='public',content='&lt;p&gt;Python &amp;amp; SQL requirements&lt;/p&gt;',location='Pune, India',offices=[dict(name='Remote, India')],jobBoard=dict(permalink='avalara',isSandbox=False),publicUrl='https://app.careerpuck.com/job-board/avalara/job/2026-123',applyUrl='https://careersnoa-avalara.icims.com/jobs/123/job')])


@pytest.mark.parametrize('failure',[None,'duplicate','sandbox','employer','detail_board','requirements'])
def test_full_careerpuck_array_and_decoded_requirements(failure):
    p=avalara()
    if failure=='duplicate':p['jobs'].append(p['jobs'][0])
    if failure=='sandbox':p['isSandbox']=True
    if failure=='employer':p['employerProfile']['emailDomain']='other.test'
    if failure=='detail_board':p['jobs'][0]['jobBoard']['permalink']='other'
    if failure=='requirements':p['jobs'][0]['content']=''
    if failure:
        with pytest.raises(ValueError):records(p,'avalara')
    else:
        row=records(p,'avalara')['abc'];assert row['description']=='Python & SQL requirements' and 'Remote, India' in row['location']
