/**
 * Evergreen explainer catalogue. Ordered by publish priority (first unpublished
 * wins when running --weekly). Slug becomes the URL path (no hash suffix).
 */

export const EVERGREEN_TOPICS = [
  {
    slug: 'what-is-retrieval-augmented-generation-rag',
    title_seed: 'What is Retrieval-Augmented Generation (RAG)? A complete 2026 guide',
    category: 'research',
    intent:
      'Beginner-to-intermediate explainer for developers and product managers who keep hearing "RAG" and want a clear, technically honest definition with concrete examples, an architecture walkthrough, and trade-offs vs alternatives.',
    keyword_focus: ['retrieval-augmented generation', 'RAG', 'vector database', 'embeddings', 'context window', 'hallucination'],
    audience: 'Developers and AI product managers'
  },
  {
    slug: 'rag-vs-fine-tuning-vs-prompt-engineering',
    title_seed: 'RAG vs fine-tuning vs prompt engineering: when to use each',
    category: 'research',
    intent:
      'Comparison guide for teams deciding how to customize an LLM. Reader wants a clear decision framework, cost ranges, latency implications, and concrete examples of when each technique is the right call.',
    keyword_focus: ['fine-tuning', 'RAG', 'prompt engineering', 'LoRA', 'instruction tuning', 'system prompt'],
    audience: 'Engineering leads choosing an AI customization strategy'
  },
  {
    slug: 'what-are-ai-agents-practical-guide-2026',
    title_seed: 'What are AI agents? A practical guide for builders in 2026',
    category: 'tools',
    intent:
      'Definitive 2026 overview of AI agents. Reader wants to know what an agent actually is (versus a chatbot), what frameworks exist, what real production use cases look like, and where agents reliably break.',
    keyword_focus: ['AI agents', 'agentic AI', 'autonomous agents', 'tool use', 'function calling', 'multi-agent'],
    audience: 'Software engineers and CTOs evaluating agentic systems'
  },
  {
    slug: 'gpt-5-vs-claude-4-5-vs-gemini-ultra-2026',
    title_seed: 'GPT-5 vs Claude 4.5 vs Gemini Ultra: how to choose in 2026',
    category: 'llms',
    intent:
      'High-volume head-to-head comparison. Reader is choosing between the three frontier models for production work and wants strengths, weaknesses, pricing, latency, context window, tool use, and concrete use-case verdicts.',
    keyword_focus: ['GPT-5 vs Claude', 'GPT vs Gemini', 'Claude vs GPT', 'best LLM 2026', 'frontier model comparison', 'LLM pricing'],
    audience: 'Product leads and engineers picking a frontier LLM for production'
  },
  {
    slug: 'how-large-language-models-work-clear-explainer',
    title_seed: 'How large language models work: a clear visual explainer',
    category: 'research',
    intent:
      'Beginner-friendly walkthrough of LLM mechanics for technical-curious readers. Reader wants tokens to attention to next-token prediction without graduate math.',
    keyword_focus: ['how LLMs work', 'how language models work', 'transformer architecture', 'tokens', 'attention mechanism', 'next-token prediction'],
    audience: 'Technical-curious readers who want to understand LLMs without a PhD'
  },
  // ── Weekly queue (publish one per week, in order) ──
  {
    slug: 'fastapi-starlette-security-ai-agents-guide',
    title_seed: 'FastAPI and Starlette security for AI agents: vulnerabilities, patches, and production hardening',
    category: 'tools',
    intent:
      'Developer guide for teams running AI agents on Python web stacks. Reader searched for Starlette/FastAPI security flaws and wants patch guidance, MCP exposure risks, and a production checklist.',
    keyword_focus: ['FastAPI security', 'Starlette vulnerability', 'AI agents Python', 'MCP servers', 'ASGI security', 'production hardening'],
    audience: 'Python developers deploying AI agent backends'
  },
  {
    slug: 'what-is-model-context-protocol-mcp',
    title_seed: 'What is the Model Context Protocol (MCP)? A practical guide for AI builders',
    category: 'tools',
    intent:
      'Explainer for developers connecting LLMs to tools and data. Reader wants architecture, server/client roles, security considerations, and real integration patterns.',
    keyword_focus: ['Model Context Protocol', 'MCP', 'AI agent tools', 'LLM integrations', 'Anthropic MCP', 'tool servers'],
    audience: 'Developers wiring LLMs to external systems'
  },
  {
    slug: 'vector-databases-rag-guide-2026',
    title_seed: 'Vector databases for RAG: Pinecone, pgvector, Chroma, and how to choose',
    category: 'research',
    intent:
      'Comparison and selection guide for engineering teams building RAG. Reader wants indexing strategies, hybrid search, cost, and when to skip a dedicated vector DB.',
    keyword_focus: ['vector database', 'RAG pipeline', 'embeddings index', 'pgvector', 'semantic search', 'hybrid search'],
    audience: 'Engineers designing retrieval systems'
  },
  {
    slug: 'prompt-engineering-guide-2026',
    title_seed: 'Prompt engineering in 2026: patterns that actually work in production',
    category: 'llms',
    intent:
      'Practical prompt design guide beyond toy examples. Reader wants system prompts, few-shot patterns, evaluation loops, and failure modes for production LLM apps.',
    keyword_focus: ['prompt engineering', 'system prompt', 'few-shot prompting', 'chain of thought', 'LLM instructions', 'prompt patterns'],
    audience: 'Developers and PMs shipping LLM features'
  },
  {
    slug: 'how-to-reduce-llm-hallucinations',
    title_seed: 'How to reduce LLM hallucinations: RAG, grounding, and evaluation tactics',
    category: 'research',
    intent:
      'Actionable guide for teams seeing made-up facts in production. Reader wants root causes, mitigation stack (RAG, citations, guardrails), and how to measure improvement.',
    keyword_focus: ['LLM hallucination', 'grounding', 'RAG', 'factuality', 'citation', 'LLM evaluation'],
    audience: 'Teams shipping customer-facing LLM products'
  },
  {
    slug: 'embedding-models-compared-2026',
    title_seed: 'Embedding models compared: OpenAI, Cohere, open source, and retrieval quality',
    category: 'research',
    intent:
      'Model selection guide for semantic search and RAG. Reader wants dimension trade-offs, multilingual support, latency, cost, and benchmark-aware recommendations.',
    keyword_focus: ['embedding models', 'text embeddings', 'semantic search', 'MTEB', 'vector search quality', 'open source embeddings'],
    audience: 'ML engineers picking an embedding model'
  },
  {
    slug: 'ai-coding-agents-developer-guide-2026',
    title_seed: 'AI coding agents in 2026: Copilot, Codex, Cursor, and what works in real repos',
    category: 'tools',
    intent:
      'Honest guide for developers evaluating AI coding assistants. Reader wants workflow patterns, limits on large codebases, security review expectations, and team adoption advice.',
    keyword_focus: ['AI coding agent', 'GitHub Copilot', 'Codex', 'AI pair programming', 'code generation', 'developer productivity'],
    audience: 'Software engineers and engineering managers'
  },
  {
    slug: 'building-production-rag-pipeline',
    title_seed: 'Building a production RAG pipeline: ingestion, chunking, retrieval, and monitoring',
    category: 'research',
    intent:
      'End-to-end implementation guide from documents to answers. Reader wants chunking strategies, re-ranking, caching, observability, and common production bugs.',
    keyword_focus: ['RAG pipeline', 'document chunking', 're-ranking', 'retrieval evaluation', 'production LLM', 'knowledge base'],
    audience: 'Engineers moving RAG from prototype to production'
  },
  {
    slug: 'llm-context-window-explained',
    title_seed: 'LLM context windows explained: tokens, limits, and long-context trade-offs',
    category: 'llms',
    intent:
      'Clear explainer on context length for buyers and builders. Reader wants what counts as tokens, why limits matter, long-context model trade-offs, and cost implications.',
    keyword_focus: ['context window', 'LLM tokens', 'long context', 'token limits', 'context length', 'input tokens'],
    audience: 'Developers and product managers sizing LLM workloads'
  },
  {
    slug: 'tool-use-function-calling-guide',
    title_seed: 'LLM tool use and function calling: a builder\'s guide',
    category: 'tools',
    intent:
      'Technical guide to connecting models to APIs and tools. Reader wants schema design, error handling, parallel tools, and security boundaries.',
    keyword_focus: ['function calling', 'tool use', 'LLM tools', 'OpenAI tools', 'structured outputs', 'agent tools'],
    audience: 'Developers building agentic applications'
  },
  {
    slug: 'fine-tuning-lora-practical-guide',
    title_seed: 'Fine-tuning LLMs with LoRA: when it\'s worth it and how to do it safely',
    category: 'research',
    intent:
      'Practical fine-tuning guide covering data prep, LoRA/QLoRA, evaluation, and when NOT to fine-tune. Reader wants cost ranges and failure modes.',
    keyword_focus: ['LoRA fine-tuning', 'QLoRA', 'instruction tuning', 'fine-tune LLM', 'training data', 'model adaptation'],
    audience: 'ML engineers considering customization beyond prompts'
  },
  {
    slug: 'local-llms-vs-cloud-api',
    title_seed: 'Local LLMs vs cloud APIs: cost, privacy, latency, and quality trade-offs',
    category: 'llms',
    intent:
      'Decision guide for teams choosing on-prem/open-weight models vs hosted APIs. Reader wants hardware requirements, TCO, privacy/compliance, and quality gaps.',
    keyword_focus: ['local LLM', 'self-hosted LLM', 'Ollama', 'LLM API cost', 'on-prem AI', 'open weight models'],
    audience: 'CTOs and infra leads planning AI architecture'
  },
  {
    slug: 'open-source-llms-comparison-2026',
    title_seed: 'Best open-source LLMs in 2026: Llama, Mistral, Qwen, and deployment notes',
    category: 'llms',
    intent:
      'Up-to-date comparison of leading open-weight models. Reader wants license notes, benchmark snapshots, hardware needs, and recommended use cases.',
    keyword_focus: ['open source LLM', 'Llama 4', 'Mistral', 'Qwen', 'open weight model', 'self-hosted chatbot'],
    audience: 'Teams evaluating open-source model stacks'
  },
  {
    slug: 'semantic-search-embeddings-guide',
    title_seed: 'Semantic search with embeddings: architecture, pitfalls, and evaluation',
    category: 'research',
    intent:
      'Guide for product teams replacing keyword search. Reader wants embedding pipelines, hybrid retrieval, freshness, and how to measure search quality.',
    keyword_focus: ['semantic search', 'vector search', 'embeddings', 'search relevance', 'hybrid retrieval', 'kNN search'],
    audience: 'Search and product engineers'
  },
  {
    slug: 'ai-agent-memory-architectures',
    title_seed: 'AI agent memory: short-term, long-term, and vector-backed recall explained',
    category: 'tools',
    intent:
      'Architecture guide for persistent agents. Reader wants memory types, storage patterns, summarization loops, and privacy implications.',
    keyword_focus: ['AI agent memory', 'long-term memory', 'vector memory', 'agent state', 'conversation memory', 'RAG agents'],
    audience: 'Engineers building multi-session agents'
  },
  {
    slug: 'llm-inference-cost-optimization',
    title_seed: 'LLM inference cost optimization: caching, routing, quantization, and batching',
    category: 'business',
    intent:
      'FinOps-style guide for teams with growing LLM bills. Reader wants concrete levers: prompt caching, model routing, smaller models, batch APIs, and monitoring.',
    keyword_focus: ['LLM cost', 'inference optimization', 'prompt caching', 'model routing', 'quantization', 'token cost'],
    audience: 'Engineering leads and FinOps owners'
  },
  {
    slug: 'multimodal-ai-models-explained',
    title_seed: 'Multimodal AI models explained: vision, audio, and unified interfaces',
    category: 'llms',
    intent:
      'Explainer for teams adding images/audio to LLM apps. Reader wants how multimodal encoders work, latency/cost, and production use cases.',
    keyword_focus: ['multimodal AI', 'vision language model', 'image understanding', 'audio LLM', 'GPT-4V', 'unified models'],
    audience: 'Product teams exploring multimodal features'
  },
  {
    slug: 'ai-evaluation-benchmarks-explained',
    title_seed: 'LLM benchmarks explained: MMLU, HumanEval, MTEB, and what they actually measure',
    category: 'research',
    intent:
      'Guide decoding common AI benchmarks for buyers. Reader wants what each benchmark tests, limitations, cherry-picking risks, and how to run private evals.',
    keyword_focus: ['LLM benchmarks', 'MMLU', 'HumanEval', 'MTEB', 'model evaluation', 'AI leaderboard'],
    audience: 'Engineers and PMs comparing models responsibly'
  },
  {
    slug: 'enterprise-ai-security-best-practices',
    title_seed: 'Enterprise AI security: data leakage, prompt injection, and agent guardrails',
    category: 'ethics',
    intent:
      'Security checklist for companies deploying LLMs. Reader wants threat model, prompt injection mitigations, data residency, and audit logging.',
    keyword_focus: ['AI security', 'prompt injection', 'LLM data leakage', 'enterprise AI', 'AI guardrails', 'red teaming'],
    audience: 'Security engineers and CISOs'
  },
  {
    slug: 'ai-agents-vs-chatbots-difference',
    title_seed: 'AI agents vs chatbots: what\'s the difference and when to build each',
    category: 'tools',
    intent:
      'High-intent comparison for business and engineering readers planning AI products. Reader wants capability matrix, cost, reliability, and examples.',
    keyword_focus: ['AI agent vs chatbot', 'agentic AI', 'conversational AI', 'autonomous workflow', 'tool use', 'customer support bot'],
    audience: 'Product managers scoping AI features'
  },
  {
    slug: 'hybrid-search-rag-guide',
    title_seed: 'Hybrid search for RAG: combining keyword and vector retrieval',
    category: 'research',
    intent:
      'Technical guide to BM25 + vector fusion, re-rankers, and when hybrid beats pure semantic search. Reader wants implementation patterns and tuning tips.',
    keyword_focus: ['hybrid search', 'BM25', 'vector search', 'RAG retrieval', 're-ranking', 'Reciprocal Rank Fusion'],
    audience: 'Search engineers improving RAG recall'
  },
  {
    slug: 'small-language-models-edge-ai',
    title_seed: 'Small language models (SLMs) for edge AI: on-device inference and trade-offs',
    category: 'tools',
    intent:
      'Guide to running compact models on phones, robots, and edge hardware. Reader wants model sizes, latency, quality gaps vs frontier models, and frameworks.',
    keyword_focus: ['small language model', 'edge AI', 'on-device LLM', 'mobile AI', 'SLM', 'quantized models'],
    audience: 'Edge and mobile engineers'
  },
  {
    slug: 'nvidia-gpu-ai-infrastructure-guide',
    title_seed: 'NVIDIA GPU infrastructure for AI: training vs inference, clusters, and cost planning',
    category: 'business',
    intent:
      'Infrastructure primer for teams scaling GPU workloads. Reader wants H100 vs consumer GPUs, cloud vs owned, inference serving stacks, and capex/opex framing.',
    keyword_focus: ['NVIDIA GPU', 'AI infrastructure', 'H100', 'inference server', 'GPU cluster', 'CUDA AI'],
    audience: 'Infra leads and ML platform teams'
  }
];
