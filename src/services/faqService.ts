import * as fuzz from 'fuzzball';
import { FAQ, FAQ_DATA } from '../data/faqs';

/**
 * BM25 (Best Matching 25) implementation for robust document ranking.
 */
class BM25 {
  private documents: string[][] = [];
  private idf: Map<string, number> = new Map();
  private avgdl: number = 0;
  private k1: number = 1.2; // Typical value between 1.2 and 2.0
  private b: number = 0.75;  // Typical value 0.75

  constructor(docs: string[], k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = docs.map(doc => this.tokenize(doc));
    this.avgdl = this.documents.reduce((sum, doc) => sum + doc.length, 0) / this.documents.length;
    this.calculateIdf();
  }

  private tokenize(text: string): string[] {
    // Basic stop words to filter out noise
    const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'to', 'for', 'in', 'on', 'at', 'by', 'of', 'and', 'or', 'with', 'how', 'what', 'where', 'when', 'who', 'why', 'do', 'does', 'did', 'can', 'could', 'should', 'would']);
    
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
  }

  private calculateIdf() {
    const N = this.documents.length;
    const vocab = new Set<string>();
    this.documents.forEach(doc => doc.forEach(word => vocab.add(word)));

    vocab.forEach(word => {
      const n_q = this.documents.filter(doc => doc.includes(word)).length;
      // BM25 IDF formula: log((N - n_q + 0.5) / (n_q + 0.5) + 1)
      const idfValue = Math.log((N - n_q + 0.5) / (n_q + 0.5) + 1);
      this.idf.set(word, idfValue);
    });
  }

  /**
   * Calculates BM25 score for a query against a document.
   * Note: This score is not normalized.
   */
  public getScore(query: string, docIndex: number): number {
    const queryTokens = this.tokenize(query);
    const docTokens = this.documents[docIndex];
    const docLen = docTokens.length;

    if (queryTokens.length === 0) return 0;

    let score = 0;
    const uniqueQueryTokens = new Set(queryTokens);

    uniqueQueryTokens.forEach(token => {
      const idf = this.idf.get(token) || 0;
      const f_q_D = docTokens.filter(t => t === token).length;
      
      const numerator = f_q_D * (this.k1 + 1);
      const denominator = f_q_D + this.k1 * (1 - this.b + this.b * (docLen / this.avgdl));
      
      score += idf * (numerator / denominator);
    });

    return score;
  }

  /**
   * Get a normalized score (0-1) by comparing against the query's max possible score.
   */
  public getNormalizedScore(query: string, docIndex: number): number {
    const rawScore = this.getScore(query, docIndex);
    if (rawScore === 0) return 0;

    // To normalize, we estimate the "perfect" score for this query
    // A perfect score would be if a document contained all query terms with high frequency
    const queryTokens = this.tokenize(query);
    let maxPossibleScore = 0;
    queryTokens.forEach(token => {
      const idf = this.idf.get(token) || 0;
      maxPossibleScore += idf * (this.k1 + 1);
    });

    if (maxPossibleScore === 0) return 0;
    
    // Cap at 1.0, though BM25 can technically exceed this in some normalization schemes
    return Math.min(1.0, rawScore / maxPossibleScore);
  }
}

// Initialize BM25 with FAQ questions
const bm25 = new BM25(FAQ_DATA.map(f => f.question));

// Synonym mappings (expanded for better coverage)
const SYNONYMS: Record<string, string[]> = {
  "ceo": ["boss", "leader", "founder", "head", "executive", "chief"],
  "hiring": ["jobs", "careers", "employment", "positions", "work", "recruiting", "openings"],
  "internship": ["intern", "student program", "placement", "trainee"],
  "support": ["help", "assistance", "contact", "customer service", "troubleshoot"],
  "security": ["safe", "protect", "encryption", "privacy", "secure", "safety"],
  "billing": ["payment", "invoice", "cost", "price", "money", "subscription", "charge"],
  "api": ["developer", "integration", "endpoint", "sdk", "webhooks"],
  "location": ["office", "headquarters", "address", "where", "city", "country"],
  "product": ["software", "tool", "platform", "app", "solution", "offering", "system"],
  "mobile": ["ios", "android", "phone", "tablet", "handheld"],
  "company": ["techcorp", "business", "organization", "firm", "enterprise", "corp", "agency"],
  "data": ["information", "info", "records", "details", "stats", "analytics", "content"],
  "service": ["feature", "utility", "function", "provision", "assistance", "offering"]
};

/**
 * Preprocess query to handle synonyms and common variations
 */
function handleSynonyms(query: string): string {
  let processed = query.toLowerCase();
  for (const [key, values] of Object.entries(SYNONYMS)) {
    values.forEach(syn => {
      const regex = new RegExp(`\\b${syn}\\b`, 'gi');
      processed = processed.replace(regex, key);
    });
  }
  return processed;
}

export interface SearchResult {
  faq: FAQ | null;
  score: number;
  suggestedFaqs: FAQ[];
  isFallback: boolean;
}

export function searchFaq(query: string): SearchResult {
  if (!query.trim()) {
    return { faq: null, score: 0, suggestedFaqs: [], isFallback: false };
  }

  const processedQuery = handleSynonyms(query);
  
  const results = FAQ_DATA.map((faq, index) => {
    // 1. BM25 Normalized Score (0-1)
    const bm25Score = bm25.getNormalizedScore(processedQuery, index);
    
    // 2. Fuzzy Matching (0-100 -> 0-1)
    // Using token_set_ratio for better handling of partial matches and word reordering
    const fuzzyScore = fuzz.token_set_ratio(processedQuery, faq.question.toLowerCase()) / 100;
    
    // Hybrid Score: 0.7 * BM25 + 0.3 * Fuzzy
    // BM25 is better for keyword relevance, Fuzzy helps with typos and partial strings
    const finalScore = (0.7 * bm25Score) + (0.3 * fuzzyScore);
    
    return { faq, score: finalScore };
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  const topResult = results[0];

  // Adjusted thresholds for BM25 + Fuzzy
  if (topResult.score > 0.55) {
    return {
      faq: topResult.faq,
      score: topResult.score,
      suggestedFaqs: [],
      isFallback: false
    };
  } else if (topResult.score >= 0.35) {
    return {
      faq: null,
      score: topResult.score,
      suggestedFaqs: results.slice(0, 3).map(r => r.faq),
      isFallback: false
    };
  } else {
    return {
      faq: null,
      score: topResult.score,
      suggestedFaqs: [],
      isFallback: true
    };
  }
}
