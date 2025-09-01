// browser-embedding.js - Direct Pinecone Host URL Version (Service Worker Safe)
class BrowserEmbeddingService {
    constructor() {
        this.geminiApiKey = null;
        this.pineconeApiKey = null;
        this.pineconeHost = null;
        this.initialized = false;
    }

    async initialize() {
        // Get API keys from Chrome storage
        const result = await chrome.storage.local.get([
            'geminiApiKey', 
            'pineconeApiKey', 
            'pineconeHost'
        ]);

        this.geminiApiKey = result.geminiApiKey;
        this.pineconeApiKey = result.pineconeApiKey;
        this.pineconeHost = result.pineconeHost;

        // Validate and normalize the host URL
        if (this.pineconeHost) {
            this.pineconeHost = this.normalizePineconeHost(this.pineconeHost);
        }

        if (!this.geminiApiKey || !this.pineconeApiKey || !this.pineconeHost) {
            throw new Error('API keys and Pinecone host URL not configured. Please check extension options.');
        }

        this.initialized = true;
        console.log('🔧 Embedding service initialized');
        console.log('🎯 Pinecone host:', this.pineconeHost);
    }

    /**
     * Normalize and validate Pinecone host URL
     */
    normalizePineconeHost(hostUrl) {
        try {
            // Remove trailing slashes
            hostUrl = hostUrl.trim().replace(/\/+$/, '');
            
            // Add https:// if missing
            if (!hostUrl.startsWith('http://') && !hostUrl.startsWith('https://')) {
                hostUrl = 'https://' + hostUrl;
            }
            
            // Validate URL format
            const url = new URL(hostUrl);
            if (!url.hostname.includes('pinecone.io')) {
                console.warn('⚠️ Host URL does not appear to be a Pinecone URL:', hostUrl);
            }
            
            return hostUrl;
        } catch (error) {
            throw new Error(`Invalid Pinecone host URL format: ${hostUrl}. Please provide a valid URL like: https://your-index-abc123.svc.pinecone.io`);
        }
    }

    /**
     * Make authenticated request to Pinecone
     */
    async makePineconeRequest(endpoint, method = 'GET', body = null) {
        if (!this.initialized) await this.initialize();

        const url = `${this.pineconeHost}${endpoint}`;
        
        const options = {
            method,
            headers: {
                'Api-Key': this.pineconeApiKey,
                'Content-Type': 'application/json'
            }
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(body);
        }

        try {
            console.log(`🔗 Pinecone ${method} ${url}`);
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `Pinecone ${method} failed: ${response.status} ${response.statusText}`;
                
                // Enhanced error messages
                switch (response.status) {
                    case 400:
                        errorMessage = `Bad Request: Invalid request format or parameters. ${errorText}`;
                        break;
                    case 401:
                        errorMessage = `Authentication failed: Please check your Pinecone API key.`;
                        break;
                    case 403:
                        errorMessage = `Access denied: API key doesn't have permission for this operation.`;
                        break;
                    case 404:
                        errorMessage = `Not found: Please verify your Pinecone host URL is correct. Expected format: https://your-index-abc123.svc.pinecone.io`;
                        break;
                    case 429:
                        errorMessage = `Rate limit exceeded: Please wait before making more requests.`;
                        break;
                    case 500:
                        errorMessage = `Pinecone server error: ${errorText}`;
                        break;
                    default:
                        errorMessage += `. Response: ${errorText}`;
                }
                
                throw new Error(errorMessage);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return { success: true };

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error(`Network error: Cannot connect to ${url}. Please check your internet connection and Pinecone host URL.`);
            }
            throw error;
        }
    }

    /**
     * Create embedding using Gemini API
     */
    async createEmbedding(text) {
        if (!this.initialized) await this.initialize();

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: "models/text-embedding-004",
                    content: {
                        parts: [{
                            text: text
                        }]
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.embedding.values;

        } catch (error) {
            console.error('❌ Embedding creation error:', error);
            throw error;
        }
    }

    /**
     * Upsert vectors to Pinecone
     */
    async upsertVectors(vectors, namespace = '') {
        try {
            const payload = {
                vectors: vectors
            };
            
            if (namespace) {
                payload.namespace = namespace;
            }

            const result = await this.makePineconeRequest('/vectors/upsert', 'POST', payload);
            console.log(`✅ Upserted ${vectors.length} vectors${namespace ? ` to namespace: ${namespace}` : ''}`);
            return result;

        } catch (error) {
            console.error('❌ Upsert error:', error);
            throw error;
        }
    }

    /**
     * Query vectors from Pinecone
     */
    async queryVectors(vector, options = {}) {
        try {
            const payload = {
                vector: vector,
                topK: options.topK || 5,
                includeMetadata: options.includeMetadata !== false,
                includeValues: options.includeValues || false
            };

            if (options.namespace) {
                payload.namespace = options.namespace;
            }

            if (options.filter) {
                payload.filter = options.filter;
            }

            const result = await this.makePineconeRequest('/query', 'POST', payload);
            console.log(`🔍 Query returned ${result.matches?.length || 0} matches`);
            return result.matches || [];

        } catch (error) {
            console.error('❌ Query error:', error);
            throw error;
        }
    }

    /**
     * Delete vectors from Pinecone
     */
    async deleteVectors(options = {}) {
        try {
            const payload = {};

            // Delete by IDs
            if (options.ids && Array.isArray(options.ids) && options.ids.length > 0) {
                payload.ids = options.ids;
            }
            
            // Delete all vectors in a namespace
            else if (options.deleteAll) {
                payload.deleteAll = true;
            }
            
            // Delete by filter
            else if (options.filter) {
                payload.filter = options.filter;
            }
            
            else {
                throw new Error('Delete operation requires either: ids array, deleteAll: true, or filter object');
            }

            // Add namespace if specified
            if (options.namespace) {
                payload.namespace = options.namespace;
            }

            const result = await this.makePineconeRequest('/vectors/delete', 'POST', payload);
            
            let logMessage = '🗑️ Vectors deleted';
            if (options.ids) logMessage += ` (${options.ids.length} IDs)`;
            if (options.deleteAll) logMessage += ' (all vectors)';
            if (options.namespace) logMessage += ` from namespace: ${options.namespace}`;
            
            console.log(logMessage);
            return result;

        } catch (error) {
            console.error('❌ Delete error:', error);
            throw error;
        }
    }

    /**
     * Get index stats
     */
    async getIndexStats() {
        try {
            const result = await this.makePineconeRequest('/describe_index_stats', 'POST', {});
            console.log('📊 Index stats retrieved');
            return result;

        } catch (error) {
            console.error('❌ Stats error:', error);
            throw error;
        }
    }

    /**
     * List vectors (if supported by your Pinecone plan)
     */
    async listVectors(namespace = '', limit = 100) {
        try {
            const payload = {
                limit: limit
            };
            
            if (namespace) {
                payload.namespace = namespace;
            }

            const result = await this.makePineconeRequest('/vectors/list', 'GET');
            console.log(`📋 Listed ${result.vectors?.length || 0} vectors`);
            return result.vectors || [];

        } catch (error) {
            // List endpoint might not be available on all plans
            if (error.message.includes('404')) {
                console.warn('⚠️ List vectors endpoint not available on your Pinecone plan');
                return [];
            }
            console.error('❌ List error:', error);
            throw error;
        }
    }

    /**
     * Clear entire index (delete all vectors)
     */
    async clearPineconeIndex(namespace = '') {
        try {
            console.log('🗑️ Clearing Pinecone index...');
            
            // Try to delete all vectors
            const result = await this.deleteVectors({
                deleteAll: true,
                namespace: namespace
            });
            
            console.log('✅ Pinecone index cleared successfully');
            return { success: true, deletedCount: 'all' };

        } catch (error) {
            console.error('❌ Error clearing Pinecone index:', error);
            
            // Fallback: try to get stats and delete by listing
            try {
                console.log('🔄 Trying alternative deletion method...');
                const stats = await this.getIndexStats();
                
                if (stats.totalVectorCount > 0) {
                    console.warn('⚠️ Alternative deletion not implemented. Please clear manually or use deleteAll: true');
                }
                
                return { success: false, error: error.message };
                
            } catch (fallbackError) {
                console.error('❌ Fallback deletion also failed:', fallbackError);
                return { success: false, error: error.message };
            }
        }
    }

    /**
     * Upload webpage content (main integration function)
     */
    async uploadWebpage(ragData) {
        if (!this.initialized) await this.initialize();

        try {
            if (!ragData?.suitable) {
                return { success: false, reason: 'Not suitable for RAG' };
            }

            const totalWords = ragData.totalWords || 0;
            
            // If content is less than 200 words, don't store in Pinecone
            if (totalWords < 500) {
                console.log(`📄 Content too small (${totalWords} words), using direct context`);
                return { 
                    success: false, 
                    reason: 'Content too small for storage',
                    useDirectContext: true,
                    content: ragData 
                };
            }

            // Clear existing data first (for free tier)
            const clearResult = await this.clearPineconeIndex();
            if (!clearResult.success) {
                console.warn('⚠️ Failed to clear index, continuing anyway...');
            }

            const vectors = [];
            const chunks = ragData.chunks || [];
            console.log(`Processing ${chunks.length} chunks from ${ragData.metadata.url}`);

            // Process chunks into vectors
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                if (chunk.content.length < 50) continue;

                try {
                    const embedding = await this.createEmbedding(chunk.content);
                    vectors.push({
                        id: `${ragData.metadata.domain}_${i}_${Date.now()}`,
                        values: embedding,
                        metadata: {
                            text: chunk.content,
                            url: ragData.metadata.url,
                            title: ragData.metadata.title,
                            domain: ragData.metadata.domain,
                            type: chunk.type
                        }
                    });
                    
                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                    console.log(`📊 Processed chunk ${i + 1}/${chunks.length}`);
                    
                } catch (err) {
                    console.log(`⚠️ Skipped chunk ${i}:`, err.message);
                }
            }

            if (vectors.length > 0) {
                // Upload vectors in batches
                const batchSize = 10;
                for (let i = 0; i < vectors.length; i += batchSize) {
                    const batch = vectors.slice(i, i + batchSize);
                    
                    await this.upsertVectors(batch);
                    
                    console.log(`📤 Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
                    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
                }
            }

            console.log(`✅ Stored ${vectors.length} chunks from webpage`);
            return { 
                success: true, 
                stored: vectors.length, 
                url: ragData.metadata.url,
                useDirectContext: false 
            };

        } catch (error) {
            console.error('❌ Upload error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search similar chunks (main query function)
     */
    async searchSimilarChunks(queryText, topK = 5, namespace = '') {
        if (!this.initialized) await this.initialize();

        try {
            // Create embedding for the query
            const queryEmbedding = await this.createEmbedding(queryText);

            // Query similar vectors
            const matches = await this.queryVectors(queryEmbedding, {
                topK: topK,
                namespace: namespace,
                includeMetadata: true,
                includeValues: false
            });

            return matches;

        } catch (error) {
            console.error('❌ Search error:', error);
            throw error;
        }
    }
}

// Create singleton instance
const embeddingService = new BrowserEmbeddingService();

// Chrome extension message listener
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'uploadWebpage') {
            embeddingService.uploadWebpage(request.ragData).then(sendResponse);
            return true;
        }
        
        if (request.action === 'searchSimilar') {
            embeddingService.searchSimilarChunks(
                request.query, 
                request.topK, 
                request.namespace
            ).then(sendResponse);
            return true;
        }
        
        if (request.action === 'clearIndex') {
            embeddingService.clearPineconeIndex(request.namespace).then(sendResponse);
            return true;
        }
        
        if (request.action === 'deleteVectors') {
            embeddingService.deleteVectors(request.options).then(sendResponse);
            return true;
        }
        
        if (request.action === 'getIndexStats') {
            embeddingService.getIndexStats().then(sendResponse);
            return true;
        }
        
        if (request.action === 'upsertVectors') {
            embeddingService.upsertVectors(
                request.vectors, 
                request.namespace
            ).then(sendResponse);
            return true;
        }
    });
}