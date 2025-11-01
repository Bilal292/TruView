import os
import json
import asyncio
import replicate
from django.conf import settings
from channels.generic.websocket import AsyncWebsocketConsumer

class NutritionAnalysisConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.request_id_set = set()
        await self.accept()
        print("Connection established: Nutrition Analysis")

    async def disconnect(self, close_code):
        print(f"Connection closed: {close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        data = json.loads(text_data)
        request_id = data.get("id", "none")
        
        # Prevent duplicate processing
        if request_id in self.request_id_set:
            return
        self.request_id_set.add(request_id)
        
        # Send receipt to client
        await self.send(json.dumps({"received": "true"}))
        
        image_filename = data.get("image_filename")
        if not image_filename:
            await self.send(json.dumps({"error": "No image filename provided"}))
            return
            
        # Construct full path to uploaded image
        image_path = os.path.join(settings.MEDIA_ROOT, 'temp', image_filename)
        
        try:
            # Upload image to Replicate
            file_url = await self.upload_to_replicate(image_path, filename=image_filename)
            
            # Prepare input for nutrition analysis model
            input_data={
                "top_p": 1,
                "prompt": "**Comprehensive Food Analysis Requirements:**\n\n1.  **Data Extraction:**\n    * Extract all visible **nutrition facts** (values and % Daily Values, if present) based on the stated serving size.\n    * Extract the complete **ingredient list**.\n    * If crucial information (like the ingredient list or full nutrition panel) is not visible, you must note this in the summary and make the best possible analysis based on what *is* visible.\n\n2.  **Deep Ingredient Assessment:**\n    * Identify **notable or concerning ingredients** such as: added sugars (e.g., corn syrup, dextrose), artificial sweeteners (aspartame, sucralose), artificial colors (Red 40, Yellow 5, Blue 1), artificial flavors, chemical preservatives (BHA, BHT, sodium nitrite), high levels of sodium or saturated fat, and highly refined oils (palm oil, hydrogenated oils).\n    * For each concerning ingredient, provide:\n        - **Purpose**: Why manufacturers use this ingredient\n        - **Health Concerns**: Documented health risks and controversies\n        - **Industry Context**: Why it's controversial (e.g., regulatory status, bans in other countries)\n        - **Hidden Names**: Alternative names the ingredient might be listed under\n\n3.  **Processing Level Analysis:**\n    * Assess the **processing level** of the product (minimally processed, processed, ultra-processed)\n    * Explain **why processing matters** for health (nutrient loss, added chemicals, calorie density)\n    * Identify **processing indicators** in the ingredient list (e.g., isolated proteins, refined flours, modified starches)\n\n4.  **Hidden Sugar Analysis:**\n    * Identify **all forms of added sugar** in the product\n    * Calculate **total sugar equivalents** (including all hidden sugars)\n    * List **alternative names for sugar** used in the product\n    * Compare sugar content to **daily recommended limits**\n\n5.  **Additive Impact Assessment:**\n    * For each **food additive** (preservatives, colors, flavors, emulsifiers, etc.):\n        - **Function**: What the additive does in the product\n        - **Health Impact**: Known or suspected health effects\n        - **Regulatory Status**: Approved levels, bans in other countries\n        - **Natural Alternatives**: What could be used instead\n\n6.  **GMO Information:**\n    * Assess likelihood of **GMO ingredients** (corn, soy, canola, sugar beets, etc.)\n    * Explain **GMO concerns** (environmental impact, health questions)\n    * Note if product is **Non-GMO Project Verified** or organic\n\n7.  **Environmental Impact:**\n    * Assess **environmental footprint** of key ingredients\n    * Note **sustainability concerns** (palm oil, overfishing, water usage)\n    * Identify **eco-certifications** if present\n\n8.  **Ethical Considerations:**\n    * Note any **ethical concerns** (child labor, unfair trade, animal welfare)\n    * Identify **ethical certifications** (Fair Trade, Rainforest Alliance, etc.)\n\n9.  **Allergen Information:**\n    * Identify **major allergens** beyond the top 8 (milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans)\n    * Note **cross-contamination risks** if mentioned\n    * Identify **hidden allergens** (e.g., natural flavors, spices)\n\n10. **Microplastic Contamination Risk:**\n    * Assess **microplastic risk** based on packaging type and processing method\n    * Explain **health concerns** related to microplastic consumption\n\n11. **Pesticide Residue Risk:**\n    * Assess **pesticide risk** based on ingredients (especially if not organic)\n    * Note **high-risk crops** (strawberries, spinach, kale, etc.)\n    * Explain **health implications** of pesticide exposure\n\n12. **Nutrient Density Analysis:**\n    * Calculate **nutrient density** (nutrients per calorie)\n    * Identify **empty calories** (calories without significant nutrients)\n    * Note **fortified nutrients** vs. naturally occurring nutrients\n\n13. **Nutritional Quality Assessment & Scoring:**\n    * Assess the food's **nutritional quality** based on general dietary guidelines (prioritizing protein/fiber, low content of saturated fat, added sugar, and sodium).\n    * Provide a **numerical health score (0–100)**.\n        * **0-25:** Highly processed, high in added sugar/sodium/saturated fat, and poor ingredient profile.\n        * **26-50:** Processed, moderate to high in concerning nutrients, but may offer some macro-nutritional benefit.\n        * **51-75:** Moderately healthy, reasonable balance of macros, generally lower in concerning nutrients.\n        * **76-100:** Minimal ingredients, rich in fiber/protein, very low in saturated fat/sodium/added sugar.\n    * Formulate detailed, user-friendly **positive and negative observations**.\n    * Conclude with a **comprehensive summary** that includes:\n        - Overall health assessment\n        - Potential long-term health implications\n        - Recommendations for consumption frequency\n        - Healthier alternatives when possible\n\n14. **Industry Insights & Controversies:**\n    * Highlight any **industry practices** related to this product category that consumers should be aware of\n    * Note any **regulatory differences** between countries (e.g., ingredients banned elsewhere but allowed here)\n    * Expose **marketing tactics** that might mislead consumers (e.g., \"natural\" claims on highly processed products)\n\n15. **Practical Consumer Guidance:**\n    * **Storage & Safety**: How to properly store the product and safety considerations\n    * **Preparation Tips**: Best ways to prepare/consume for maximum nutrition\n    * **Label Reading Tricks**: How to identify misleading claims and marketing tactics\n    * **Cost vs. Nutrition**: Is the product worth its price from a nutritional standpoint?\n    * **Serving Size Reality Check**: How realistic the serving size is and what people actually consume\n\n**Output Requirement:**\n\nReturn your entire response **only** in the following strict JSON format. Use `null` for any data point that is not visible in the image and cannot be reasonably calculated.\n\n```json\n{\n  \"product_info\": {\n    \"serving_size\": \"string\",\n    \"calories_per_serving\": \"number | null\",\n    \"brand\": \"string | null\",\n    \"claims\": [\"string\"]\n  },\n  \"nutrition_facts\": {\n    \"total_fat_g\": \"number | null\",\n    \"saturated_fat_g\": \"number | null\",\n    \"trans_fat_g\": \"number | null\",\n    \"cholesterol_mg\": \"number | null\",\n    \"sodium_mg\": \"number | null\",\n    \"total_carbohydrates_g\": \"number | null\",\n    \"dietary_fiber_g\": \"number | null\",\n    \"total_sugars_g\": \"number | null\",\n    \"added_sugars_g\": \"number | null\",\n    \"protein_g\": \"number | null\"\n  },\n  \"ingredients\": [\"string\"],\n  \"notable_ingredients\": [\"string\"],\n  \"detailed_ingredient_analysis\": [\n    {\n      \"ingredient\": \"string\",\n      \"purpose\": \"string\",\n      \"health_concerns\": [\"string\"],\n      \"industry_context\": \"string\",\n      \"hidden_names\": [\"string\"]\n    }\n  ],\n  \"processing_analysis\": {\n    \"level\": \"string\",\n    \"indicators\": [\"string\"],\n    \"health_implications\": \"string\"\n  },\n  \"sugar_analysis\": {\n    \"total_sugar_equivalents\": \"string\",\n    \"hidden_sugars\": [\"string\"],\n    \"percent_of_daily_limit\": \"number\"\n  },\n  \"additive_impact\": [\n    {\n      \"additive\": \"string\",\n      \"function\": \"string\",\n      \"health_impact\": \"string\",\n      \"regulatory_status\": \"string\",\n      \"natural_alternatives\": [\"string\"]\n    }\n  ],\n  \"gmo_analysis\": {\n    \"likelihood\": \"string\",\n    \"concerns\": \"string\",\n    \"certifications\": [\"string\"]\n  },\n  \"environmental_impact\": {\n    \"footprint\": \"string\",\n    \"sustainability_concerns\": [\"string\"],\n    \"certifications\": [\"string\"]\n  },\n  \"ethical_considerations\": {\n    \"concerns\": [\"string\"],\n    \"certifications\": [\"string\"]\n  },\n  \"allergen_information\": {\n    \"major_allergens\": [\"string\"],\n    \"cross_contamination_risks\": [\"string\"],\n    \"hidden_allergens\": [\"string\"]\n  },\n  \"contamination_risks\": {\n    \"microplastic_risk\": \"string\",\n    \"pesticide_risk\": \"string\",\n    \"high_risk_ingredients\": [\"string\"]\n  },\n  \"nutrient_density\": {\n    \"score\": \"string\",\n    \"empty_calories\": \"boolean\",\n    \"fortified_vs_natural\": {\n      \"fortified\": [\"string\"],\n      \"natural\": [\"string\"]\n    }\n  },\n  \"practical_guidance\": {\n    \"storage_safety\": \"string\",\n    \"preparation_tips\": [\"string\"],\n    \"label_reading_tricks\": [\"string\"],\n    \"cost_vs_nutrition\": \"string\",\n    \"serving_size_reality\": \"string\"\n  },\n  \"industry_insights\": {\n    \"controversial_practices\": [\"string\"],\n    \"regulatory_differences\": \"string\",\n    \"marketing_tactics\": [\"string\"]\n  },\n  \"analysis\": {\n    \"positive_aspects\": [\"string\"],\n    \"negative_aspects\": [\"string\"],\n    \"health_score\": \"number\",\n    \"summary\": \"string\",\n    \"recommendations\": {\n      \"consumption_frequency\": \"string\",\n      \"healthier_alternatives\": [\"string\"]\n    }\n  }\n}",
                "messages": [],
                "image_input": [file_url],
                "temperature": 1,
                "system_prompt": "You are an **Investigative Nutrition Analyst** for a consumer advocacy mobile application. Your task is to provide a comprehensive, educational, and transparent analysis of food products based *only* on the provided image(s) of their packaging. Uncover both obvious and hidden concerns about ingredients, processing methods, and industry practices. Present factual information with appropriate context to help consumers make truly informed decisions. Be thorough in explaining potential health implications without spreading misinformation.",
                "presence_penalty": 0,
                "frequency_penalty": 0,
                "max_completion_tokens": 4096
            }
            
            # Run prediction on Replicate
            prediction = await asyncio.to_thread(
                replicate.predictions.create,
                model="openai/gpt-4o-mini", 
                input=input_data
            )
            
            # Poll for results
            POLL_INTERVAL = 3  # Seconds
            while prediction.status not in ["succeeded", "failed", "canceled"]:
                prediction = await asyncio.to_thread(
                    replicate.predictions.get,
                    prediction.id
                )
                if prediction.status in ["succeeded", "failed", "canceled"]:
                    break
                await asyncio.sleep(POLL_INTERVAL)
            
            if prediction.status == "succeeded":
                # Parse the output
                try:
                    # Check if output is a list of strings
                    if isinstance(prediction.output, list):
                        # Join the list of strings into a single string
                        output_str = ''.join(prediction.output)
                        
                        # Check if the string is wrapped in markdown code blocks
                        if output_str.startswith('```json') and output_str.endswith('```'):
                            # Extract the JSON part by removing the markdown code block markers
                            json_str = output_str[7:-3].strip()
                            result = json.loads(json_str)
                        else:
                            # Try to parse the string directly as JSON
                            result = json.loads(output_str)
                    else:
                        # If output is a string, check for markdown code blocks
                        if prediction.output.startswith('```json') and prediction.output.endswith('```'):
                            json_str = prediction.output[7:-3].strip()
                            result = json.loads(json_str)
                        else:
                            # Try to parse the string directly as JSON
                            result = json.loads(prediction.output)
                    
                    await self.send(json.dumps({
                        "analysis_result": result
                    }))
                except json.JSONDecodeError as e:
                    print("JSON parsing error:", e)
                    print("Raw output:", prediction.output)
                    await self.send(json.dumps({
                        "error": "Failed to parse the response as JSON"
                    }))
                except Exception as e:
                    print("Unexpected error:", e)
                    print("Raw output:", prediction.output)
                    await self.send(json.dumps({
                        "error": "An unexpected error occurred while processing the response"
                    }))
            else:
                print("Prediction failed:", prediction.status, prediction.error)
                await self.send(json.dumps({"error": "Analysis failed"}))
                
        except Exception as e:
            print(f"Error: {e}")
            await self.send(json.dumps({"error": "An unexpected error occurred"}))
            
        finally:
            # Clean up temporary image
            try:
                if os.path.exists(image_path):
                    os.remove(image_path)
            except Exception as e:
                print(f"Failed to delete image: {e}")

    async def upload_to_replicate(self, image_path, filename="input.jpg"):
        # Upload image to Replicate's file service
        file_response = await asyncio.to_thread(
            replicate.files.create,
            file=open(image_path, "rb"),
            filename=filename
        )
        return file_response.urls['get']
    