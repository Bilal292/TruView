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
                "prompt": "**Strict Analysis Requirements:**\n\n1.  **Data Extraction:**\n    * Extract all visible **nutrition facts** (values and % Daily Values, if present) based on the stated serving size.\n    * Extract the complete **ingredient list**.\n    * If crucial information (like the ingredient list or full nutrition panel) is not visible, you must note this in the summary and make the best possible analysis based on what *is* visible.\n\n2.  **Ingredient Assessment:**\n    * Identify **notable or concerning ingredients** such as: added sugars (e.g., corn syrup, dextrose), artificial sweeteners, artificial colors (e.g., Red 40, Yellow 5), artificial flavors, chemical preservatives (e.g., BHA, BHT), high levels of sodium or saturated fat (inferred from nutrition panel), and highly refined oils (e.g., palm oil, hydrogenated oils).\n\n3.  **Nutritional Quality Assessment & Scoring:**\n    * Assess the food's **nutritional quality** based on general dietary guidelines (e.g., prioritization of protein/fiber, low content of saturated fat, added sugar, and sodium).\n    * Provide a **numerical health score (0–100)**.\n        * **0-25:** Highly processed, high in added sugar/sodium/saturated fat, and poor ingredient profile.\n        * **26-50:** Processed, moderate to high in concerning nutrients, but may offer some macro-nutritional benefit.\n        * **51-75:** Moderately healthy, reasonable balance of macros, generally lower in concerning nutrients.\n        * **76-100:** Minimal ingredients, rich in fiber/protein, very low in saturated fat/sodium/added sugar.\n    * Formulate short, user-friendly **positive and negative observations**.\n    * Conclude with a **summary** stating whether it is generally healthy, an occasional treat, or best avoided.\n\n**Output Requirement:**\n\nReturn your entire response **only** in the following strict JSON format. Use `null` for any data point that is not visible in the image and cannot be reasonably calculated (e.g., trans fat if not listed).\n\n```json\n{\n  \"product_info\": {\n    \"serving_size\": \"string\",\n    \"calories_per_serving\": \"number | null\",\n    \"brand\": \"string | null\",\n    \"claims\": [\"string\"]\n  },\n  \"nutrition_facts\": {\n    \"total_fat_g\": \"number | null\",\n    \"saturated_fat_g\": \"number | null\",\n    \"trans_fat_g\": \"number | null\",\n    \"cholesterol_mg\": \"number | null\",\n    \"sodium_mg\": \"number | null\",\n    \"total_carbohydrates_g\": \"number | null\",\n    \"dietary_fiber_g\": \"number | null\",\n    \"total_sugars_g\": \"number | null\",\n    \"added_sugars_g\": \"number | null\",\n    \"protein_g\": \"number | null\"\n  },\n  \"ingredients\": [\"string\"],\n  \"notable_ingredients\": [\"string\"],\n  \"analysis\": {\n    \"positive_aspects\": [\"string\"],\n    \"negative_aspects\": [\"string\"],\n    \"health_score\": \"number\",\n    \"summary\": \"string\"\n  }",
                "messages": [],
                "image_input": [file_url],
                "temperature": 1,
                "system_prompt": "You are a **Certified Nutrition Analysis Expert** for a mobile application. Your task is to provide a comprehensive, objective, and user-friendly analysis of a food product based *only* on the provided image(s) of its packaging (nutrition facts panel and/or ingredient list).",
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
                    
                    print("Parsed result:", result)
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
    