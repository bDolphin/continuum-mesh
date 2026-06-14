"""
Continuum — evaluation dataset (seed snippets + labeled probes)
Location: daemon/eval/dataset.py

This is the single source of truth for the baseline eval. Edit it to reflect
YOUR real cross-tool workflow — the more it looks like how you actually use
ChatGPT/Perplexity/Cursor, the more honest your precision@k number is.

Two pieces:
  SNIPPETS — memories to store, each with a stable `key` (so probes can refer to
             them without hardcoding the random uuid the daemon assigns).
  PROBES   — a query + the keys of the snippets that SHOULD surface for it.

The "magic moment" lives in probes whose query shares NO keywords with the
relevant snippet (e.g. "keep original client address" -> the NLB note). Those
are the ones hash embeddings fail and real embeddings pass.
"""

SNIPPETS = [
    # --- networking / infra-as-code cluster (cross-tool continuity target) ---
    {
        "key": "nlb_client_ip",
        "source_app": "perplexity",
        "tags": ["aws", "networking"],
        "text": "AWS Network Load Balancer operates at layer 4 (TCP/UDP) and preserves the "
                "client source IP address, which is why it's used for low-latency, high-throughput traffic.",
    },
    {
        "key": "terraform_nlb",
        "source_app": "perplexity",
        "tags": ["terraform", "aws"],
        "text": "In Terraform, the aws_lb resource with load_balancer_type = \"network\" provisions an "
                "NLB; you attach an aws_lb_target_group and an aws_lb_listener on the desired port.",
    },
    {
        "key": "alb_vs_nlb",
        "source_app": "chatgpt",
        "tags": ["aws", "networking"],
        "text": "An Application Load Balancer works at layer 7 and can route on HTTP paths and hosts, "
                "while a Network Load Balancer is layer 4 and is chosen for raw TCP performance and static IPs.",
    },
    # --- python / async cluster ---
    {
        "key": "fastapi_async",
        "source_app": "chatgpt",
        "tags": ["python", "fastapi"],
        "text": "FastAPI endpoints declared with async def run on the event loop; blocking calls inside "
                "them should be offloaded with run_in_threadpool or they stall concurrency.",
    },
    {
        "key": "sqlite_threads",
        "source_app": "cursor",
        "tags": ["python", "sqlite"],
        "text": "SQLite connections in Python are not safe to share across threads unless you pass "
                "check_same_thread=False and serialize writes, otherwise you hit 'objects created in a thread' errors.",
    },
    # --- embeddings / retrieval cluster ---
    {
        "key": "cosine_norm",
        "source_app": "perplexity",
        "tags": ["ml", "retrieval"],
        "text": "Cosine similarity ignores vector magnitude and compares direction, so normalizing "
                "embeddings to unit length makes dot product equal to cosine and speeds up nearest-neighbor search.",
    },
    {
        "key": "minilm_dims",
        "source_app": "chatgpt",
        "tags": ["ml", "embeddings"],
        "text": "The sentence-transformers all-MiniLM-L6-v2 model outputs 384-dimensional embeddings and is "
                "a common fast default for local semantic search.",
    },
    # --- distractors (should NOT match the technical probes) ---
    {
        "key": "sourdough",
        "source_app": "perplexity",
        "tags": ["cooking"],
        "text": "A healthy sourdough starter is kept at 100% hydration and the dough is usually cold-proofed "
                "in the fridge overnight before baking.",
    },
    {
        "key": "trajan",
        "source_app": "perplexity",
        "tags": ["history"],
        "text": "The Roman Empire reached its greatest territorial extent under the emperor Trajan in 117 AD.",
    },
    {
        "key": "pomodoro",
        "source_app": "chatgpt",
        "tags": ["productivity"],
        "text": "The Pomodoro technique breaks work into 25-minute focused intervals separated by short breaks "
                "to sustain concentration.",
    },
]

# query -> keys that SHOULD be in the top-k. Note the deliberate vocabulary gaps.
PROBES = [
    {
        "query": "how do I keep the original client address on a layer 4 load balancer in my infra as code",
        "relevant_keys": ["nlb_client_ip", "terraform_nlb"],
    },
    {
        "query": "difference between routing on URL paths versus raw TCP at the load balancer",
        "relevant_keys": ["alb_vs_nlb"],
    },
    {
        "query": "my async web handler blocks other requests when I do heavy work",
        "relevant_keys": ["fastapi_async"],
    },
    {
        "query": "database connection error about objects created in a different thread",
        "relevant_keys": ["sqlite_threads"],
    },
    {
        "query": "why normalize vectors before nearest neighbor search",
        "relevant_keys": ["cosine_norm"],
    },
    {
        "query": "what size are the vectors from the small local embedding model",
        "relevant_keys": ["minilm_dims"],
    },
]
