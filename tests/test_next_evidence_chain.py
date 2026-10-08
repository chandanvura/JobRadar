from scripts.ats_next_probe import chain_to_board


def test_published_chain_can_end_at_a_real_job_apply_link_and_redirect():
    pages=[{'url':'https://official.test/','links':['https://official.test/careers/']},
           {'url':'https://official.test/careers/','final_url':'https://careers.official.test/','links':['https://jobs.wd1.myworkdayjobs.com/en-US/External/job/City/Role_R1/apply']},
           {'url':'https://jobs.wd1.myworkdayjobs.com/en-US/External/job/City/Role_R1/apply','final_url':'https://jobs.wd1.myworkdayjobs.com/External/job/City/Role_R1/apply','links':[]}]
    assert chain_to_board(pages,'https://official.test/','https://jobs.wd1.myworkdayjobs.com/External')


def test_unrelated_or_unlinked_board_does_not_pass_and_cycles_terminate():
    pages=[{'url':'https://official.test/','links':['https://official.test/careers','https://other.wd1.myworkdayjobs.com/External']},
           {'url':'https://official.test/careers','links':['https://official.test/']},
           {'url':'https://jobs.wd1.myworkdayjobs.com/External','links':[]}]
    assert chain_to_board(pages,'https://official.test/','https://jobs.wd1.myworkdayjobs.com/External') is None
