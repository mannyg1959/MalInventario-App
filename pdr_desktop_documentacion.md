# Documento de Descripción del Proyecto (PDR) y Manual de Operación - Versión Desktop

## 1. Información General
**Nombre del Proyecto:** MalInventario - Desktop Edition  
**Propósito:** Sistema integral de gestión de activos IT, control de personal y trazabilidad de asignaciones para la Fundación Maldita.es.  
**Plataforma:** Aplicación Web de escritorio con interfaz de panel de control (Dashboard).

---

## 2. Arquitectura de la Aplicación

### 2.1 Stack Tecnológico
- **Frontend:** HTML5, CSS3 con variables personalizadas para diseño "Premium Business".
- **Lógica:** JavaScript Vanilla (ES6+) con arquitectura orientada a objetos (`state`, `api`, `ui`).
- **Iconografía:** FontAwesome 6 (módulos sólidos y regulares).
- **Base de Datos:** Airtable API con soporte para múltiples tablas relacionadas.

### 2.2 Estructura de Módulos (Vistas)
La aplicación utiliza un sistema de renderizado dinámico sobre un `content-area` principal:
- **Dashboard:** Resumen estadístico y estados críticos.
- **Inventario:** Gestión completa de activos (Assets).
- **Empleados:** Directorio de personal con perfiles y fotos.
- **Asignaciones:** Módulo lógico de vinculación Activo <-> Empleado.
- **Marcas:** Catálogo maestro de fabricantes.
- **Configuración:** Gestión de credenciales de API.

---

## 3. Lógica y Flujo de Datos

### 3.1 Sincronización Multi-Tabla
A diferencia de la versión móvil, la versión Desktop gestiona relaciones complejas:
1.  **Tablas Relacionadas:** Conecta `Assets`, `Empleados`, `Asignaciones` y `Marcas`.
2.  **Integridad Referencial:** Al realizar una asignación, el sistema actualiza automáticamente el estado del equipo en la tabla `Assets` a "Asignado" y crea un registro histórico en `Asignaciones`.
3.  **Reversión de Asignación:** Permite "liberar" un equipo, eliminando el vínculo y devolviéndolo al estado "Disponible" o especificando un nuevo estado (ej. "En Reparación").

### 3.2 Procesamiento de Imágenes (Cache Buster V8)
Implementa un conversor robusto para servicios de almacenamiento en la nube:
- **Google Drive:** Convierte URLs de `/file/d/` o `?id=` en enlaces de miniatura directa (`thumbnail?id=`).
- **Dropbox:** Transforma enlaces de visualización en enlaces de descarga directa (`dl.dropboxusercontent.com`).

---

## 4. Manual de Operación (Escritorio)

### 4.1 Navegación y Sidebar
Utilice la barra lateral izquierda para cambiar entre los diferentes módulos. En pantallas pequeñas, el menú es colapsable mediante el icono de hamburguesa (☰).

### 4.2 Gestión de Inventario
1.  **Formulario Superior:** Diseñado para introducir datos rápidos. El ID MAL se genera solo.
2.  **Previsualización:** Al pegar un enlace de foto, el recuadro izquierdo mostrará la imagen instantáneamente si el enlace es válido.
3.  **Tabla de Datos:** Haga clic en las cabeceras (ID, Marca, Compra) para ordenar la lista. Use la barra de búsqueda para filtrar por múltiples criterios.

### 4.3 Gestión de Empleados
- Registre al personal con su cargo, departamento y correo.
- Puede subir una foto del empleado mediante una URL de Drive/Dropbox para facilitar la identificación visual en las asignaciones.

### 4.4 Módulo de Asignaciones (Control de Entrega)
1.  **Selección:** Elija un equipo del desplegable (solo aparecerán los que tengan estado "Disponible").
2.  **Vinculación:** Seleccione al empleado receptor.
3.  **Fecha:** Establezca la fecha de entrega.
4.  **Ejecución:** Al pulsar "Asignar", el equipo desaparece de la lista de disponibles y aparece en el historial de asignaciones activas.

### 4.5 Reversión (Devolución de Equipo)
- En la tabla de Asignaciones, use el icono de **"Deshacer" (Undo)**.
- Se abrirá un panel donde deberá elegir el nuevo estado del equipo (¿Está disponible de nuevo? o ¿Vuelve roto y va a reparación?).

---

## 5. Diseño y Estética
- **Paleta de Colores:** Uso de `Navy Blue` (#001f3f) para estabilidad y `Maldita Green` (#6b8e23) para acciones y éxitos.
- **Componentes:** Botones con efectos de elevación, tablas con cabeceras fijas (Sticky Headers) y modales con desenfoque de fondo.

---
**Documentación técnica para la versión Desktop de MalInventario.**
