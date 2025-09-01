document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('settingsForm');
    const statusDiv = document.getElementById('statusMessage');
    const showKeysToggle = document.getElementById('showKeys');
    const testBtn = document.getElementById('testBtn');

    // for saved settings
    chrome.storage.local.get([
        'geminiApiKey', 
        'pineconeApiKey', 
        'pineconeHost'
    ], function(result) {
        if (result.geminiApiKey) document.getElementById('geminiKey').value = result.geminiApiKey;
        if (result.pineconeApiKey) document.getElementById('pineconeKey').value = result.pineconeApiKey;
        if (result.pineconeHost) document.getElementById('pineconeHost').value = result.pineconeHost;
    });

    // Toggle 
    showKeysToggle.addEventListener('change', function() {
        const keyInputs = document.querySelectorAll('input[type="password"]');
        keyInputs.forEach(input => {
            input.type = this.checked ? 'text' : 'password';
        });
    });

    // placeholder
    const hostInput = document.getElementById('pineconeHost');
    if (hostInput) {
        hostInput.placeholder = 'https://your-index-abc123.svc.pinecone.io';
        
        
        hostInput.addEventListener('input', function() {
            const value = this.value.trim();
            if (!value) {
                this.style.borderColor = '';
                return;
            }
            
            try {
                const url = new URL(value.startsWith('http') ? value : 'https://' + value);
                if (url.hostname.includes('pinecone.io')) {
                    this.style.borderColor = '#48bb78'; 
                } else {
                    this.style.borderColor = '#f56565'; 
                }
            } catch {
                this.style.borderColor = '#f56565'; 
            }
        });
    }

    // Save 
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const settings = {
            geminiApiKey: document.getElementById('geminiKey').value.trim(),
            pineconeApiKey: document.getElementById('pineconeKey').value.trim(),
            pineconeHost: document.getElementById('pineconeHost').value.trim()
        };

        //  validation
        if (!settings.geminiApiKey || !settings.pineconeApiKey || !settings.pineconeHost) {
            showStatus('Please fill in all required fields.', 'error');
            return;
        }

      
        try {
            let hostUrl = settings.pineconeHost;
            if (!hostUrl.startsWith('http://') && !hostUrl.startsWith('https://')) {
                hostUrl = 'https://' + hostUrl;
                settings.pineconeHost = hostUrl;
            }
            
            const url = new URL(hostUrl);
            if (!url.hostname.includes('pinecone.io')) {
                showStatus('⚠️ Host URL should be a Pinecone URL (contains pinecone.io)', 'warning');
                return;
            }
            
        } catch (error) {
            showStatus('❌ Invalid host URL format. Expected: https://your-index-abc123.svc.pinecone.io', 'error');
            return;
        }

        chrome.storage.local.set(settings, function() {
            if (chrome.runtime.lastError) {
                showStatus(' Failed to save settings: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus(' Settings saved successfully! You can now use the extension.', 'success');
                
               
                document.getElementById('pineconeHost').value = settings.pineconeHost;
            }
        });
        console.log('Settings saved:', settings);
    });

    // Test 
    testBtn.addEventListener('click', async function() {
        const geminiKey = document.getElementById('geminiKey').value.trim();
        const pineconeKey = document.getElementById('pineconeKey').value.trim();
        const pineconeHost = document.getElementById('pineconeHost').value.trim();

        if (!geminiKey || !pineconeKey || !pineconeHost) {
            showStatus('Please enter all required fields first.', 'error');
            return;
        }

        testBtn.textContent = '🔄 Testing...';
        testBtn.disabled = true;

        let geminiOk = false;
        let pineconeOk = false;

        try {
            
            showStatus(' Testing Gemini API...', 'info');
            const geminiTest = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + geminiKey);
            
            if (geminiTest.ok) {
                geminiOk = true;
                showStatus('Gemini API: OK', 'success');
            } else {
                const geminiError = await geminiTest.text();
                showStatus(` Gemini API failed (${geminiTest.status}): ${geminiError.slice(0, 100)}`, 'error');
            }

            
            showStatus(' Testing Pinecone connection...', 'info');
            
         
            let hostUrl = pineconeHost;
            if (!hostUrl.startsWith('http://') && !hostUrl.startsWith('https://')) {
                hostUrl = 'https://' + hostUrl;
            }
            
            const pineconeTest = await fetch(`${hostUrl}/describe_index_stats`, {
                method: 'POST',
                headers: {
                    'Api-Key': pineconeKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            if (pineconeTest.ok) {
                pineconeOk = true;
                const stats = await pineconeTest.json();
                showStatus(` Pinecone connection: OK (${stats.totalVectorCount || 0} vectors in index)`, 'success');
            } else {
                const pineconeError = await pineconeTest.text();
                let errorMsg = ` Pinecone connection failed (${pineconeTest.status})`;
                
                if (pineconeTest.status === 404) {
                    errorMsg += ': Index not found. Please verify your host URL.';
                } else if (pineconeTest.status === 401 || pineconeTest.status === 403) {
                    errorMsg += ': Authentication failed. Please check your API key.';
                } else {
                    errorMsg += `: ${pineconeError.slice(0, 100)}`;
                }
                
                showStatus(errorMsg, 'error');
            }

            
            if (geminiOk && pineconeOk) {
                showStatus(' All connections successful! Extension is ready to use.', 'success');
            } else if (geminiOk || pineconeOk) {
                showStatus(' Partial success. Please check the failed connections above.', 'warning');
            } else {
                showStatus(' All connections failed. Please verify your settings.', 'error');
            }

        } catch (error) {
            console.error('Test error:', error);
            let errorMessage = ' Connection test failed: ';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage += 'Network error. Please check your internet connection.';
            } else {
                errorMessage += error.message;
            }
            
            showStatus(errorMessage, 'error');
        } finally {
            testBtn.textContent = '🧪 Test Connection';
            testBtn.disabled = false;
        }
    });

    function showStatus(message, type) {
        const typeColors = {
            'success': '#48bb78',
            'error': '#f56565', 
            'warning': '#ed8936',
            'info': '#4299e1'
        };
        
        const typeIcons = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': '🔍'
        };

        statusDiv.innerHTML = `
            <div style="
                padding: 12px 16px; 
                border-radius: 6px; 
                background: ${typeColors[type] || '#4299e1'}15; 
                border-left: 4px solid ${typeColors[type] || '#4299e1'};
                color: ${typeColors[type] || '#4299e1'};
                font-size: 14px;
                margin: 10px 0;
            ">
                ${typeIcons[type] || 'ℹ️'} ${message}
            </div>
        `;
        
        // Auto-clear success messages after 8 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (statusDiv.innerHTML.includes(message.slice(0, 20))) {
                    statusDiv.innerHTML = '';
                }
            }, 8000);
        }
    }
});