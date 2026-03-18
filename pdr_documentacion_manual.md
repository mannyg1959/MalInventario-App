# Documento de Descripción del Proyecto (PDR) y Manual de Operación

## 1. Información General
**Nombre del Proyecto:** MalInventario - Mobile Edition  
**Propósito:** Proveer una herramienta ágil y móvil para la toma de inventario físico, registro de activos tecnológicos y gestión de asignaciones en tiempo real para la Fundación Maldita.es.  
**Plataforma:** Web App Progresiva (PWA) optimizada para dispositivos móviles (iOS/Android).

---

## 2. Arquitectura de la Aplicación

### 2.1 Stack Tecnológico
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Iconografía y Tipografía:** FontAwesome 6, Google Fonts (Inter).
- **Base de Datos:** Airtable API (Base de datos relacional en la nube).
- **Despliegue sugerido:** Vercel / GitHub Pages.

### 2.2 Estructura de Archivos
- `index.html`: Estructura semántica de la interfaz de usuario móvil.
- `mobile-style.css`: Sistema de diseño moderno, responsive y con soporte para "glassmorphism" y modo oscuro.
- `mobile-script.js`: Lógica de negocio, controladores de eventos e integración con la API de Airtable.
- `vercel.json`: Configuración para redireccionamiento y despliegue.

---

## 3. Lógica y Flujo de Datos

### 3.1 Integración con Airtable
La aplicación se conecta directamente a Airtable mediante un **Personal Access Token (PAT)**. El flujo es el siguiente:
1.  **Sincronización:** Al iniciar, la app descarga metadatos (Categorías, Marcas, Estados y Empleados) para poblar los selectores.
2.  **Gestión de Activos:** Los registros se leen de la tabla `Assets`.
3.  **Relaciones de Asignación:** La app maneja una lógica bidireccional. Al asignar un equipo a un empleado en la interfaz, se crea o actualiza un registro en la tabla `Asignaciones`, vinculando el activo con el ID del empleado.

### 3.2 Gestión de Imágenes
La aplicación soporta tres métodos de manejo visual:
- **Captura Directa:** Toma de fotos con la cámara del dispositivo móvil y subida directa al almacenamiento de Airtable.
- **Enlaces Externos:** Soporte para enlaces de Google Drive y Dropbox con formateo automático de miniaturas.
- **Previsualización:** Galería instantánea al tocar la imagen en la tarjeta del equipo.

### 3.3 Estado de la Aplicación (State Management)
Se utiliza un objeto `state` global en memoria para mantener la consistencia sin recargas de página:
```javascript
const state = {
    config: { baseId, apiKey }, // Credenciales locales
    equipments: [],            // Listado de activos
    brands: [],                // Catálogo de marcas
    employees: [],             // Catálogo de personal
    currentEditId: null        // Identificador de edición activa
};
```

---

## 4. Manual de Operación

### 4.1 Configuración Inicial
Al abrir la aplicación por primera vez (o tras borrar caché):
1.  Se mostrará un panel de **Configuración de Airtable**.
2.  Ingrese el **Base ID** (disponible en la URL de su base de Airtable).
3.  Ingrese su **Personal Access Token** (PAT).
4.  Presione "Guardar y Conectar". La app se reiniciará con los datos de su base.

### 4.2 Registro de un Nuevo Activo
1.  Pulse en **"Registrar Nuevo Item"** (Cabecera azul).
2.  El campo **ID MAL** se genera automáticamente (ej: MAL085).
3.  **Foto:** Toque el recuadro de la cámara para tomar una foto o suba una desde la galería. Alternativamente, pegue un enlace de Drive.
4.  Complete la **Marca, Categoría y Estado**.
5.  **Asignación:** Si el equipo ya tiene dueño, selecciónelo en "Asignado a". El estado cambiará automáticamente a "Asignado".
6.  Pulse **"GUARDAR REGISTRO"**.

### 4.3 Búsqueda y Filtrado
- **Barra de Búsqueda:** Escriba cualquier término (ID, marca, serie) para filtrar la lista instantáneamente.
- **Filtro por Categoría:** Use el selector desplegable para ver solo laptops, móviles, etc.
- **Actualización:** Use el icono de sincronización (esquina superior derecha) para forzar una descarga de datos nuevos.

### 4.4 Edición y Eliminación
- **Editar:** Toque el icono del lápiz en cualquier tarjeta. El formulario superior se abrirá con los datos cargados.
- **Eliminar:** Toque el icono de la papelera. Se solicitará confirmación antes de borrar el registro en Airtable.

---

## 5. Diseño y Estética (UI/UX)
- **Modo Oscuro Premium:** Uso de fondos `#001f3f` (Navy) y relieves sutiles.
- **Feedback Visual:** Uso de "Toasts" (notificaciones emergentes) para confirmar acciones exitosas o errores.
- **Responsividad:** Diseñado específicamente para ser manejado con el pulgar, con botones grandes y navegación inferior persistente.

---
**Documentación generada por Antigravity AI para MalInventario.**
