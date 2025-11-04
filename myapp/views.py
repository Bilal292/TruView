from django.shortcuts import render
from django.http import JsonResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_protect
from django_ratelimit.decorators import ratelimit
import os
import uuid

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

@csrf_protect
@ratelimit(key=get_client_ip, rate='1/m', block=False)  # 3 requests per minute per IP
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
