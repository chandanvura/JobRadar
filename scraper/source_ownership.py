"""Board attribution is evidence of publisher, not a subsidiary hiring team."""
from urllib.parse import urlparse


def correct_board_owner(job):
    url = urlparse(job.application_url)
    if job.company == 'Juniper Networks' and url.hostname == 'hpe.wd5.myworkdayjobs.com' and '/jobsathpe/job/' in url.path.lower():
        job.company = 'HPE'
        job.career_page_url = 'https://hpe.wd5.myworkdayjobs.com/Jobsathpe'
    return job
