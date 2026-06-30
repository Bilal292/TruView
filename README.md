# TruView

A web app that lets you photograph food product labels and get a deep-dive nutritional analysis powered by AI.

Upload a photo of any packaged food's nutrition label, and TruView will break down ingredients, identify concerning additives, assess processing level, flag hidden sugars, estimate a health score (0–100), and much more.

---

## What it does

- **Nutrition analysis** – extracts all visible nutrition facts from a label image
- **Ingredient deep-dive** – flags artificial sweeteners, colours, preservatives, and hidden sugars with plain-English explanations
- **Health score** – rates the product 0–100 based on nutritional quality
- **Processing assessment** – classifies the product as minimally processed, processed, or ultra-processed
- **Allergen & contamination risks** – highlights allergens, pesticide risk, and microplastic exposure potential
- **Environmental & ethical info** – notes sustainability concerns and relevant certifications
- **Practical guidance** – storage tips, serving size reality checks, and label-reading tricks

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Django 5 + Django Channels (ASGI) |
| Real-time | WebSockets via Daphne |
| AI model | GPT-4o mini via Replicate |
| Server | Gunicorn + Daphne |
| Database | PostgreSQL (prod) / SQLite (dev) |
| Rate limiting | django-ratelimit (3 uploads/min per session) |

## Running locally

```bash
# 1. Clone
git clone https://github.com/Bilal292/TruView.git
cd TruView

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set environment variables
export REPLICATE_API_TOKEN=your_token_here
export DJANGO_SECRET_KEY=your_secret_key_here

# 4. Run migrations
python manage.py migrate

# 5. Start the server
python manage.py runserver
```

The app will be available at `http://localhost:8000`.

## Environment variables

| Variable | Description |
|---|---|
| `REPLICATE_API_TOKEN` | Your Replicate API key |
| `DJANGO_SECRET_KEY` | Django secret key |
| `DATABASE_URL` | PostgreSQL URL (optional, falls back to SQLite) |

## Notes

This project was built as a personal experiment / sandbox. The codebase reflects that — it grew organically without strict architectural rules, so there is some technical debt. It works, but don't treat it as a reference for clean Django structure.
