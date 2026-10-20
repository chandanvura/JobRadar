"""Offline regression coverage for nested Workday location facets."""
from scraper.adapters import workday_country_facets, workday_city_facets


def test_nested_airbus_shape_children_and_facet_values():
    # Sanitized representative structure. IDs are fictional.
    facets=[{"facetParameter":"locationMainGroup","facetValues":[
        {"descriptor":"Geographies","children":[
            {"facetParameter":"locationCountry","values":[
                {"descriptor":"India","id":"india-facet"},
                {"descriptor":"Germany","id":"germany-facet"}]}]}]}]
    assert workday_country_facets(facets,"India")=={"locationCountry":["india-facet"]}
    assert workday_country_facets(facets,"Germany")=={"locationCountry":["germany-facet"]}
    assert workday_country_facets(facets,"Brazil")=={}
    assert workday_city_facets(facets)=={"locationCountry":["india-facet"]}


def test_flat_facets_and_duplicate_ids():
    facets=[{"facetParameter":"locationCountry","values":[
        {"descriptor":"India","id":"in1"},{"descriptor":"India","id":"in1"}]},
        {"facetParameter":"locationCountry","values":[{"descriptor":"India","id":"in2"}]}]
    assert workday_country_facets(facets,"India")=={"locationCountry":["in1","in2"]}


def test_fallback_city_uses_published_ids_only():
    facets=[{"facetParameter":"group","children":[{"facetParameter":"locations","values":[
        {"id":"blr","descriptor":"Bengaluru, India"},
        {"id":"london","descriptor":"London, United Kingdom"},
        {"id":"blr","descriptor":"Bengaluru, India"}]}]}]
    assert workday_country_facets(facets,"India")=={"locations":["blr"]}
    assert workday_city_facets(facets)=={"locations":["blr"]}


def test_cycle_and_malformed_nodes_fail_safe():
    cyclic={"facetParameter":"group"}
    cyclic["children"]=[cyclic,{"facetParameter":"locationCountry","values":[
        None,"invalid",{"descriptor":"India","id":"safe"}]}]
    nodes=[None,False,"str",{"facetValues":None},cyclic]
    assert workday_country_facets(nodes,"India")=={"locationCountry":["safe"]}
    assert workday_country_facets(nodes,"") == {}
    assert workday_city_facets([{"facetParameter":"locations","values":[None,"bad"]}])=={}


def test_depth_limit_and_tuple_shapes():
    nested={"facetParameter":"locationCountry","values":[{"id":"in","descriptor":"India"}]}
    for _ in range(15):
        nested={"children":[nested]}
    assert workday_country_facets([nested],"India")=={}
    assert workday_country_facets(({"facetParameter":"locationCountry",
        "values":({"id":"in","descriptor":"India"},)},),"India")=={"locationCountry":["in"]}
