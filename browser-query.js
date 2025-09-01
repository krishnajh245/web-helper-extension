class BrowserQueryService {
    constructor() {
        this.geminiApiKey = null;
        this.queryHistory = [];
        this.currentPageContext = null;
        this.initialized = false;
    }

    async initialize() {
        const result = await chrome.storage.local.get(['geminiApiKey', 'queryHistory']);
        
        this.geminiApiKey = result.geminiApiKey;
        this.queryHistory = result.queryHistory || [];

        if (!this.geminiApiKey) {
            throw new Error('Gemini API key not configured');
        }

        this.initialized = true;
        console.log('🧠 Query service initialized');
    }

    async processUserQuery(userQuery, directContent = null) {
        if (!this.initialized) await this.initialize();

        try {
            if (directContent) {
                console.log('🎯 Using direct content for small page');
                return await this.processDirectContent(userQuery, directContent);
            }

            if (this.currentPageContext) {
                console.log('📄 Using stored page context');
                return await this.processDirectContent(userQuery, this.currentPageContext);
            }

            console.log('🔍 Searching  for relevant content');
            return await this.searchPinecone(userQuery);

        } catch (err) {
            console.error("Query error:", err);
            return this.storeAndReturn(userQuery, "Error processing your query: " + err.message, []);
        }
    }

    async processDirectContent(userQuery, content) {
        try {
            let context = '';
            
            if (content.chunks && content.chunks.length > 0) {
                const maxChunks = 8;
                context = content.chunks
                    .slice(0, maxChunks)
                    .map((chunk, i) => `[Chunk ${i + 1}] ${chunk.content}`)
                    .join('\n\n');
            }

            if (!context) {
                return this.storeAndReturn(userQuery, "Sorry no relevant information was found.", []);
            }

            const prompt = `Based on the following content from the webpage "${content.metadata?.title || 'Current Page'}", please answer the user's question accurately and helpfully.

WEBPAGE CONTENT:
${context}

USER QUESTION: ${userQuery}

Please provide a comprehensive answer based only on the provided content. If the content doesn't contain enough information to fully answer the question,Please try to answer as best as you can based on the available information. or send a polite message indicating that make the query based on the webpage content.`;

            const answer = await this.callGeminiAPI(prompt);

            const sources = [{
                metadata: {
                    url: content.metadata?.url || 'Current Page',
                    title: content.metadata?.title || 'Current Page',
                    domain: content.metadata?.domain || 'current'
                },
                score: 1.0
            }];

            return this.storeAndReturn(userQuery, answer, sources);

        } catch (err) {
            console.error("Direct content processing error:", err);
            return this.storeAndReturn(userQuery, "Error processing the page content: " + err.message, []);
        }
    }

    async searchPinecone(userQuery) {
        try {
            const matches = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'searchSimilar',
                    query: userQuery,
                    topK: 5
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (!matches || matches.length === 0) {
                return this.storeAndReturn(
                    userQuery, 
                    "No relevant information found in your browsed pages. Try extracting content from a page first by clicking the 'Extract' button.", 
                    []
                );
            }

            const context = matches
                .map((match, i) => 
                    `[Source ${i + 1}] From "${match.metadata.title}" (${match.metadata.domain}):\n${match.metadata.text}`
                )
                .join('\n\n');

            const prompt = `Answer the following question using ONLY the context provided from previously browsed web pages. If the context doesn't contain enough information to answer the question, say so clearly.

CONTEXT FROM BROWSED PAGES:
${context}

USER QUESTION: ${userQuery}

Please provide a helpful answer based on the provided context, and mention which sources you're drawing from.`;

            const answer = await this.callGeminiAPI(prompt);

            return this.storeAndReturn(userQuery, answer, matches);

        } catch (err) {
            console.error("Pinecone search error:", err);
            return this.storeAndReturn(userQuery, "Error searching your browsed pages: " + err.message, []);
        }
    }

    async callGeminiAPI(prompt) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 400) {
                    throw new Error('Invalid API request. Please check your API key.');
                } else if (response.status === 429) {
                    throw new Error('API quota exceeded. Please try again later.');
                } else {
                    throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
                }
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0]) {
                throw new Error('No response generated. Content may have been filtered.');
            }

            const generatedText = data.candidates[0].content.parts[0].text;
            
            if (!generatedText) {
                throw new Error('Empty response from AI. Please try rephrasing your question.');
            }

            return generatedText;

        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    }

    setCurrentPageContext(content) {
        this.currentPageContext = content;
        console.log('💾 Stored current page context for direct queries');
    }

    clearCurrentPageContext() {
        this.currentPageContext = null;
        console.log('🗑️ Cleared current page context');
    }

    storeAndReturn(query, answer, sources) {
        const entry = {
            query,
            answer,
            sources: sources.map(s => ({
                url: s.metadata?.url,
                title: s.metadata?.title,
                score: s.score || 1.0
            })),
            timestamp: new Date().toISOString()
        };

        this.queryHistory.unshift(entry);
        if (this.queryHistory.length > 50) this.queryHistory.pop();

        chrome.storage.local.set({ queryHistory: this.queryHistory });

        return entry;
    }
}

const queryService = new BrowserQueryService();

if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'processQuery') {
            queryService.processUserQuery(request.query, request.directContent).then(sendResponse);
            return true;
        }
        
        if (request.action === 'setPageContext') {
            queryService.setCurrentPageContext(request.content);
            sendResponse({ success: true });
            return true;
        }
        
        if (request.action === 'clearPageContext') {
            queryService.clearCurrentPageContext();
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'getHistory') {
            sendResponse({ history: queryService.queryHistory });
            return true;
        }
    });
}

window.queryService = queryService;