"""Reconcile disjoint employer-published categories before complete collection."""
import asyncio
from .snapshot import SnapshotChanged


async def category_postings(client,api,initial,request):
    total=initial.get('total')
    if type(total) is not int or not 0<=total<=2000:
        raise ValueError('Workday category inventory has no bounded global count')
    groups=next((f.get('values',[]) for f in initial.get('facets',[]) if f.get('facetParameter')=='jobFamilyGroup'),[])
    if (not groups or any(not isinstance(g,dict) or not g.get('id') or type(g.get('count')) is not int or g['count']<0 for g in groups)
            or len({g['id'] for g in groups})!=len(groups) or sum(g['count'] for g in groups)!=total):
        raise ValueError('Workday published categories do not partition the global inventory')
    sem=asyncio.Semaphore(3)
    async def collect(group):
        async with sem:
            rows=[];first=None;count=group['count']
            async def page(offset):
                response=await request(client,'POST',api+'/jobs',json={'appliedFacets':{'jobFamilyGroup':[group['id']]},'limit':20,'offset':offset,'searchText':''})
                response.raise_for_status();return response.json()
            for offset in range(0,count,20):
                payload=await page(offset);batch=payload.get('jobPostings')
                if (payload.get('total') not in ((count,) if offset==0 else (0,count)) or not isinstance(batch,list)
                        or len(batch)!=min(20,count-offset)):
                    raise SnapshotChanged('Workday category count or page changed')
                paths=[item.get('externalPath','') for item in batch]
                if any(not isinstance(path,str) or not path.startswith('/job/') for path in paths):
                    raise ValueError('Workday category page has missing or malformed IDs')
                if len(set(paths))!=len(paths):
                    # No records from this attempt may be accepted. A valid-shaped
                    # repeated page can be transient, like cross-page overlap;
                    # the caller allows at most one whole-source restart.
                    raise SnapshotChanged(f'Workday category page repeated IDs: category={group["id"]}, offset={offset}, rows={len(paths)}, unique={len(set(paths))}')
                if first is None:first=paths
                rows.extend(batch)
            if count:
                check=await page(0)
                if check.get('total')!=count or [item.get('externalPath') for item in check.get('jobPostings',[])]!=first:
                    raise SnapshotChanged('Workday category changed during collection')
            return rows
    tasks=[asyncio.create_task(collect(group)) for group in groups]
    try:
        batches=await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
    rows=[item for batch in batches for item in batch]
    paths=[row.get('externalPath') for row in rows]
    if len(rows)!=total or len(set(paths))!=total:
        raise SnapshotChanged('Workday categories overlap or omit global job IDs')
    return rows,total
