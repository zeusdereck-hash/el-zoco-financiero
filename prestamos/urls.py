from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ClienteViewSet, RutaViewSet, PrestamoViewSet, PagoCuotaViewSet, LoginAPIView
from django.views.generic import TemplateView, RedirectView

# Configuración del router para los endpoints de la API REST
router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'rutas', RutaViewSet, basename='ruta')
router.register(r'prestamos', PrestamoViewSet, basename='prestamo')
router.register(r'pagos', PagoCuotaViewSet, basename='pago')

urlpatterns = [
    # Redirección automática de la raíz a la pantalla del cobrador
    path('', RedirectView.as_view(url='/cobro/', permanent=False)),
    
    # Rutas para la API REST (incluye /api/clientes/sincronizar_altas/ y /api/pagos/sincronizar_lote/)
    path('api/', include(router.urls)),
    
    # Vista principal PWA de cobro offline
    path('cobro/', TemplateView.as_view(template_name='prestamos/cobro_offline.html'), name='cobro_offline'),
    path('api/login/', LoginAPIView.as_view(), name='api_login'),
    path('api/', include(router.urls)),
]