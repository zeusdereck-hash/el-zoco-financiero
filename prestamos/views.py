from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token

from .models import Cliente, Ruta, Prestamo, PagoCuota
from .serializers import (
    ClienteSerializer, 
    RutaSerializer, 
    PrestamoSerializer, 
    PagoCuotaSerializer
)


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class RutaViewSet(viewsets.ModelViewSet):
    queryset = Ruta.objects.all()
    serializer_class = RutaSerializer


class PrestamoViewSet(viewsets.ModelViewSet):
    queryset = Prestamo.objects.all()
    serializer_class = PrestamoSerializer


class PagoCuotaViewSet(viewsets.ModelViewSet):
    queryset = PagoCuota.objects.all()
    serializer_class = PagoCuotaSerializer


class LoginAPIView(APIView):
    permission_classes = []  # Permitir acceso público para autenticarse
    parser_classes = [JSONParser, FormParser, MultiPartParser]  # Soportar múltiples formatos de entrada

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': 'Por favor ingresa usuario y contraseña'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            
            # Obtener datos de perfil si existe
            puesto = user.perfil.get_puesto_display() if hasattr(user, 'perfil') else 'Sin Puesto'
            ruta_id = user.perfil.ruta_asignada.id if hasattr(user, 'perfil') and user.perfil.ruta_asignada else None
            ruta_nombre = user.perfil.ruta_asignada.nombre if hasattr(user, 'perfil') and user.perfil.ruta_asignada else 'Sin Ruta'

            return Response({
                'token': token.key,
                'user_id': user.id,
                'nombre': user.get_full_name() or user.username,
                'username': user.username,
                'puesto': puesto,
                'ruta_id': ruta_id,
                'ruta_nombre': ruta_nombre
            }, status=status.HTTP_200_OK)
        
        return Response({'error': 'Usuario o contraseña incorrectos'}, status=status.HTTP_400_BAD_REQUEST)