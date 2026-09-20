from django.db import models
from django.contrib.auth.models import User

# Opciones de puestos/roles dentro de la empresa
ROLES_CHOICES = (
    ('GESTOR', 'Gestor / Cobrador'),
    ('SUPERVISOR', 'Supervisor'),
    ('GERENTE', 'Gerente'),
    ('ZONAL', 'Zonal'),
    ('DISTRITAL', 'Distrital'),
)

FRECUENCIA_CHOICES = (
    ('DIARIO', 'Diario'),
    ('SEMANAL', 'Semanal'),
    ('QUINCENAL', 'Quincenal'),
    ('MENSUAL', 'Mensual'),
)

ESTADO_PRESTAMO_CHOICES = (
    ('ACTIVO', 'Activo'),
    ('FINALIZADO', 'Finalizado'),
    ('CANCELADO', 'Cancelado'),
)


class Zona(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.nombre


class Ruta(models.Model):
    nombre = models.CharField(max_length=100)
    zona = models.ForeignKey(Zona, on_delete=models.SET_NULL, null=True, blank=True, related_name='rutas')
    cobrador = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rutas_asignadas')

    def __str__(self):
        return f"{self.nombre} ({self.zona.nombre if self.zona else 'Sin Zona'})"


class PerfilUsuario(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    puesto = models.CharField(max_length=20, choices=ROLES_CHOICES, default='GESTOR')
    
    # Asignaciones geográficas/operativas
    zona_asignada = models.ForeignKey(Zona, on_delete=models.SET_NULL, null=True, blank=True, related_name='usuarios')
    ruta_asignada = models.ForeignKey(Ruta, on_delete=models.SET_NULL, null=True, blank=True, related_name='gestores')
    
    # Jerarquía (Para subordinados)
    superior_directo = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinados')

    # Contacto y ubicación personal
    telefono = models.CharField(max_length=20, blank=True, null=True)
    direccion = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.usuario.username} - {self.get_puesto_display()}"


class Cliente(models.Model):
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=20, blank=True, null=True)
    direccion = models.TextField(blank=True, null=True)
    referencia = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.nombre} ({self.telefono or 'Sin tel'})"


class Prestamo(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='prestamos')
    ruta = models.ForeignKey(Ruta, on_delete=models.SET_NULL, null=True, blank=True, related_name='prestamos')
    capital_prestado = models.DecimalField(max_digits=10, decimal_places=2)
    porcentaje_interes = models.DecimalField(max_digits=5, decimal_places=2, default=20.00)
    monto_total_pagar = models.DecimalField(max_digits=10, decimal_places=2)
    monto_cuota = models.DecimalField(max_digits=10, decimal_places=2)
    numero_cuotas = models.IntegerField(default=24)
    frecuencia = models.CharField(max_length=20, choices=FRECUENCIA_CHOICES, default='DIARIO')
    fecha_inicio = models.DateField(auto_now_add=True)
    orden_visita = models.IntegerField(default=1)
    estado = models.CharField(max_length=20, choices=ESTADO_PRESTAMO_CHOICES, default='ACTIVO')

    def __str__(self):
        return f"Préstamo #{self.id} - {self.cliente.nombre}"


class PagoCuota(models.Model):
    prestamo = models.ForeignKey(Prestamo, on_delete=models.CASCADE, related_name='pagos')
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha_pago = models.DateTimeField(auto_now_add=True)
    observacion = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"Pago ${self.monto} -> Préstamo #{self.prestamo.id}"