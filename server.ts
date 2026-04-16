import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as fuzz from 'fuzzball';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FAQ {
  category: string;
  question: string;
  answer: string;
}

// FAQ Data (Backend Source of Truth)
let FAQ_DATA: FAQ[] = [];
const FAQ_PATH = path.join(__dirname, "data", "faqs.json");

function loadFaqs() {
  try {
    if (fs.existsSync(FAQ_PATH)) {
      const data = fs.readFileSync(FAQ_PATH, "utf-8");
      FAQ_DATA = JSON.parse(data);
      console.log(`Loaded ${FAQ_DATA.length} FAQs from ${FAQ_PATH}`);
      // Re-initialize TF-IDF with new data
      tfIdf = new TfIdfCosine(FAQ_DATA.map(f => f.question));
    } else {
      console.error(`FAQ file not found at ${FAQ_PATH}`);
    }
  } catch (error) {
    console.error("Error loading FAQs:", error);
  }
}

// NLP Logic
/**
 * TF-IDF Cosine Similarity implementation for document ranking.
 */
class TfIdfCosine {
  private documents: string[][] = [];
  private idf: Map<string, number> = new Map();

  constructor(docs: string[]) {
    this.documents = docs.map(doc => this.tokenize(doc));
    this.calculateIdf();
  }

  public tokenize(text: string): string[] {
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
      // Smoothed TF-IDF formula
      const idfValue = Math.log(N / (1 + n_q)) + 1;
      this.idf.set(word, idfValue);
    });
  }

  public getSimilarity(query: string, docIndex: number): number {
    const queryTokens = this.tokenize(query);
    const docTokens = this.documents[docIndex];

    if (queryTokens.length === 0 || docTokens.length === 0) return 0;

    const getTf = (tokens: string[]) => {
      const freqs: Record<string, number> = {};
      tokens.forEach(t => freqs[t] = (freqs[t] || 0) + 1);
      const maxFreq = Math.max(...Object.values(freqs));
      const tf: Record<string, number> = {};
      Object.keys(freqs).forEach(k => tf[k] = freqs[k] / maxFreq);
      return tf;
    };

    const queryTf = getTf(queryTokens);
    const docTf = getTf(docTokens);

    let docMag = 0;
    let queryMag = 0;
    let dotProduct = 0;

    const vocab = new Set([...Object.keys(queryTf), ...Object.keys(docTf)]);
    vocab.forEach(term => {
      const idf = this.idf.get(term) || (Math.log(this.documents.length / 1) + 1);
      const qWeight = (queryTf[term] || 0) * idf;
      const dWeight = (docTf[term] || 0) * idf;
      dotProduct += qWeight * dWeight;
      queryMag += qWeight * qWeight;
      docMag += dWeight * dWeight;
    });

    if (queryMag === 0 || docMag === 0) return 0;
    return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(docMag));
  }
}

let tfIdf: TfIdfCosine;

// Initial load
loadFaqs();

const SYNONYMS: Record<string, string[]> = {
  "university": ["college", "institution", "campus", "school", "academy"],
  "faculty": ["teachers", "professors", "staff", "instructors"],
  "admission": ["enrollment", "joining", "registration", "signup"],
  "ceo": ["boss", "leader", "founder", "head", "executive", "chief"],
  "hiring": ["jobs", "careers", "employment", "positions", "work", "recruiting", "openings"],
  "internship": ["intern", "student program", "placement", "trainee"],
  "support": ["help", "assistance", "contact", "customer service", "troubleshoot"],
  "security": ["safe", "protect", "encryption", "privacy", "secure", "safety"],
  "billing": ["payment", "invoice", "cost", "price", "money", "subscription", "charge"],
  "api": ["developer", "integration", "endpoint", "sdk", "webhooks"],
  "product": ["software", "tool", "platform", "app", "solution", "offering", "system"],
  "company": ["techcorp", "business", "organization", "firm", "enterprise", "corp", "agency"],
  "data": ["information", "info", "records", "details", "stats", "analytics", "content"],
  "service": ["feature", "utility", "function", "provision", "assistance", "offering"]
};

function handleSynonyms(query: string): string {
  let processed = query.toLowerCase().replace(/[^\w\s]/g, ' ');
  for (const [key, values] of Object.entries(SYNONYMS)) {
    values.forEach(syn => {
      const regex = new RegExp(`\\b${syn}\\b`, 'gi');
      processed = processed.replace(regex, key);
    });
  }
  return processed;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // FAQ Management Routes
  app.get("/api/faqs", (req, res) => {
    res.json(FAQ_DATA);
  });

  app.post("/api/faqs/reload", (req, res) => {
    loadFaqs();
    res.json({ message: "FAQs reloaded successfully", count: FAQ_DATA.length });
  });

  // API Routes
  app.post("/api/ask", (req, res) => {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: "Invalid query" });
    }

    const cleanQuery = query.toLowerCase().trim().replace(/[^\\w\\s]/g, '');
    const greetings = ["hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening", "howdy", "sup"];
    
    // Intent Detection: Greeting
    if (greetings.includes(cleanQuery)) {
      return res.json({
        answer: "Hello! How can I help you today?",
        score: 1.0,
        faq: null,
        category: "Greeting",
        intentHint: "Direct Answer",
        vibe: "Friendly",
        suggestedFaqs: []
      });
    }

    const processedQuery = handleSynonyms(query);
    
    const results = FAQ_DATA.map((faq, index) => {
      const cosineScore = tfIdf.getSimilarity(processedQuery, index);
      const fuzzyScore = fuzz.token_set_ratio(processedQuery, faq.question.toLowerCase()) / 100;
      // Hybrid scoring with heavy weight on Cosine Similarity
      const finalScore = (0.7 * cosineScore) + (0.3 * fuzzyScore);
      return { faq, score: finalScore };
    });

    results.sort((a, b) => b.score - a.score);

    const topResult = results[0];
    const topFaq = topResult.faq;
    let answerResponse = "";
    let confidenceLevel = "";
    let isFallback = false;

    // Intent Detection: FAQ vs Unknown based on thresholds
    if (topResult.score > 0.6) {
      // Confident match
      answerResponse = topFaq.answer;
      confidenceLevel = "high";
    } else if (topResult.score >= 0.4) {
      // Medium match
      answerResponse = `I think this might help:\\n\\n${topFaq.answer}`;
      confidenceLevel = "medium";
    } else {
      // Low match - fallback
      answerResponse = "I couldn't find an exact answer. Try one of these:";
      confidenceLevel = "low";
      isFallback = true;
    }

    res.json({
      answer: answerResponse,
      score: topResult.score,
      faq: topResult.score >= 0.4 ? topFaq : null,
      category: isFallback ? "Unknown query" : topFaq.category,
      confidence: confidenceLevel,
      intentHint: isFallback ? "Fallback" : "FAQ",
      vibe: "Professional yet friendly",
      suggestedFaqs: isFallback ? results.slice(0, 3).map(r => r.faq) : results.slice(1, 4).map(r => r.faq)
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
