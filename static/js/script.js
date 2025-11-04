document.addEventListener('DOMContentLoaded', () => {

    const howItWorksModal = document.getElementById('howItWorksModal');
    
    if (howItWorksModal) {
        howItWorksModal.addEventListener('show.bs.modal', function() {
            // Add animation class when modal is shown
            setTimeout(() => {
                const modalImage = howItWorksModal.querySelector('.how-it-works-image-container img');
                if (modalImage) {
                    modalImage.classList.add('animate__animated', 'animate__fadeIn');
                }
            }, 100);
        });
        
        howItWorksModal.addEventListener('hidden.bs.modal', function() {
            // Remove animation class when modal is hidden
            const modalImage = howItWorksModal.querySelector('.how-it-works-image-container img');
            if (modalImage) {
                modalImage.classList.remove('animate__animated', 'animate__fadeIn');
            }
        });
    }

    // Initialize components
    const form = document.getElementById('upload-form');
    const imageInput = document.getElementById('image');
    const uploadArea = document.getElementById('upload-area');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const previewName = document.getElementById('preview-name');
    const previewSize = document.getElementById('preview-size');
    const removeImageBtn = document.getElementById('remove-image');
    const spinner = document.getElementById('loading-spinner');
    const resultContainer = document.getElementById('result-container');
    const resultContent = document.getElementById('result-content');
    const submitButton = document.getElementById('submit-button');
    const countdownElement = document.getElementById('countdown-timer');

    const cameraBtn = document.getElementById('camera-btn');
    const cameraView = document.getElementById('camera-view');
    const videoElement = document.getElementById('camera-video');
    const canvasElement = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const switchCameraBtn = document.getElementById('switch-camera-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');

    let currentStream = null;
    let currentFacingMode = 'environment'; // Start with back camera
    let devices = [];
    let capturedFile = null; // Store captured file globally
        
    let socket;
    let countdownInterval;
    let timeLeft = 60;
    const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws_route = '/ws/nutrition-analysis/';

    // Check if browser supports camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        cameraBtn.style.display = 'inline-flex';
    } else {
        cameraBtn.style.display = 'none';
    }
    
    // Initialize WebSocket connection
    function createSocket() {
        socket = new WebSocket(`${ws_scheme}://${window.location.host}${ws_route}`);
        
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleSocketMessage(data);
        };
        
        socket.onerror = () => {
            showNotification("Connection error. Please try again.", "danger");
            submitButton.disabled = false;
            spinner.style.display = 'none';
        };
        
        socket.onclose = () => {
            socket = null;
        };
    }
    
    // Initialize WebSocket
    createSocket();
    
    // Drag and drop functionality
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        uploadArea.classList.add('highlight');
    }
    
    function unhighlight() {
        uploadArea.classList.remove('highlight');
    }
    
    uploadArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            imageInput.files = files;
            handleFiles(files);
        }
    }
    
    // File input change handler
    imageInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFiles(this.files);
        }
    });
    
    // Handle file selection
    function handleFiles(files) {
        const file = files[0];
        
        // Check file type
        if (!file.type.match('image.*')) {
            showNotification('Please upload an image file (JPG, PNG).', 'danger');
            return;
        }
        
        // Check file size (8MB max)
        if (file.size > 8 * 1024 * 1024) {
            showNotification('File size exceeds the 8MB limit.', 'danger');
            return;
        }
        
        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            previewName.textContent = file.name;
            previewSize.textContent = formatFileSize(file.size);
            uploadArea.style.display = 'none';
            previewContainer.style.display = 'flex';
            
            // Store the file for later use
            capturedFile = file;
        };
        reader.readAsDataURL(file);
    }
    
    // Remove image handler
    removeImageBtn.addEventListener('click', function() {
        imageInput.value = '';
        uploadArea.style.display = 'block';
        previewContainer.style.display = 'none';
        
        // Clear captured file
        capturedFile = null;
        
        // Also stop camera if it's active
        if (cameraView.style.display !== 'none') {
            stopCameraStream();
            cameraView.style.display = 'none';
        }
    });
    
    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Handle form submission
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // Get file from either input or captured file
        let file = imageInput.files[0] || capturedFile;
        
        if (!file) {
            showNotification("Please upload an image.", "warning");
            return;
        }
        
        submitButton.disabled = true;
        spinner.style.display = 'block';
        resultContainer.style.display = 'none';
        
        const requestId = generateId();
        const formData = new FormData();
        formData.append('image', file);
        formData.append('csrfmiddlewaretoken', getCSRFToken());
        
        try {
            const response = await fetch('/upload-image/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': getCSRFToken()
                }
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
                // Handle rate limiting error specifically (HTTP 429)
                if (response.status === 429 || (data.error && data.error.includes('Rate limit exceeded'))) {
                    const retryAfter = data.retry_after || 60;
                    showNotification(
                        `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`, 
                        "warning"
                    );
                    
                    // Update UI to show countdown
                    let retryTimeLeft = retryAfter;
                    submitButton.innerHTML = `<i class="fas fa-clock"></i> Try again in ${retryTimeLeft}s`;
                    
                    const retryInterval = setInterval(() => {
                        retryTimeLeft--;
                        if (retryTimeLeft <= 0) {
                            clearInterval(retryInterval);
                            submitButton.innerHTML = '<i class="fas fa-magic me-2"></i> Analyze Nutrition';
                            submitButton.disabled = false;
                        } else {
                            submitButton.innerHTML = `<i class="fas fa-clock"></i> Try again in ${retryTimeLeft}s`;
                        }
                    }, 1000);
                } else {
                    // Handle other errors
                    showNotification(data.error || "Image upload failed. Please try again.", "danger");
                    submitButton.disabled = false;
                }
                
                spinner.style.display = 'none';
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification("Something went wrong. Please try again.", "danger");
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
            showNotification(data.error, "danger");
        } else if (data.received) {
            // Just a receipt, do nothing
            return;
        }
        
        submitButton.disabled = false;
    }
    
    // Helper function to ensure array or convert to array
    function ensureArray(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (value === null || value === undefined) {
            return [];
        }
        return [value];
    }
    
    // Display analysis results with enhanced card design
    function displayResult(result) {
        // Safety check for result object
        if (!result) {
            showNotification("No analysis data available", "warning");
            return;
        }
        
        resultContainer.style.display = 'block';
        resultContent.innerHTML = '';
        
        // Safely access nested properties
        const productInfo = result.product_info || {};
        const analysis = result.analysis || {};
        const nutritionFacts = result.nutrition_facts || {};
        const processingAnalysis = result.processing_analysis || {};
        const recommendations = analysis.recommendations || {};
        const sugarAnalysis = result.sugar_analysis || {};
        const contaminationRisks = result.contamination_risks || {};
        const detailedIngredientAnalysis = ensureArray(result.detailed_ingredient_analysis);
        const additiveImpact = ensureArray(result.additive_impact);
        const environmentalImpact = result.environmental_impact || {};
        
        // Determine score class and label
        const healthScore = analysis.health_score || 0;
        let scoreClass = 'score-poor';
        let scoreLabel = 'Poor';
        let takeawayClass = 'takeaway-poor';
        
        if (healthScore >= 80) {
            scoreClass = 'score-excellent';
            scoreLabel = 'Excellent';
            takeawayClass = 'takeaway-excellent';
        } else if (healthScore >= 60) {
            scoreClass = 'score-good';
            scoreLabel = 'Good';
            takeawayClass = 'takeaway-good';
        } else if (healthScore >= 40) {
            scoreClass = 'score-fair';
            scoreLabel = 'Fair';
            takeawayClass = 'takeaway-fair';
        }
        
        // Create enhanced card HTML
        let html = `
            <div class="enhanced-result-card" id="enhanced-result-card">
                <!-- Header Section -->
                <div class="card-header-section">
                    <div class="product-info">
                        ${productInfo.brand ? `<h3 class="product-brand">${productInfo.brand}</h3>` : ''}
                        <div class="product-meta">
                            ${productInfo.serving_size ? `<span class="serving-size"><i class="fas fa-utensils"></i> ${productInfo.serving_size}</span>` : ''}
                            ${productInfo.calories_per_serving ? `<span class="calories"><i class="fas fa-fire"></i> ${productInfo.calories_per_serving} cal</span>` : ''}
                        </div>
                    </div>
                    <div class="health-score-container">
                        <div class="score-circle ${scoreClass}">${healthScore}</div>
                        <div class="score-label">Health Score: ${scoreLabel}</div>
                    </div>
                </div>
                
                <!-- Key Takeaways Section -->
                <div class="key-takeaways ${takeawayClass}">
                    <div class="section-title"><i class="fas fa-lightbulb"></i> Key Takeaways</div>
                    <p>${analysis.summary || 'No summary available'}</p>
                </div>
                
                <!-- Nutrition Highlights Section -->
                <div class="nutrition-highlights">
                    <div class="section-title"><i class="fas fa-chart-pie"></i> Nutrition Highlights</div>
                    <div class="nutrition-grid">
                        ${generateNutritionHighlights(nutritionFacts)}
                    </div>
                </div>
                
                <!-- Ingredients Section -->
                ${result.ingredients && ensureArray(result.ingredients).length > 0 ? `
                    <div class="ingredients-section">
                        <div class="section-title"><i class="fas fa-list-ul"></i> Ingredients</div>
                        <div class="ingredients-container">
                            <div class="ingredients-list">${ensureArray(result.ingredients).join(', ')}</div>
                            ${result.notable_ingredients && ensureArray(result.notable_ingredients).length > 0 ? `
                                <div class="notable-ingredients">
                                    <div class="notable-title">Notable Ingredients:</div>
                                    <div class="ingredients-tags">
                                        ${ensureArray(result.notable_ingredients).map(ingredient => {
                                            const isConcerning = isIngredientConcerning(ingredient);
                                            return `<span class="ingredient-tag ${isConcerning ? 'ingredient-concerning' : 'ingredient-healthy'}">${ingredient}</span>`;
                                        }).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Analysis Section -->
                <div class="analysis-section">
                    <div class="section-title"><i class="fas fa-balance-scale"></i> Product Analysis</div>
                    <div class="analysis-grid">
                        <div class="analysis-column">
                            <div class="analysis-positive">
                                <h5><i class="fas fa-check-circle"></i> Positive Aspects</h5>
                                <ul>
                                    ${ensureArray(analysis.positive_aspects).map(aspect => `<li>${aspect}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        <div class="analysis-column">
                            <div class="analysis-negative">
                                <h5><i class="fas fa-times-circle"></i> Negative Aspects</h5>
                                <ul>
                                    ${ensureArray(analysis.negative_aspects).map(aspect => `<li>${aspect}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Processing Analysis Section -->
                ${processingAnalysis.level ? `
                    <div class="processing-analysis-section">
                        <div class="section-title"><i class="fas fa-cogs"></i> Processing Analysis</div>
                        <div class="processing-info">
                            <div class="processing-level ${processingAnalysis.level.toLowerCase().replace(' ', '-')}">${processingAnalysis.level}</div>
                            <p>${processingAnalysis.health_implications || 'No information available'}</p>
                            ${processingAnalysis.indicators && ensureArray(processingAnalysis.indicators).length > 0 ? `
                                <div class="processing-indicators">
                                    <strong>Indicators:</strong>
                                    <ul>
                                        ${ensureArray(processingAnalysis.indicators).map(indicator => `<li>${indicator}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Recommendations Section -->
                ${recommendations.consumption_frequency || (recommendations.healthier_alternatives && ensureArray(recommendations.healthier_alternatives).length > 0) ? `
                    <div class="recommendations-section">
                        <div class="section-title"><i class="fas fa-thumbs-up"></i> Recommendations</div>
                        <div class="recommendations-container">
                            ${recommendations.consumption_frequency ? `
                                <div class="recommendation-item">
                                    <h6>Consumption Frequency</h6>
                                    <p>${recommendations.consumption_frequency}</p>
                                </div>
                            ` : ''}
                            
                            ${recommendations.healthier_alternatives && ensureArray(recommendations.healthier_alternatives).length > 0 ? `
                                <div class="recommendation-item">
                                    <h6>Healthier Alternatives</h6>
                                    <ul>
                                        ${ensureArray(recommendations.healthier_alternatives).map(alternative => `<li>${alternative}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Additional Analysis Sections (Collapsible) -->
                <div class="additional-analysis-section">
                    <div class="accordion" id="additionalAnalysisAccordion">
                        <!-- Sugar Analysis -->
                        ${sugarAnalysis.total_sugar_equivalents || sugarAnalysis.percent_of_daily_limit || (sugarAnalysis.hidden_sugars && ensureArray(sugarAnalysis.hidden_sugars).length > 0) ? `
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="sugarAnalysisHeading">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#sugarAnalysisCollapse">
                                        <i class="fas fa-cube"></i> Sugar Analysis
                                    </button>
                                </h2>
                                <div id="sugarAnalysisCollapse" class="accordion-collapse collapse" data-bs-parent="#additionalAnalysisAccordion">
                                    <div class="accordion-body">
                                        ${sugarAnalysis.total_sugar_equivalents ? `
                                            <p><strong>Total Sugar Equivalents:</strong> ${sugarAnalysis.total_sugar_equivalents}</p>
                                        ` : ''}
                                        ${sugarAnalysis.percent_of_daily_limit ? `
                                            <p><strong>Percent of Daily Limit:</strong> ${sugarAnalysis.percent_of_daily_limit}%</p>
                                        ` : ''}
                                        ${sugarAnalysis.hidden_sugars && ensureArray(sugarAnalysis.hidden_sugars).length > 0 ? `
                                            <div class="hidden-sugars">
                                                <strong>Hidden Sugars:</strong>
                                                <div class="sugar-tags">
                                                    ${ensureArray(sugarAnalysis.hidden_sugars).map(sugar => `<span class="sugar-tag">${sugar}</span>`).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Contamination Risks -->
                        ${contaminationRisks.microplastic_risk || contaminationRisks.pesticide_risk || (contaminationRisks.high_risk_ingredients && ensureArray(contaminationRisks.high_risk_ingredients).length > 0) ? `
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="contaminationRisksHeading">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#contaminationRisksCollapse">
                                        <i class="fas fa-exclamation-triangle"></i> Contamination Risks
                                    </button>
                                </h2>
                                <div id="contaminationRisksCollapse" class="accordion-collapse collapse" data-bs-parent="#additionalAnalysisAccordion">
                                    <div class="accordion-body">
                                        ${contaminationRisks.microplastic_risk ? `
                                            <div class="risk-item">
                                                <h6>Microplastic Risk</h6>
                                                <p>${contaminationRisks.microplastic_risk}</p>
                                            </div>
                                        ` : ''}
                                        
                                        ${contaminationRisks.pesticide_risk ? `
                                            <div class="risk-item">
                                                <h6>Pesticide Risk</h6>
                                                <p>${contaminationRisks.pesticide_risk}</p>
                                            </div>
                                        ` : ''}
                                        
                                        ${contaminationRisks.high_risk_ingredients && ensureArray(contaminationRisks.high_risk_ingredients).length > 0 ? `
                                            <div class="risk-item">
                                                <h6>High-Risk Ingredients</h6>
                                                <div class="risk-tags">
                                                    ${ensureArray(contaminationRisks.high_risk_ingredients).map(ingredient => `<span class="risk-tag">${ingredient}</span>`).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Detailed Ingredient Analysis -->
                        ${detailedIngredientAnalysis.length > 0 ? `
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="detailedIngredientsHeading">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#detailedIngredientsCollapse">
                                        <i class="fas fa-microscope"></i> Detailed Ingredient Analysis
                                    </button>
                                </h2>
                                <div id="detailedIngredientsCollapse" class="accordion-collapse collapse" data-bs-parent="#additionalAnalysisAccordion">
                                    <div class="accordion-body">
                                        ${detailedIngredientAnalysis.map((ingredient, index) => `
                                            <div class="detailed-ingredient">
                                                <h6>${ingredient.ingredient || 'Unknown ingredient'}</h6>
                                                <p><strong>Purpose:</strong> ${ingredient.purpose || 'No information available'}</p>
                                                <p><strong>Health Concerns:</strong></p>
                                                <ul>
                                                    ${ensureArray(ingredient.health_concerns).map(concern => `<li>${concern}</li>`).join('')}
                                                </ul>
                                                <p><strong>Industry Context:</strong> ${ingredient.industry_context || 'No information available'}</p>
                                                ${ingredient.hidden_names && ensureArray(ingredient.hidden_names).length > 0 ? `
                                                    <p><strong>Also Known As:</strong> ${ensureArray(ingredient.hidden_names).join(', ')}</p>
                                                ` : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Additive Impact -->
                        ${additiveImpact.length > 0 ? `
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="additiveImpactHeading">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#additiveImpactCollapse">
                                        <i class="fas fa-flask"></i> Additive Impact
                                    </button>
                                </h2>
                                <div id="additiveImpactCollapse" class="accordion-collapse collapse" data-bs-parent="#additionalAnalysisAccordion">
                                    <div class="accordion-body">
                                        ${additiveImpact.map(additive => `
                                            <div class="additive-card">
                                                <h6>${additive.additive || 'Unknown additive'}</h6>
                                                <p><strong>Function:</strong> ${additive.function || 'No information available'}</p>
                                                <p><strong>Health Impact:</strong> ${additive.health_impact || 'No information available'}</p>
                                                <p><strong>Regulatory Status:</strong> ${additive.regulatory_status || 'No information available'}</p>
                                                ${additive.natural_alternatives && ensureArray(additive.natural_alternatives).length > 0 ? `
                                                    <p><strong>Natural Alternatives:</strong> ${ensureArray(additive.natural_alternatives).join(', ')}</p>
                                                ` : ''}
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Environmental Impact -->
                        ${environmentalImpact.footprint || environmentalImpact.sustainability_concerns || environmentalImpact.certifications ? `
                            <div class="accordion-item">
                                <h2 class="accordion-header" id="environmentalImpactHeading">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#environmentalImpactCollapse">
                                        <i class="fas fa-leaf"></i> Environmental Impact
                                    </button>
                                </h2>
                                <div id="environmentalImpactCollapse" class="accordion-collapse collapse" data-bs-parent="#additionalAnalysisAccordion">
                                    <div class="accordion-body">
                                        ${environmentalImpact.footprint ? `
                                            <p><strong>Footprint:</strong> ${environmentalImpact.footprint}</p>
                                        ` : ''}
                                        ${environmentalImpact.sustainability_concerns && ensureArray(environmentalImpact.sustainability_concerns).length > 0 ? `
                                            <div class="sustainability-concerns">
                                                <strong>Sustainability Concerns:</strong>
                                                <ul>
                                                    ${ensureArray(environmentalImpact.sustainability_concerns).map(concern => `<li>${concern}</li>`).join('')}
                                                </ul>
                                            </div>
                                        ` : ''}
                                        ${environmentalImpact.certifications && ensureArray(environmentalImpact.certifications).length > 0 ? `
                                            <div class="certification-tags">
                                                <strong>Certifications:</strong>
                                                <div>
                                                    ${ensureArray(environmentalImpact.certifications).map(cert => `<span class="certification-tag">${cert}</span>`).join('')}
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Share Section -->
                <div class="share-section">
                    <button class="download-button" id="download-btn">
                        <i class="fas fa-download"></i> Download Analysis
                    </button>
                </div>
            </div>
        `;
        
        resultContent.innerHTML = html;
        
        // Add event listener for download button
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', handleDownload);
        }
        
        // Scroll to results
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Generate nutrition highlights HTML
    function generateNutritionHighlights(nutritionFacts) {
        if (!nutritionFacts) return '';
        
        const keyNutrients = [
            { key: 'calories_per_serving', label: 'Calories', icon: 'fire', unit: '' },
            { key: 'total_fat_g', label: 'Total Fat', icon: 'oil-can', unit: 'g' },
            { key: 'saturated_fat_g', label: 'Sat. Fat', icon: 'exclamation-triangle', unit: 'g' },
            { key: 'sodium_mg', label: 'Sodium', icon: 'prescription-bottle', unit: 'mg' },
            { key: 'total_carbohydrate_g', label: 'Carbs', icon: 'bread-slice', unit: 'g' },
            { key: 'total_sugars_g', label: 'Sugars', icon: 'candy-cane', unit: 'g' },
            { key: 'protein_g', label: 'Protein', icon: 'drumstick-bite', unit: 'g' },
            { key: 'dietary_fiber_g', label: 'Fiber', icon: 'seedling', unit: 'g' }
        ];
        
        let html = '';
        keyNutrients.forEach(nutrient => {
            const value = nutritionFacts[nutrient.key];
            if (value !== undefined && value !== null) {
                html += `
                    <div class="nutrition-item">
                        <div class="nutrition-icon">
                            <i class="fas fa-${nutrient.icon}"></i>
                        </div>
                        <div class="nutrition-value">${value}${nutrient.unit}</div>
                        <div class="nutrition-label">${nutrient.label}</div>
                    </div>
                `;
            }
        });
        
        return html;
    }

    // Handle download button click
    function handleDownload() {
        const card = document.getElementById('enhanced-result-card');
        const downloadBtn = document.getElementById('download-btn');
        
        if (!card || !downloadBtn) return;
        
        // Show loading state
        const originalText = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        downloadBtn.disabled = true;
        
        // Temporarily hide the download button before capturing
        downloadBtn.style.display = 'none';
        
        // Use html2canvas to capture the card
        html2canvas(card, {
            backgroundColor: null,
            scale: 2, // Higher resolution
            useCORS: true,
            logging: false
        }).then(canvas => {
            // Create download link
            const link = document.createElement('a');
            const productName = document.querySelector('.product-brand')?.textContent || 'Food Product';
            const healthScore = document.querySelector('.score-circle')?.textContent || '0';
            
            link.download = `${productName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_health_score_${healthScore}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Show the download button again
            downloadBtn.style.display = '';
            
            // Reset button
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
            
            // Show success message
            showNotification('Analysis downloaded successfully!', 'success');
        }).catch(error => {
            console.error('Error generating image:', error);
            
            // Show the download button again
            downloadBtn.style.display = '';
            
            // Reset button
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
            
            // Show error message
            showNotification('Failed to download analysis. Please try again.', 'danger');
        });
    }

    // Show notification message
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 250px;';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
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
        const tokenElement = document.querySelector('meta[name="csrf-token"]');
        return tokenElement ? tokenElement.getAttribute('content') : '';
    }
    
    function isIngredientConcerning(ingredient) {
        if (!ingredient) return false;
        const concerning = [
            'sugar', 'high fructose', 'corn syrup', 'palm oil', 'hydrogenated',
            'artificial', 'preservative', 'color', 'sweetener', 'sodium nitrite'
        ];
        return concerning.some(term => ingredient.toLowerCase().includes(term));
    }
    
    // Add interactive animations
    addInteractiveAnimations();

    // Camera button click handler
    cameraBtn.addEventListener('click', async () => {
        try {
            // Get available cameras
            devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            // Start with back camera
            currentFacingMode = 'environment';
            await startCamera(currentFacingMode);
            
            // Show camera view, hide upload area
            cameraView.style.display = 'block';
            uploadArea.style.display = 'none';
            previewContainer.style.display = 'none';
        } catch (err) {
            console.error("Error accessing camera", err);
            showNotification("Could not access the camera. Please check permissions.", "danger");
        }
    });

    // Start camera function
    async function startCamera(facingMode) {
        try {
            // Stop any existing stream
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            
            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement.srcObject = currentStream;
            
            // Apply correct mirroring based on camera
            if (facingMode === 'user') {
                videoElement.classList.add('front-camera');
                videoElement.classList.remove('back-camera');
            } else {
                videoElement.classList.add('back-camera');
                videoElement.classList.remove('front-camera');
            }
        } catch (err) {
            console.error("Error starting camera", err);
            showNotification("Could not start the camera. Please try again.", "danger");
        }
    }

    // Switch camera button handler
    switchCameraBtn.addEventListener('click', async () => {
        // Toggle between front and back camera
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        await startCamera(currentFacingMode);
    });

    // Capture button handler
    captureBtn.addEventListener('click', () => {
        // Set canvas dimensions to match video
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        
        const context = canvasElement.getContext('2d');
        
        // If using front camera, flip the image horizontally
        if (currentFacingMode === 'user') {
            context.translate(canvasElement.width, 0);
            context.scale(-1, 1);
        }
        
        // Draw the video frame to canvas
        context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        
        // Convert canvas to blob
        canvasElement.toBlob((blob) => {
            // Create a file from the blob
            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
            
            // Store the captured file globally
            capturedFile = file;
            
            // Set the file to the file input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            imageInput.files = dataTransfer.files;
            
            // Show the preview
            handleFiles([file]);
            
            // Stop the stream
            stopCameraStream();
            
            // Hide camera view and show the preview
            cameraView.style.display = 'none';
            previewContainer.style.display = 'flex';
        }, "image/jpeg", 0.9);
    });

    // Close camera button handler
    closeCameraBtn.addEventListener('click', () => {
        stopCameraStream();
        cameraView.style.display = 'none';
        uploadArea.style.display = 'block';
    });

    // Function to stop camera stream
    function stopCameraStream() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
    }

    // Format time for display (seconds to MM:SS)
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // Show notification message (update this function if you already have it)
    function showNotification(message, type) {
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.notification-toast');
        existingNotifications.forEach(notification => notification.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification-toast alert alert-${type} position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 250px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
        notification.innerHTML = `
            <div class="d-flex align-items-center">
                <div class="me-2">
                    ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : 
                    type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' : 
                    type === 'danger' ? '<i class="fas fa-times-circle"></i>' : 
                    '<i class="fas fa-info-circle"></i>'}
                </div>
                <div>${message}</div>
                <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 5000);
        
        // Add close button functionality
        const closeBtn = notification.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.remove();
            });
        }
    }
});

function addInteractiveAnimations() {
    // Add parallax effect to hero section
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallax = document.querySelector('.hero-section');
        if (parallax) {
            parallax.style.transform = `translateY(${scrolled * 0.5}px)`;
        }
    });
    
    // Add floating animation to blobs
    const blobs = document.querySelectorAll('.bg-blob');
    blobs.forEach((blob, index) => {
        // Random animation duration for each blob
        const duration = 15 + Math.random() * 10;
        blob.style.animationDuration = `${duration}s`;
        
        // Random animation delay
        const delay = Math.random() * 5;
        blob.style.animationDelay = `${delay}s`;
    });
    
    // Add hover effect to feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-10px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
    
    // Add pulse animation to CTA buttons
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(button => {
        setInterval(() => {
            button.classList.add('pulse');
            setTimeout(() => {
                button.classList.remove('pulse');
            }, 1000);
        }, 5000);
    });
}
