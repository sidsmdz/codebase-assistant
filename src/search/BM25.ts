/**
 * BM25 (Best Matching 25) Algorithm Implementation
 *
 * BM25 is a ranking function used by search engines to estimate the relevance
 * of documents to a given search query. It's based on the probabilistic retrieval
 * framework and is an improvement over TF-IDF.
 *
 * Formula:
 * BM25(D, Q) = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
 *
 * Where:
 * - D is a document
 * - Q is a query containing terms q1, ..., qn
 * - f(qi, D) is the frequency of term qi in document D
 * - |D| is the length of document D
 * - avgdl is the average document length in the collection
 * - k1 and b are free parameters (typically k1 = 1.2-2.0, b = 0.75)
 * - IDF(qi) is the inverse document frequency of term qi
 */

export interface BM25Params {
    k1: number;  // Term frequency saturation parameter (typically 1.2-2.0)
    b: number;   // Length normalization parameter (typically 0.75)
}

export interface DocumentStats {
    patternId: string;
    fieldLengths: { [field: string]: number };
    totalTerms: number;
}

export interface TermStats {
    term: string;
    documentFrequency: number;  // Number of documents containing this term
}

export interface CollectionStats {
    field: string;
    totalDocs: number;
    avgLength: number;
    totalTerms: number;
}

export interface ScoredResult {
    patternId: string;
    score: number;
    fieldScores?: { [field: string]: number };
}

/**
 * BM25 Scoring Algorithm
 */
export class BM25 {
    private k1: number;
    private b: number;

    constructor(params?: Partial<BM25Params>) {
        // Default BM25 parameters
        this.k1 = params?.k1 ?? 1.5;
        this.b = params?.b ?? 0.75;
    }

    /**
     * Calculate IDF (Inverse Document Frequency) for a term
     *
     * IDF = log((N - df + 0.5) / (df + 0.5) + 1)
     *
     * Where:
     * - N is the total number of documents in the collection
     * - df is the number of documents containing the term
     */
    calculateIDF(totalDocs: number, docFrequency: number): number {
        if (docFrequency === 0) {
            return 0;
        }

        const numerator = totalDocs - docFrequency + 0.5;
        const denominator = docFrequency + 0.5;

        return Math.log((numerator / denominator) + 1);
    }

    /**
     * Calculate BM25 score for a single term in a document
     *
     * score = IDF(term) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen)))
     *
     * Where:
     * - tf is the term frequency in the document
     * - docLen is the length of the document
     * - avgDocLen is the average document length in the collection
     */
    scoreTerm(
        tf: number,              // Term frequency in document
        idf: number,             // IDF score for the term
        docLength: number,       // Length of this document
        avgDocLength: number     // Average document length in collection
    ): number {
        if (tf === 0 || docLength === 0 || avgDocLength === 0) {
            return 0;
        }

        const numerator = tf * (this.k1 + 1);
        const lengthNorm = 1 - this.b + this.b * (docLength / avgDocLength);
        const denominator = tf + this.k1 * lengthNorm;

        return idf * (numerator / denominator);
    }

    /**
     * Calculate BM25 score for a full query against a document
     *
     * This method sums the scores for each query term found in the document.
     */
    scoreDocument(
        queryTerms: string[],                      // Terms in the query
        documentTermFreqs: Map<string, number>,    // Term frequencies in the document
        termIDFs: Map<string, number>,             // IDF scores for terms
        docLength: number,                         // Document length
        avgDocLength: number                       // Average document length
    ): number {
        let totalScore = 0;

        for (const term of queryTerms) {
            const tf = documentTermFreqs.get(term) || 0;
            const idf = termIDFs.get(term) || 0;

            if (tf > 0 && idf > 0) {
                totalScore += this.scoreTerm(tf, idf, docLength, avgDocLength);
            }
        }

        return totalScore;
    }

    /**
     * Calculate BM25 scores for multiple fields with boosting
     *
     * This enables multi-field search where different fields can have different importance.
     * For example, matches in the "name" field might be more important than matches in "code".
     *
     * @param queryTerms Terms in the query
     * @param documentData Document data with term frequencies per field
     * @param termIDFs IDF scores for terms per field
     * @param docLengths Document lengths per field
     * @param avgDocLengths Average document lengths per field
     * @param fieldBoosts Boost factors for each field (e.g., {name: 3.0, code: 1.0})
     */
    scoreMultiField(
        queryTerms: string[],
        documentData: {
            [field: string]: Map<string, number>;  // field -> term -> frequency
        },
        termIDFs: {
            [field: string]: Map<string, number>;  // field -> term -> IDF
        },
        docLengths: {
            [field: string]: number;               // field -> document length
        },
        avgDocLengths: {
            [field: string]: number;               // field -> average length
        },
        fieldBoosts: {
            [field: string]: number;               // field -> boost factor
        }
    ): number {
        let totalScore = 0;

        for (const field in documentData) {
            const termFreqs = documentData[field];
            const idfMap = termIDFs[field];
            const docLength = docLengths[field] || 0;
            const avgLength = avgDocLengths[field] || 1;
            const boost = fieldBoosts[field] || 1.0;

            if (termFreqs && idfMap && docLength > 0) {
                const fieldScore = this.scoreDocument(
                    queryTerms,
                    termFreqs,
                    idfMap,
                    docLength,
                    avgLength
                );

                totalScore += fieldScore * boost;
            }
        }

        return totalScore;
    }

    /**
     * Calculate BM25 scores with per-field breakdown
     * Returns both total score and individual field scores
     */
    scoreMultiFieldWithBreakdown(
        queryTerms: string[],
        documentData: { [field: string]: Map<string, number> },
        termIDFs: { [field: string]: Map<string, number> },
        docLengths: { [field: string]: number },
        avgDocLengths: { [field: string]: number },
        fieldBoosts: { [field: string]: number }
    ): { totalScore: number; fieldScores: { [field: string]: number } } {
        let totalScore = 0;
        const fieldScores: { [field: string]: number } = {};

        for (const field in documentData) {
            const termFreqs = documentData[field];
            const idfMap = termIDFs[field];
            const docLength = docLengths[field] || 0;
            const avgLength = avgDocLengths[field] || 1;
            const boost = fieldBoosts[field] || 1.0;

            if (termFreqs && idfMap && docLength > 0) {
                const fieldScore = this.scoreDocument(
                    queryTerms,
                    termFreqs,
                    idfMap,
                    docLength,
                    avgLength
                );

                const boostedScore = fieldScore * boost;
                fieldScores[field] = boostedScore;
                totalScore += boostedScore;
            }
        }

        return { totalScore, fieldScores };
    }

    /**
     * Update BM25 parameters
     */
    setParams(params: Partial<BM25Params>): void {
        if (params.k1 !== undefined) {
            this.k1 = params.k1;
        }
        if (params.b !== undefined) {
            this.b = params.b;
        }
    }

    /**
     * Get current BM25 parameters
     */
    getParams(): BM25Params {
        return {
            k1: this.k1,
            b: this.b
        };
    }
}

/**
 * Singleton BM25 instance with default parameters
 */
export const bm25 = new BM25();
