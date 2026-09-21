from rest_framework import serializers
from django.contrib.auth.models import User
from django.db.models import Sum
from .models import PerfilUsuario, Zona, Ruta, Cliente, Prestamo, PagoCuota


class PerfilUsuarioSerializer(serializers.ModelSerializer):
    puesto_display = serializers.CharField(source='get_puesto_display', read_only=True)
    zona_nombre = serializers.ReadOnlyField(source='zona_asignada.nombre')
    ruta_nombre = serializers.ReadOnlyField(source='ruta_asignada.nombre')

    class Meta:
        model = PerfilUsuario
        fields = [
            'puesto', 'puesto_display',
            'zona_asignada', 'zona_nombre',
            'ruta_asignada', 'ruta_nombre',
            'telefono', 'direccion',
        ]


class UserSerializer(serializers.ModelSerializer):
    perfil = PerfilUsuarioSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'perfil']


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'


class RutaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ruta
        fields = '__all__'


class PagoCuotaSerializer(serializers.ModelSerializer):
    fecha_pago = serializers.DateTimeField(required=False)
    fecha_pago_formateada = serializers.DateTimeField(
        source='fecha_pago', format="%d/%m/%Y %H:%M", read_only=True
    )

    class Meta:
        model = PagoCuota
        fields = ['id', 'prestamo', 'monto', 'fecha_pago', 'fecha_pago_formateada', 'observacion']
        read_only_fields = ['id']


class PrestamoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.ReadOnlyField(source='cliente.nombre')
    cliente_telefono = serializers.ReadOnlyField(source='cliente.telefono')
    cliente_direccion = serializers.ReadOnlyField(source='cliente.direccion')
    cliente_referencia = serializers.ReadOnlyField(source='cliente.referencia')

    # Referencias y aval
    cliente_ref1_nombre = serializers.ReadOnlyField(source='cliente.ref1_nombre')
    cliente_ref1_telefono = serializers.ReadOnlyField(source='cliente.ref1_telefono')
    cliente_ref1_direccion = serializers.ReadOnlyField(source='cliente.ref1_direccion')
    cliente_ref2_nombre = serializers.ReadOnlyField(source='cliente.ref2_nombre')
    cliente_ref2_telefono = serializers.ReadOnlyField(source='cliente.ref2_telefono')
    cliente_ref2_direccion = serializers.ReadOnlyField(source='cliente.ref2_direccion')
    cliente_aval_nombre = serializers.ReadOnlyField(source='cliente.aval_nombre')
    cliente_aval_telefono = serializers.ReadOnlyField(source='cliente.aval_telefono')
    cliente_aval_direccion = serializers.ReadOnlyField(source='cliente.aval_direccion')

    # Ruta y Gestor
    ruta_nombre = serializers.ReadOnlyField(source='ruta.nombre')
    gestor_nombre = serializers.SerializerMethodField()

    # Saldo e historial
    saldo_pendiente = serializers.SerializerMethodField()
    historial = PagoCuotaSerializer(source='pagos', many=True, read_only=True)

    class Meta:
        model = Prestamo
        fields = [
            'id', 'cliente', 'cliente_nombre', 'cliente_telefono', 'cliente_direccion',
            'cliente_referencia',
            'cliente_ref1_nombre', 'cliente_ref1_telefono', 'cliente_ref1_direccion',
            'cliente_ref2_nombre', 'cliente_ref2_telefono', 'cliente_ref2_direccion',
            'cliente_aval_nombre', 'cliente_aval_telefono', 'cliente_aval_direccion',
            'ruta', 'ruta_nombre', 'gestor_nombre',
            'capital_prestado', 'porcentaje_interes', 'monto_total_pagar',
            'monto_cuota', 'numero_cuotas', 'frecuencia', 'fecha_inicio',
            'orden_visita', 'estado',
            'saldo_pendiente', 'historial',
        ]

    def get_gestor_nombre(self, obj):
        if obj.ruta and obj.ruta.cobrador:
            return obj.ruta.cobrador.get_full_name() or obj.ruta.cobrador.username
        return "Sin gestor asignado"

    def get_saldo_pendiente(self, obj):
        total_pagado = obj.pagos.aggregate(total=Sum('monto'))['total'] or 0
        saldo_restante = float(obj.monto_total_pagar or 0) - float(total_pagado)
        return max(0.0, round(saldo_restante, 2))