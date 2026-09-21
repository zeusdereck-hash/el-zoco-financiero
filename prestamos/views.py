from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from django.contrib.auth import authenticate, login as django_login, logout as django_logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from decimal import Decimal

from .models import Cliente, Ruta, Prestamo, PagoCuota
from .serializers import (
    ClienteSerializer, RutaSerializer,
    PrestamoSerializer, PagoCuotaSerializer,
)


# =========================================================
#  VISTAS WEB (Login, Logout, PWA de cobro)
# =========================================================
def login_view(request):
    error = None
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            django_login(request, user)
            return redirect(request.GET.get('next', '/cobro/'))
        error = "Usuario o contraseña incorrectos."
    return render(request, 'prestamos/login.html', {'error': error})


def logout_view(request):
    django_logout(request)
    return redirect('/login/')


@login_required
def cobro_view(request):
    return render(request, 'prestamos/cobro_offline.html')


# =========================================================
#  LOGIN API (para clientes externos / PWA)
# =========================================================
@method_decorator(csrf_exempt, name='dispatch')
class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user is not None:
            return Response({
                'success': True,
                'user_id': user.id,
                'username': user.username,
                'nombre': user.get_full_name() or user.username,
                'es_staff': user.is_staff,
            }, status=status.HTTP_200_OK)
        return Response(
            {'success': False, 'error': 'Credenciales inválidas'},
            status=status.HTTP_401_UNAUTHORIZED
        )


# =========================================================
#  CLIENTES
# =========================================================
@method_decorator(csrf_exempt, name='dispatch')
class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def sincronizar_altas(self, request):
        altas_datos = request.data.get('altas', [])
        procesados = []

        ruta_defecto, _ = Ruta.objects.get_or_create(nombre="Ruta Principal")

        for item in altas_datos:
            try:
                with transaction.atomic():
                    nombre_limpio = item.get('nombre', '').replace('[NUEVO] ', '').strip()

                    cliente, creado = Cliente.objects.get_or_create(
                        nombre=nombre_limpio,
                        defaults={
                            'telefono': item.get('telefono', ''),
                            'direccion': item.get('direccion', ''),
                            'referencia': item.get('referencia', ''),
                            'ref1_nombre': item.get('ref1_nombre', ''),
                            'ref1_telefono': item.get('ref1_telefono', ''),
                            'ref1_direccion': item.get('ref1_direccion', ''),
                            'ref2_nombre': item.get('ref2_nombre', ''),
                            'ref2_telefono': item.get('ref2_telefono', ''),
                            'ref2_direccion': item.get('ref2_direccion', ''),
                            'aval_nombre': item.get('aval_nombre', ''),
                            'aval_telefono': item.get('aval_telefono', ''),
                            'aval_direccion': item.get('aval_direccion', ''),
                        }
                    )

                    # Si el cliente ya existía, actualizamos referencias nuevas
                    if not creado:
                        actualizaciones = {}
                        for campo in ['referencia',
                                      'ref1_nombre', 'ref1_telefono', 'ref1_direccion',
                                      'ref2_nombre', 'ref2_telefono', 'ref2_direccion',
                                      'aval_nombre', 'aval_telefono', 'aval_direccion']:
                            if item.get(campo):
                                actualizaciones[campo] = item[campo]
                        if actualizaciones:
                            for k, v in actualizaciones.items():
                                setattr(cliente, k, v)
                            cliente.save(update_fields=list(actualizaciones.keys()))

                    prestamo = Prestamo.objects.filter(
                        cliente=cliente, ruta=ruta_defecto, estado='ACTIVO'
                    ).first()

                    if not prestamo:
                        capital = Decimal(str(item.get('capital_prestado', 0)))
                        interes_pct = Decimal(str(item.get('porcentaje_interes', 20)))
                        n_cuotas = int(item.get('numero_cuotas', 24))

                        total_pagar = capital + (capital * (interes_pct / Decimal('100')))
                        monto_cuota = (
                            total_pagar / Decimal(str(n_cuotas))
                            if n_cuotas > 0 else total_pagar
                        )

                        prestamo = Prestamo.objects.create(
                            cliente=cliente,
                            ruta=ruta_defecto,
                            capital_prestado=capital,
                            porcentaje_interes=interes_pct,
                            numero_cuotas=n_cuotas,
                            monto_total_pagar=total_pagar,
                            monto_cuota=monto_cuota,
                            frecuencia=item.get('frecuencia', 'DIARIO'),
                            orden_visita=999,
                        )

                    procesados.append({
                        'temp_id': item.get('temp_id'),
                        'real_id': prestamo.id,
                    })
            except Exception as e:
                print(f"Error procesando alta de cliente: {e}")
                return Response(
                    {"error": f"Fallo al guardar registro: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

        return Response({
            "mensaje": f"Se procesaron {len(procesados)} registros correctamente.",
            "registros": procesados,
        }, status=status.HTTP_201_CREATED)


# =========================================================
#  PAGOS
# =========================================================
@method_decorator(csrf_exempt, name='dispatch')
class PagoCuotaViewSet(viewsets.ModelViewSet):
    queryset = PagoCuota.objects.all()
    serializer_class = PagoCuotaSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def sincronizar_lote(self, request):
        pagos_datos = request.data.get('pagos', [])
        pagos_procesados = []

        for pago in pagos_datos:
            if str(pago.get('prestamo')).startswith('TEMP_'):
                continue

            serializer = self.get_serializer(data=pago)
            if serializer.is_valid():
                serializer.save()
                pagos_procesados.append(serializer.data)
            else:
                print(f"Pago inválido: {serializer.errors}")

        return Response({
            "mensaje": f"Se sincronizaron {len(pagos_procesados)} pagos con éxito.",
            "pagos": pagos_procesados,
        }, status=status.HTTP_201_CREATED)


# =========================================================
#  RUTAS
# =========================================================
class RutaViewSet(viewsets.ModelViewSet):
    queryset = Ruta.objects.all()
    serializer_class = RutaSerializer
    permission_classes = [AllowAny]


# =========================================================
#  PRESTAMOS
# =========================================================
class PrestamoViewSet(viewsets.ModelViewSet):
    serializer_class = PrestamoSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = Prestamo.objects.all()
        user = self.request.user

        # Si no está autenticado (modo pruebas/offline), mostramos todo
        if not user.is_authenticated:
            return qs

        # Gerente / Distrital / Zonal ven todo
        try:
            perfil = user.perfil
        except Exception:
            return qs

        if perfil.puesto in ('GERENTE', 'DISTRITAL', 'ZONAL'):
            return qs
        if perfil.puesto == 'SUPERVISOR' and perfil.zona_asignada:
            return qs.filter(ruta__zona=perfil.zona_asignada)
        if perfil.puesto == 'GESTOR' and perfil.ruta_asignada:
            return qs.filter(ruta=perfil.ruta_asignada)
        return qs