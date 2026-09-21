from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClienteViewSet, RutaViewSet, PrestamoViewSet,
    PagoCuotaViewSet, LoginAPIView,
    login_view, logout_view, cobro_view,
)
from django.views.generic import RedirectView

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'rutas', RutaViewSet, basename='ruta')
router.register(r'prestamos', PrestamoViewSet, basename='prestamo')
router.register(r'pagos', PagoCuotaViewSet, basename='pago')

urlpatterns = [
    path('', RedirectView.as_view(url='/login/', permanent=False)),
    path('login/', login_view, name='login'),
    path('logout/', logout_view, name='logout'),
    path('cobro/', cobro_view, name='cobro_offline'),

    path('api/', include(router.urls)),
    path('api/login/', LoginAPIView.as_view(), name='api_login'),
]