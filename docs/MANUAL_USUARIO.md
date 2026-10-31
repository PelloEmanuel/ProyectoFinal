# Manual de Usuario — Campus

Bienvenido al Manual de Usuario de **Campus**, la plataforma móvil de gestión de cursos, desarrollo de habilidades y seguimiento académico.

---

## 1. Acceso a la Plataforma

### 1.1. Pantalla de Bienvenida
Al abrir la aplicación verás la identidad institucional de **Campus**, los pilares de la plataforma y dos botones principales:
- **Iniciar sesión**: Para cuentas existentes de Estudiantes, Instructores o Administradores.
- **Crear cuenta gratis**: Para nuevos estudiantes que deseen registrarse.

### 1.2. Registro de Nuevos Estudiantes
1. Tocá **Crear cuenta gratis**.
2. Completá tu **Nombre**, **Apellido**, **Nombre de usuario** (opcional), **Correo electrónico** y una **Contraseña segura** (mínimo 8 caracteres, incluyendo mayúscula, minúscula, número y símbolo).
3. Aceptá los términos académicos y presioná **Crear mi cuenta en Campus**.
4. Tu cuenta se creará automáticamente con el rol **Estudiante** e iniciarás sesión de forma inmediata.

### 1.3. Inicio de Sesión y Cuentas de Demostración
En la pantalla **Iniciar sesión** podés ingresar con tu correo y contraseña, mediante **Google / GitHub / Facebook**, o utilizar los **botones de acceso rápido (1 toque)** para probar los 3 roles del sistema:
- **Estudiante**: `estudiante@gmail.com` / `estudiante123`
- **Instructor**: `docente@gmail.com` / `docente123`
- **Preceptor**: `preceptor@gmail.com` / `preceptor123`
- **Admin**: `admin@gmail.com` / `admin123`

### 1.4. Verificación en Dos Pasos (2FA TOTP) y Recuperación de Contraseña
- Si olvidaste tu clave, tocá **¿Olvidaste tu contraseña?**, ingresá tu correo y recibirás un código de 6 dígitos para definir una nueva clave.
- Si activaste el **Segundo Factor TOTP (2FA)** desde tu perfil, luego de ingresar tu contraseña la aplicación te solicitará el código de 6 dígitos de tu app autenticadora (*Google Authenticator* / *Authy*) o uno de tus códigos de recuperación de un solo uso.

---

## 2. Guía para el Rol Estudiante (`student`)

La barra inferior del Estudiante cuenta con **5 pestañas**:

1. **Inicio**:
   - Saludo personalizado con la fecha actual en formato `dd/mm/aaaa` y acceso a la campana de **Notificaciones**.
   - Tarjetas de resumen: *Cursos en progreso*, *Cursos completados*, *Actividades pendientes* y *Próxima entrega*.
   - Sección **Continuar aprendiendo** con barra de avance porcentual y acceso directo al curso.
   - **Próximas actividades** y **Cursos recomendados**.
2. **Explorar (Catálogo)**:
   - Buscador por título, descripción o habilidad.
   - Filtros combinables por **Categoría**, **Nivel** (*Inicial*, *Intermedio*, *Avanzado*) y ordenamiento (*Más recientes*, *Más populares*, *Menor duración*).
   - Al tocar un curso accedés al **Detalle del Curso**, donde podés ver el programa completo de módulos y lecciones, habilidades que desarrolla, requisitos previos, guardar en **Favoritos** (icono corazón) o tocar **Inscribirme gratis en este curso**.
3. **Mi aprendizaje**:
   - Organiza tus cursos en 4 pestañas: **En progreso**, **No comenzados**, **Completados** y **Favoritos**.
   - Al entrar a un curso inscripto y seleccionar una lección, se abre el **Visor de Lección**, donde podés leer el material, abrir recursos complementarios, navegar entre la lección anterior/siguiente y presionar **Marcar lección como completada**.
4. **Actividades**:
   - Lista todas las evaluaciones de tus cursos con filtros: *Todas*, *Pendientes*, *Enviadas*, *Corregidas*, *Vencidas* y *Próximas*.
   - Al abrir una actividad podés resolver cuestionarios de **Opción Múltiple**, **Verdadero/Falso** o **Respuesta Breve** (que se corrigen automáticamente en el servidor mostrando tu nota al instante) o enviar **Entregas de Desarrollo / Archivos** para corrección docente.
   - Cuando el instructor corrige tu entrega, verás tu puntaje, estado (*Aprobada* / *Desaprobada*) y la **devolución escrita del docente**.
5. **Perfil y Herramientas Académicas**:
   - Acceso rápido a **Certificados** (con botón para compartir y **Verificador Público de Certificados** por código único, por ejemplo `SKT-2026-UXUI-0004`), **Estadísticas personales** y **Calendario académico**.
   - Edición de datos personales, interruptor de **Modo Oscuro / Claro**, activación de **2FA TOTP**, cambio de contraseña, cierre remoto de sesiones activas y cierre de sesión.

---

## 3. Guía para el Rol Instructor (`instructor`)

La barra inferior del Instructor cuenta con **5 pestañas**:

1. **Panel Docente**:
   - Resumen de *Cursos propios*, *Estudiantes inscriptos*, *Entregas por corregir* y *Promedio general de calificaciones*.
   - Lista de entregas pendientes con acceso directo para calificar y lista de cursos recientes.
2. **Mis cursos**:
   - Permite **Crear nuevo curso** o seleccionar un curso existente para abrir su **Espacio de Trabajo Académico**:
     - **Pestaña Módulos**: Crear o eliminar módulos, y dentro de cada módulo agregar o eliminar lecciones (*Lectura*, *Video + Notas*, *Laboratorio*).
     - **Pestaña Evaluaciones**: Crear cuestionarios autoevaluables o entregas prácticas configurando puntaje mínimo de aprobación e intentos máximos.
     - **Pestaña Anuncios**: Publicar avisos a la cursada que notifican automáticamente a todos los estudiantes inscritos.
     - Botones para **Editar datos**, **Publicar** (requiere al menos 1 módulo y 1 lección) o **Archivar**.
3. **Estudiantes**:
   - Buscador por nombre o correo y filtro por curso dictado.
   - Muestra el porcentaje de avance de cada alumno y su estado académico.
4. **Entregas**:
   - Bandeja de corrección filtrable por *Pendientes de corrección*, *Calificadas* y *Todas*.
   - Al tocar **Calificar entrega**, el docente visualiza la respuesta del alumno, asigna la nota numérica (0 a 100), redacta la devolución pedagógica y guarda la evaluación (notificando automáticamente al estudiante).
5. **Perfil**: Configuración de datos docentes, tema visual y seguridad 2FA.

---

## 4. Guía para el Rol Administrador (`admin`)

La barra inferior del Administrador cuenta con **5 pestañas**:

1. **Panel Institucional**:
   - Indicadores globales en tiempo real (*Usuarios totales*, *Cursos*, *Inscripciones*, *Certificados emitidos*).
   - Gráfico de distribución por rol (*Estudiantes*, *Instructores*, *Administradores*), ranking de cursos con mayor matrícula y últimos eventos de la bitácora de auditoría.
2. **Usuarios**:
   - Búsqueda por nombre, apellido o email, y filtros por rol y estado (*Activos* / *Suspendidos*).
   - Botón **+ Nuevo usuario** para dar de alta cuentas con cualquier rol institucional.
   - En cada tarjeta de usuario permite **Cambiar rol** con un toque (`student`, `instructor`, `admin`), **Suspender / Reactivar** la cuenta o **Eliminarla** con confirmación.
3. **Cursos (Oferta Académica y Taxonomía)**:
   - Tres sub-pestañas para administrar todos los **Cursos** de la institución (publicar, archivar, eliminar), crear/eliminar **Categorías** y crear/eliminar **Habilidades**.
4. **Reportes y Auditoría**:
   - Consultas SQL verificables en vivo divididas en 4 vistas: *Rendimiento por curso*, *Matrícula e inscripciones*, *Estado de cuentas* y *Bitácora de auditoría (`audit_logs`)*.
5. **Configuración**:
   - Permite editar y guardar en MySQL los parámetros globales de la institución (nombre institucional, email de soporte, puntaje mínimo por defecto, cargo firmante en certificados, habilitación de registro público) y acceder al Perfil y Seguridad del administrador.
