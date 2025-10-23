document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('upload-form');
    const imageInput = document.getElementById('image');
    const spinner = document.getElementById('loading-spinner');
    const resultContainer = document.getElementById('result-container');
    const resultContent = document.getElementById('result-content');
    const submitButton = document.getElementById('submit-button');
    const countdownElement = document.getElementById('countdown-timer');
    
    let socket;
    let countdownInterval;
    let timeLeft = 60;
    const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws_route = '/ws/nutrition-analysis/';
    
    // Create WebSocket connection
    function createSocket() {
        socket = new WebSocket(`${ws_scheme}://${window.location.host}${ws_route}`);
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleSocketMessage(data);
        };
        
        socket.onerror = () => {
            alert("Connection error. Please try again.");
            submitButton.disabled = false;
            spinner.style.display = 'none';
        };
        
        socket.onclose = () => {
            socket = null;
        };
    }
    
    // Initialize WebSocket
    createSocket();
    
    // Handle form submission
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const file = imageInput.files[0];
        if (!file) {
            alert("Please upload an image.");
            return;
        }
        
        submitButton.disabled = true;
        spinner.style.display = 'block';
        resultContainer.style.display = 'none';
        
        const requestId = generateId();
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/upload-image/', {
                method: 'POST',
                headers: { 'X-CSRFToken': getCSRFToken() },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success && data.filename) {
                const payload = {
                    id: requestId,
                    image_filename: data.filename
                };
                
                // Send via WebSocket
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(payload));
                } else {
                    // Reconnect and send
                    createSocket();
                    socket.addEventListener('open', () => {
                        socket.send(JSON.stringify(payload));
                    }, { once: true });
                }
                
                // Start countdown timer
                timeLeft = 60;
                clearInterval(countdownInterval);
                countdownElement.textContent = `Estimated time: ${formatTime(timeLeft)}`;
                countdownInterval = setInterval(() => {
                    timeLeft--;
                    if (timeLeft <= 0) {
                        clearInterval(countdownInterval);
                        countdownElement.textContent = "Still processing... please wait a bit longer!";
                    } else {
                        countdownElement.textContent = `Estimated time: ${formatTime(timeLeft)}`;
                    }
                }, 1000);
            } else {
                alert("Image upload failed. Please try again.");
                submitButton.disabled = false;
                spinner.style.display = 'none';
            }
        } catch (error) {
            alert("Something went wrong. Please try again.");
            submitButton.disabled = false;
            spinner.style.display = 'none';
            clearInterval(countdownInterval);
            countdownElement.textContent = '';
        }
    });
    
    // Handle WebSocket messages
    function handleSocketMessage(data) {
        clearInterval(countdownInterval);
        countdownElement.textContent = '';
        
        if (data.analysis_result) {
            spinner.style.display = 'none';
            displayResult(data.analysis_result);
        } else if (data.error) {
            spinner.style.display = 'none';
            alert(data.error);
        } else if (data.received) {
            // Just a receipt, do nothing
            return;
        }
        
        submitButton.disabled = false;
    }
    
    // Display analysis results
    function displayResult(result) {
        resultContainer.style.display = 'block';
        resultContent.innerHTML = '';
        
        // Health score
        const healthScore = result.analysis.health_score;
        let scoreClass = 'score-poor';
        if (healthScore >= 80) scoreClass = 'score-excellent';
        else if (healthScore >= 60) scoreClass = 'score-good';
        else if (healthScore >= 40) scoreClass = 'score-fair';
        
        let html = `
            <div class="health-score ${scoreClass}">${healthScore}</div>
            <h3 class="text-center mb-4">Health Score</h3>
        `;
        
        // Product info
        if (result.product_info) {
            html += `
                <div class="analysis-section">
                    <h4><i class="bi bi-info-circle"></i> Product Information</h4>
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Brand:</strong> ${result.product_info.brand || 'N/A'}</p>
                            <p><strong>Serving Size:</strong> ${result.product_info.serving_size}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Calories:</strong> ${result.product_info.calories_per_serving} per serving</p>
                            ${result.product_info.claims && result.product_info.claims.length > 0 ? 
                                `<p><strong>Claims:</strong> ${result.product_info.claims.join(', ')}</p>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Nutrition facts
        if (result.nutrition_facts) {
            html += `
                <div class="analysis-section">
                    <h4><i class="bi bi-bar-chart"></i> Nutrition Facts</h4>
                    <div class="table-responsive">
                        <table class="nutrition-table">
                            <thead>
                                <tr>
                                    <th>Nutrient</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            for (const [key, value] of Object.entries(result.nutrition_facts)) {
                const label = formatNutrientLabel(key);
                html += `
                    <tr>
                        <td>${label}</td>
                        <td>${value}${getNutrientUnit(key)}</td>
                    </tr>
                `;
            }
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        // Ingredients
        if (result.ingredients && result.ingredients.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="bi bi-list-ul"></i> Ingredients</h4>
                    <p>${result.ingredients.join(', ')}</p>
                </div>
            `;
        }
        
        // Notable ingredients
        if (result.notable_ingredients && result.notable_ingredients.length > 0) {
            html += `
                <div class="analysis-section">
                    <h4><i class="bi bi-exclamation-triangle"></i> Notable Ingredients</h4>
                    <div>
            `;
            
            result.notable_ingredients.forEach(ingredient => {
                const isConcerning = isIngredientConcerning(ingredient);
                html += `
                    <span class="ingredient-tag ${isConcerning ? 'ingredient-concerning' : 'ingredient-healthy'}">
                        ${ingredient}
                    </span>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Analysis
        if (result.analysis) {
            html += `
                <div class="analysis-section">
                    <h4><i class="bi bi-clipboard-check"></i> Analysis</h4>
                    <div class="row">
                        <div class="col-md-6">
                            <h5 class="text-success">Positive Aspects</h5>
                            <ul class="positive-list">
            `;
            
            result.analysis.positive_aspects.forEach(aspect => {
                html += `<li>${aspect}</li>`;
            });
            
            html += `
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h5 class="text-danger">Negative Aspects</h5>
                            <ul class="negative-list">
            `;
            
            result.analysis.negative_aspects.forEach(aspect => {
                html += `<li>${aspect}</li>`;
            });
            
            html += `
                            </ul>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h5>Summary</h5>
                        <div class="alert alert-info">
                            ${result.analysis.summary}
                        </div>
                    </div>
                </div>
            `;
        }
        
        resultContent.innerHTML = html;
        
        // Scroll to results
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Helper functions
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
    
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    function getCSRFToken() {
        return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    }
    
    function formatNutrientLabel(key) {
        return key.replace(/_/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase())
                  .replace('Mg', 'mg')
                  .replace('G', 'g');
    }
    
    function getNutrientUnit(key) {
        if (key.includes('mg')) return 'mg';
        if (key.includes('g')) return 'g';
        return '';
    }
    
    function isIngredientConcerning(ingredient) {
        const concerning = [
            'sugar', 'high fructose', 'corn syrup', 'palm oil', 'hydrogenated',
            'artificial', 'preservative', 'color', 'sweetener', 'sodium nitrite'
        ];
        return concerning.some(term => ingredient.toLowerCase().includes(term));
    }
});
