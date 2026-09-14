import concurrent.futures,csv,json,re,urllib.parse,urllib.request,urllib.robotparser
from bs4 import BeautifulSoup
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
UA='JobRadarSourceReview/1.0'
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':UA});r=urllib.request.urlopen(req,timeout=18)
 return r.read(1500000).decode('utf8','replace'),r.url

def allowed(url):
 parsed=urllib.parse.urlsplit(url)
 if parsed.scheme!='https':return False
 robot=urllib.parse.urlunsplit((parsed.scheme,parsed.netloc,'/robots.txt','',''))
 try:
  body,_=get(robot);rp=urllib.robotparser.RobotFileParser();rp.parse(body.splitlines());return rp.can_fetch(UA,url)
 except urllib.error.HTTPError as e:return e.code==404
 except Exception:return False

def review(x):
 out={'name':x['name'],'city_evidence':x['url'],'directory_location':x['all_locations'],'website':x['website'],'status':'unverified','reviewed_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).date().isoformat()}
 try:
  site=x['website'].replace('http://','https://',1)
  if not allowed(site):out['status']='access_not_confirmed';return out
  html,site=get(site);soup=BeautifulSoup(html,'html.parser')
  links=[urllib.parse.urljoin(site,a['href']) for a in soup.select('a[href]') if re.search(r'careers?|join (?:our|the) team|we.re hiring|jobs',a.get_text(' ',strip=True),re.I)]
  links=list(dict.fromkeys(u for u in links if u.startswith('https://') and not re.search(r'linkedin|indeed|naukri|instahyre|mailto:',u)))
  if not links:out['status']='no_official_career_link';return out
  career=links[0]
  if not allowed(career):out['status']='career_access_not_confirmed';out['careers_url']=career;return out
  text,career=get(career)
  if not re.search(r'careers?|open positions|open roles|jobs|hiring|join',BeautifulSoup(text,'html.parser').get_text(' ',strip=True),re.I):return out
  # Confirm directory location against its original investor profile.
  if not allowed(x['url']):out['status']='location_access_not_confirmed';return out
  yc,_=get(x['url'])
  if not re.search(r'bengaluru|bangalore|hyderabad',yc,re.I):out['status']='location_unconfirmed';return out
  provider,identifier='custom',''
  for pat,kind in [(r'(?:boards|job-boards)\.greenhouse\.io/([^/?#]+)','greenhouse'),(r'jobs\.lever\.co/([^/?#]+)','lever'),(r'jobs\.ashbyhq\.com/([^/?#]+)','ashby')]:
   m=re.search(pat,career)
   if m:provider,identifier=kind,m[1];break
  out.update(status='verified_career_page',careers_url=career,ats_provider=provider,ats_identifier=identifier)
 except Exception as e:out['status']=type(e).__name__
 return out
import argparse
parser=argparse.ArgumentParser(description='Review candidate websites and city evidence. Never auto-enables sources.')
parser.add_argument('candidates', help='JSON array: name, website, all_locations, url (primary city evidence)')
parser.add_argument('--output', default='companies/source-review.json')
args=parser.parse_args()
xs=json.load(open(args.candidates))
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for out in pool.map(review,xs):
  results.append(out); print(out['name'],out['status'],flush=True)
  (ROOT/args.output).write_text(json.dumps(results,indent=2)+'\n')
print('VERIFIED',sum(x['status']=='verified_career_page' for x in results),flush=True)
