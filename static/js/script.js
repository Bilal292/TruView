document.addEventListener('DOMContentLoaded', () => {
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
    const backToTopBtn = document.getElementById('backToTop');
    
    let socket;
    let countdownInterval;
    let timeLeft = 60;
    const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws_route = '/ws/nutrition-analysis/';
    
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
    
    // Back to top button functionality
    window.addEventListener('scroll', () => {
        if (window.scrollY > 1000) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });
    
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 500,
            behavior: 'smooth'
        });
    });
    
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
        };
        reader.readAsDataURL(file);
    }
    
    // Remove image handler
    removeImageBtn.addEventListener('click', function() {
        imageInput.value = '';
        uploadArea.style.display = 'block';
        previewContainer.style.display = 'none';
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
        
        const file = imageInput.files[0];
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
                showNotification("Image upload failed. Please try again.", "danger");
                submitButton.disabled = false;
                spinner.style.display = 'none';
            }
        } catch (error) {
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
    
    // Display analysis results with viral-ready cards
    function displayResult(result) {
        resultContainer.style.display = 'block';
        resultContent.innerHTML = '';
        
        // Determine score class and label
        const healthScore = result.analysis.health_score;
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
        
        // Create viral card HTML
        let html = `
            <div class="viral-card" id="viral-card">
                <div class="viral-card-header">
                    <div class="health-score-display">
                        <div class="score-circle ${scoreClass}">${healthScore}</div>
                        <div>
                            <div class="score-label">Health Score: ${scoreLabel}</div>
                            <div class="mt-2">
                                ${result.product_info.brand ? `<h3 class="h5">${result.product_info.brand}</h3>` : ''}
                                ${result.product_info.serving_size ? `<p class="mb-0">Serving: ${result.product_info.serving_size}</p>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="viral-card-body">
                    <div class="key-takeaways ${takeawayClass}">
                        <div class="takeaway-title">Key Takeaways</div>
                        <ul class="takeaway-list">
                            <li>${result.analysis.summary}</li>
                        </ul>
                    </div>
                    
                    <!-- Analysis Section -->
                    <div class="analysis-section">
                        <div class="row">
                            <div class="col-md-6">
                                <h5 class="text-success">Positive Aspects</h5>
                                <ul class="positive-list">
                                    ${result.analysis.positive_aspects.map(aspect => `<li>${aspect}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="col-md-6">
                                <h5 class="text-danger">Negative Aspects</h5>
                                <ul class="negative-list">
                                    ${result.analysis.negative_aspects.map(aspect => `<li>${aspect}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Notable Ingredients Section -->
                    ${result.notable_ingredients && result.notable_ingredients.length > 0 ? `
                        <div class="notable-ingredients-section">
                            <h5><i class="bi bi-exclamation-triangle"></i> Notable Ingredients</h5>
                            <div class="ingredients-container">
                                ${result.notable_ingredients.map(ingredient => {
                                    const isConcerning = isIngredientConcerning(ingredient);
                                    return `<span class="ingredient-tag ${isConcerning ? 'ingredient-concerning' : 'ingredient-healthy'}">${ingredient}</span>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="share-section">
                        <button class="download-button" id="download-btn">
                            <i class="bi bi-download"></i> Download Card
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="card shadow-sm mt-4">
                <div class="card-header bg-primary text-white">
                    <h2 class="mb-0">Detailed Analysis</h2>
                </div>
                <div class="card-body">
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
        
        // Notable ingredients (already shown in viral card, but also showing in detailed view)
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
        
        html += `
                </div>
            </div>
        `;
        
        resultContent.innerHTML = html;
        
        // Add event listener for download button
        document.getElementById('download-btn').addEventListener('click', handleDownload);
        
        // Scroll to results
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Handle download button click
    function handleDownload() {
        const card = document.getElementById('viral-card');
        const downloadBtn = document.getElementById('download-btn');
        
        // Show loading state
        const originalText = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';
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
            const productName = document.querySelector('.viral-card h3')?.textContent || 'Food Product';
            const healthScore = document.querySelector('.score-circle').textContent;
            
            link.download = `${productName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_health_score_${healthScore}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Show the download button again
            downloadBtn.style.display = '';
            
            // Reset button
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
            
            // Show success message
            showNotification('Card downloaded successfully!', 'success');
        }).catch(error => {
            console.error('Error generating image:', error);
            
            // Show the download button again
            downloadBtn.style.display = '';
            
            // Reset button
            downloadBtn.innerHTML = originalText;
            downloadBtn.disabled = false;
            
            // Show error message
            showNotification('Failed to download card. Please try again.', 'danger');
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
    
    // Add interactive animations
    addInteractiveAnimations();
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
