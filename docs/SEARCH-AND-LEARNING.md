# Search and local preference learning

JobRadar combines weighted BM25 title/company/skill/description retrieval with a small related-concept retriever. Weighted reciprocal rank fusion combines ranks rather than incompatible numeric scores. Literal retrieval has weight 1; the related queries share a total weight of 0.35. Quoted phrases disable expansion. Each alternate query preserves the user's other terms, such as employer and city. This is curated concept retrieval, not a transformer embedding model.

Examples: `HPE cloud developer` can also retrieve an HPE Cloud Engineer, with literal matches receiving the stronger vote. `HPE infrastructure as code` can retrieve Terraform/CloudFormation requirements without that exact phrase. An employer with no matching records still returns no results. Search cannot manufacture jobs missing from an employer feed.

The personal ranking model is real regularized logistic regression trained in the browser from that profile's existing tracking records. Saved/Applied/Interview/Offer are positive preference signals; Ignored is negative; Rejected and Viewed are excluded. Duplicate application URLs count once. Training uses at most 500 current records, 80 deterministic full-batch gradient updates, balanced classes and L2 regularization. Four normalized match features, role-family indicators and 32 hashed skill features keep the model small with no added runtime dependency, model download, external request, paid inference or database write.

The model activates only with at least 12 distinct labels and at least four from each class. Until then the existing bounded role feedback applies. Its adjustment is limited to ±5 priority points. It does not replace the original match score, alter job eligibility, infer credentials, or predict hiring success. The preference signal is uncalibrated; do not display it as an interview probability. Changing preferences or tracking retrains from the current records. Profile storage and learning remain browser-local.

## Validation and limits

Held-out synthetic tests check generalization to unseen job titles, deterministic results, bounded influence, duplicate resistance, contradictory Saved/Ignored choices, cold start, rejection exclusion and unchanged eligibility gates. Retrieval fixtures check related roles, literal-first ordering, employer constraints, quotation and requirements search. These establish functional behavior, not real-world relevance uplift: no human-labeled production benchmark or A/B result is available yet. A transformer bi-encoder/cross-encoder needs its own latency, download-size, privacy and held-out ranking evaluation before replacing this lightweight implementation.

Official references consulted on 8 October 2026:

- Reciprocal rank fusion: https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion
- Logistic learning with gradients and regularization: https://scikit-learn.org/stable/modules/sgd.html
- Retrieval then reranking: https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html
- MiniLM model card (researched, not installed or deployed): https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
