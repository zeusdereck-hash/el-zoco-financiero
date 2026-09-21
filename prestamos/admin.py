from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.db.models import Sum
from .models import PerfilUsuario, Zona, Ruta, Cliente, Prestamo, PagoCuota


class PagoCuotaInline(admin.TabularInline):
    model = PagoCuota
    extra = 0
    fields = ('monto', 'fecha_pago', 'observacion')
    can_delete = True


class PerfilUsuarioInline(admin.StackedInline):
    model = PerfilUsuario
    can_delete = False
    verbose_name_plural = 'Información de Perfil, Puesto y Zona'
    fk_name = 'usuario'


class UserAdmin(BaseUserAdmin):
    inlines = (PerfilUsuarioInline,)
    list_display = ('username', 'email', 'first_name', 'last_name',
                    'obtener_puesto', 'obtener_zona', 'is_staff')

    def obtener_puesto(self, instance):
        return instance.perfil.get_puesto_display() if hasattr(instance, 'perfil') else '-'
    obtener_puesto.short_description = 'Puesto'

    def obtener_zona(self, instance):
        if hasattr(instance, 'perfil') and instance.perfil.zona_asignada:
            return instance.perfil.zona_asignada.nombre
        return '-'
    obtener_zona.short_description = 'Zona'


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(Zona)
class ZonaAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'descripcion')
    search_fields = ('nombre',)


@admin.register(Ruta)
class RutaAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'zona', 'cobrador')
    list_filter = ('zona',)
    search_fields = ('nombre',)


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'telefono', 'direccion')
    search_fields = ('nombre', 'telefono')
    fieldsets = (
        ('Datos principales', {
            'fields': ('nombre', 'telefono', 'direccion', 'referencia')
        }),
        ('Referencia personal 1', {
            'fields': ('ref1_nombre', 'ref1_telefono', 'ref1_direccion')
        }),
        ('Referencia personal 2', {
            'fields': ('ref2_nombre', 'ref2_telefono', 'ref2_direccion')
        }),
        ('Aval', {
            'fields': ('aval_nombre', 'aval_telefono', 'aval_direccion')
        }),
    )


@admin.register(PagoCuota)
class PagoCuotaAdmin(admin.ModelAdmin):
    list_display = ('id', 'prestamo', 'monto', 'fecha_pago', 'observacion')
    list_filter = ('fecha_pago',)


@admin.register(Prestamo)
class PrestamoAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'cliente', 'capital_prestado', 'monto_total_pagar',
        'obtener_saldo_pendiente', 'estado',
    )
    list_filter = ('frecuencia', 'estado', 'ruta')
    search_fields = ('cliente__nombre',)
    inlines = [PagoCuotaInline]

    def obtener_saldo_pendiente(self, obj):
        total_pagado = obj.pagos.aggregate(total=Sum('monto'))['total'] or 0
        saldo = float(obj.monto_total_pagar or 0) - float(total_pagado)
        return f"${max(0.0, round(saldo, 2)):,.2f}"
    obtener_saldo_pendiente.short_description = 'Saldo Restante'