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
            'puesto', 
            'puesto_display', 
            'zona_asignada', 
            'zona_nombre', 
            'ruta_asignada', 
            'ruta_nombre', 
            'telefono', 
            'direccion'
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
    fecha_pago_formateada = serializers.DateTimeField(source='fecha_pago', format="%d/%m/%Y %H:%M", read_only=True)

    class Meta:
        model = PagoCuota
        fields = '__all__'


class PrestamoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.ReadOnlyField(source='cliente.nombre')
    cliente_telefono = serializers.ReadOnlyField(source='cliente.telefono')
    cliente_direccion = serializers.ReadOnlyField(source='cliente.direccion')
    
    # Ruta y Gestor / Cobrador
    ruta_nombre = serializers.ReadOnlyField(source='ruta.nombre')
    gestor_nombre = serializers.SerializerMethodField()

    # Saldo Pendiente Dinámico
    saldo_pendiente = serializers.SerializerMethodField()

    # Historial de Pagos Anidado para el Frontend
    historial = PagoCuotaSerializer(source='pagos', many=True, read_only=True)

    class Meta:
        model = Prestamo
        fields = '__all__'

    def get_gestor_nombre(self, obj):
        if obj.ruta and obj.ruta.cobrador:
            return obj.ruta.cobrador.get_full_name() or obj.ruta.cobrador.username
        return "Sin gestor asignado"

    def get_saldo_pendiente(self, obj):
        total_pagado = obj.pagos.aggregate(total=Sum('monto'))['total'] or 0
        saldo_restante = float(obj.monto_total_pagar or 0) - float(total_pagado)
        return max(0.0, round(saldo_restante, 2))