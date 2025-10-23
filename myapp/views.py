from django.shortcuts import render
import os
import uuid
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB

def index(request):
    return render(request, 'index.html')

@csrf_exempt
def upload_image(request):
    if request.method == 'POST' and request.FILES.get('image'):
        image = request.FILES['image']
        
        # Check file size
        if image.size > MAX_FILE_SIZE:
            return JsonResponse({'success': False, 'error': 'File size exceeds limit'})
        
        # Generate unique filename
        filename = f"{uuid.uuid4()}.jpg"
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        path = os.path.join(temp_dir, filename)
        
        # Save the file
        with open(path, 'wb+') as f:
            for chunk in image.chunks():
                f.write(chunk)
                
        return JsonResponse({
            'success': True,
            'filename': filename
        })
    
    return JsonResponse({'success': False, 'error': 'Invalid request'})
