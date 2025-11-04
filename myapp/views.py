from django.shortcuts import render
from django.http import JsonResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.csrf import csrf_exempt
from django_ratelimit.decorators import ratelimit
import os
import uuid
from django.core.cache import cache
import time

MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB

def index(request):
    return render(request, 'index.html')

# Function to extract real client IP
def get_client_ip(_, request):
    # Try to get the real IP from the X-Forwarded-For header
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        # If X-Forwarded-For is set, the first IP is the real client IP
        ip = x_forwarded_for.split(',')[0]
    else:
        # If X-Forwarded-For is not set, fallback to REMOTE_ADDR
        ip = request.META.get('REMOTE_ADDR')
    return ip

# Function to get a more specific rate limiting key
def get_rate_limit_key(_, request):
    ip = get_client_ip(_, request)
    
    # Try to get session key if available
    session_key = ''
    if hasattr(request, 'session') and request.session.session_key:
        session_key = request.session.session_key
    else:
        # Create a session if it doesn't exist
        request.session.save()
        session_key = request.session.session_key
    
    # Combine IP and session key for a more specific rate limit key
    return f"upload_limit:{ip}:{session_key}"

@csrf_exempt
@ratelimit(key=get_rate_limit_key, rate='1/m', block=False)  # 1 request per minute
def upload_image(request):
    # Check if rate limit is exceeded
    if getattr(request, 'limited', False):
        return JsonResponse({
            'success': False,
            'error': 'Rate limit exceeded. Please wait before trying again.',
            'retry_after': 60  # Default retry time
        }, status=429)
    
    if request.method == 'POST' and request.FILES.get('image'):
        image = request.FILES['image']

        if image.size > MAX_FILE_SIZE:
            return JsonResponse({'success': False, 'error': 'File size exceeds limit'})

        filename = f"{uuid.uuid4()}.jpg"
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        path = os.path.join(temp_dir, filename)

        with open(path, 'wb+') as f:
            for chunk in image.chunks():
                f.write(chunk)

        return JsonResponse({'success': True, 'filename': filename})

    return JsonResponse({'success': False, 'error': 'Invalid request'})
