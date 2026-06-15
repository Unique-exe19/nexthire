"""
job_description.py
------------------
Structured constants derived from the Redrob Senior AI/ML Engineer JD.
All keyword lists, weights, and disqualifier rules live here so
the ranker stays clean and tunable.
"""

# ── Job Summary ────────────────────────────────────────────────────────────────
JD_TITLE = "Senior AI/ML Engineer"
JD_COMPANY = "Redrob"
JD_SENIORITY_YEARS = (5, 9)          # sweet-spot range
JD_PREFERRED_LOCATIONS = {
    "pune", "noida", "hyderabad", "mumbai", "delhi", "ncr", "delhi ncr",
    "bengaluru", "bangalore", "gurgaon", "gurugram",
}
JD_PREFERRED_COUNTRIES = {"india"}

# ── Full JD text for TF-IDF vectorization ──────────────────────────────────────
JD_TEXT = """
Senior AI ML Engineer Redrob product company retrieval ranking intelligence layer.
Own intelligence layer Redrob product ranking retrieval matching systems recruiters search candidates.
Embeddings retrieval systems sentence-transformers BGE E5 OpenAI embeddings production deployment.
Vector databases hybrid search Pinecone Weaviate Qdrant Milvus FAISS OpenSearch Elasticsearch.
Strong Python code quality production deployed real users.
Evaluation frameworks ranking systems NDCG MRR MAP offline A/B testing.
LLM fine-tuning LoRA QLoRA PEFT learning-to-rank XGBoost neural ranking.
NLP information retrieval semantic search candidate job matching.
Applied ML AI roles product companies not services consulting.
Shipped end-to-end ranking search recommendation system real users meaningful scale.
Hybrid retrieval dense sparse BM25 evaluation offline online correlation.
Mentoring growing teams architecture candidate JD matching scale.
Noida Pune Hyderabad Mumbai Delhi NCR India location preferred.
RAG pipeline vector search embeddings inference optimization distributed systems.
Reranking semantic similarity cosine distance approximate nearest neighbor ANN.
Production ML systems embedding drift index refresh retrieval quality regression.
"""

# ── Must-Have Skill Keywords (high weight) ────────────────────────────────────
MUST_HAVE_SKILLS = {
    # Embeddings & retrieval
    "embeddings", "vector search", "sentence-transformers", "sentence transformers",
    "bge", "e5", "dense retrieval", "semantic search", "approximate nearest neighbor",
    "ann", "faiss", "hnsw",
    # Vector DBs
    "pinecone", "weaviate", "qdrant", "milvus", "elasticsearch", "opensearch",
    "vector database", "vector db", "hybrid search",
    # NLP / IR
    "nlp", "natural language processing", "information retrieval",
    "ranking", "reranking", "retrieval", "bm25",
    # LLM / GenAI
    "llm", "large language model", "fine-tuning", "fine tuning",
    "lora", "qlora", "peft", "rag", "retrieval augmented generation",
    "transformers", "bert", "gpt",
    # Evaluation
    "ndcg", "mrr", "map", "a/b testing", "ab testing", "offline evaluation",
    "learning to rank", "ltr", "xgboost ranking",
    # Python
    "python",
}

# ── Nice-to-Have Skills (medium weight) ───────────────────────────────────────
NICE_TO_HAVE_SKILLS = {
    "recommendation system", "recommender", "search engine",
    "pytorch", "tensorflow", "huggingface", "hugging face",
    "mlflow", "weights and biases", "wandb",
    "distributed systems", "kafka", "spark",
    "open source", "github", "kubernetes", "docker",
    "airflow", "data pipeline", "feature engineering",
    "scikit-learn", "sklearn", "machine learning",
    "deep learning", "neural network",
    "product company", "startup", "saas",
    "scala", "java", "go",
}

# ── Disqualifier Title Patterns ───────────────────────────────────────────────
# Current titles that are almost certainly not a fit
DISQUALIFIER_TITLES = {
    "marketing manager", "marketing",
    "accountant", "accounting",
    "hr manager", "human resources",
    "operations manager", "operations",
    "sales executive", "sales manager", "sales",
    "customer support", "customer service",
    "civil engineer", "mechanical engineer",
    "graphic designer", "designer",
    "content writer", "content creator",
    "business analyst",      # borderline — reduced penalty, not full disqualify
    "project manager",       # borderline
}

# Titles that are strong positive signals
POSITIVE_TITLES = {
    "machine learning engineer", "ml engineer", "ai engineer",
    "senior ml engineer", "senior ai engineer",
    "data scientist", "applied scientist", "research scientist",
    "nlp engineer", "search engineer", "ranking engineer",
    "software engineer", "backend engineer", "platform engineer",
    "staff engineer", "principal engineer",
    "ai researcher", "ml researcher",
    "data engineer",    # adjacent — slight positive
    "tech lead", "engineering manager",  # senior signals
}

# ── Disqualifier Company Patterns ─────────────────────────────────────────────
# JD explicitly says people from ONLY these companies (no product co) are not a fit
PURE_CONSULTING_COMPANIES = {
    "tcs", "tata consultancy", "infosys", "wipro", "accenture",
    "cognizant", "capgemini", "hcl", "hcl technologies", "tech mahindra",
    "mphasis", "hexaware", "mindtree", "l&t infotech", "ltimindtree",
    "igate", "patni", "niit technologies", "zensar",
}

# Positive company-type signals (product cos in AI/ML space)
PRODUCT_COMPANY_KEYWORDS = {
    "startup", "product", "saas", "platform", "ai company", "tech company",
}

# ── Industry Scoring ──────────────────────────────────────────────────────────
POSITIVE_INDUSTRIES = {
    "software", "technology", "internet", "e-commerce", "fintech",
    "ai", "machine learning", "data", "saas", "product",
    "information technology",   # ambiguous but generally OK
}

NEGATIVE_INDUSTRIES = {
    "it services",   # consulting-heavy
    "paper products", "manufacturing", "retail", "fmcg",
    "construction", "real estate", "banking (traditional)",
    "agriculture", "automotive", "energy",
}

# ── Experience Year Scoring ───────────────────────────────────────────────────
# Returns 0-1 score based on years of experience
def experience_score(years: float) -> float:
    """Peak score at 5-9 years. Tapers outside that range."""
    if years < 2:
        return 0.15
    elif years < 4:
        return 0.4 + (years - 2) * 0.1   # 0.4 → 0.6
    elif years < 5:
        return 0.6 + (years - 4) * 0.2   # 0.6 → 0.8
    elif years <= 9:
        return 0.95                        # sweet spot
    elif years <= 12:
        return 0.85 - (years - 9) * 0.03  # slight taper
    else:
        return 0.70                        # senior but over-experienced

# ── Scoring Weights (must sum to 1.0) ─────────────────────────────────────────
WEIGHTS = {
    "semantic":         0.28,   # Hybrid BM25 + TF-IDF via RRF
    "skill_match":      0.28,   # Must-have + nice-to-have skill overlap
    "career_quality":   0.22,   # Product co, trajectory, title relevance
    "experience_fit":   0.10,   # Years of experience fit
    "behavioral":       0.12,   # Redrob platform signals
}

assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, f"Weights must sum to 1.0, got {sum(WEIGHTS.values())}"

# ── Behavioral Signal Weights ─────────────────────────────────────────────────
BEHAVIORAL_WEIGHTS = {
    "recency":          0.20,   # last_active_date freshness
    "availability":     0.25,   # open_to_work + notice_period
    "responsiveness":   0.25,   # recruiter_response_rate + avg_response_time
    "engagement":       0.15,   # profile completeness, verification
    "github":           0.10,   # github_activity_score
    "recruiter_signal": 0.05,   # saved_by_recruiters_30d
}

assert abs(sum(BEHAVIORAL_WEIGHTS.values()) - 1.0) < 1e-9

# ── Notice Period Scoring ─────────────────────────────────────────────────────
def notice_period_score(days: int) -> float:
    """JD prefers ≤30 days. Up to 90 still OK. >90 penalizes."""
    if days <= 0:
        return 1.0
    elif days <= 15:
        return 0.98
    elif days <= 30:
        return 0.90
    elif days <= 60:
        return 0.70
    elif days <= 90:
        return 0.50
    elif days <= 120:
        return 0.30
    else:
        return 0.15

# ── Salary Range for JD (estimated INR LPA) ───────────────────────────────────
JD_SALARY_MIDPOINT_LPA = 40.0  # estimated for senior AI role in India

# ── JD-Intent Signal Vocabulary ───────────────────────────────────────────────
# These encode the JD's *explicit* "what we mean / do NOT want" sections, which
# are how the hidden ground truth was built. Used by jd_intent.py.

# NLP / IR evidence — the JD's core domain.
NLP_IR_KWS = {
    "nlp", "natural language", "information retrieval", "retrieval", "ranking",
    "reranking", "search", "embedding", "embeddings", "semantic", "bm25",
    "vector search", "recommendation", "recommender", "learning to rank",
}

# Other ML domains the JD de-prioritizes WHEN NLP/IR is absent
# ("primary expertise is computer vision, speech, or robotics without NLP/IR").
OTHER_DOMAIN_KWS = {
    "computer vision", "image classification", "object detection", "segmentation",
    "speech recognition", "tts", "asr", "robotics", "autonomous", "gan", "gans",
    "image generation", "video", "ocr",
}

# "Shipped end-to-end ranking/search/recsys at scale" — the ideal-candidate line.
SHIPPING_KWS = {
    "shipped", "deployed", "production", "launched", "built and",
    "end-to-end", "end to end", "at scale", "real users", "owned",
}

# Recent-LangChain-only signal: framework-tutorial style, no systems depth.
RECENT_LLM_FRAMEWORK_KWS = {
    "langchain", "llamaindex", "llama-index", "prompt engineering",
    "openai api", "chatgpt", "gpt wrapper",
}

# Pre-LLM-era ML depth (JD wants people who "understood retrieval before it was fashionable").
PRE_LLM_DEPTH_KWS = {
    "xgboost", "learning to rank", "ltr", "svm", "random forest",
    "collaborative filtering", "matrix factorization", "tf-idf", "bm25",
    "word2vec", "glove", "lsa", "lda", "gradient boosting", "feature engineering",
}

# Pure-research / academic signal (penalized WITHOUT production deployment).
RESEARCH_ONLY_KWS = {
    "research scholar", "phd researcher", "postdoc", "post-doc",
    "academic", "publication", "research assistant", "research fellow",
    "thesis", "university research",
}

# External-validation signals (papers / talks / OSS — JD: "need to see how you think").
EXTERNAL_VALIDATION_KWS = {
    "open source", "open-source", "github", "published", "paper", "patent",
    "conference", "talk", "speaker", "kaggle", "blog",
}

# ── JD-Intent Adjustment Weights (multipliers; env-tunable) ────────────────────
# Each is a multiplier applied to the final score. 1.0 = neutral.
JD_INTENT_WEIGHTS = {
    "domain_mismatch":      0.55,  # CV/speech/robotics without NLP/IR
    "pure_research":        0.55,  # research-only, no production
    "recent_framework_only":0.70,  # only-recent LangChain/OpenAI, no depth
    "shipping_boost":       1.12,  # demonstrable end-to-end shipping at scale
    "pre_llm_depth_boost":  1.08,  # pre-LLM ML fundamentals
    "external_valid_boost": 1.05,  # papers / talks / OSS
}
