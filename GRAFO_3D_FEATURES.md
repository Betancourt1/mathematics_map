# Grafo 3D interactivo de dependencias Lean

## Objetivo

Construir una primera version vistosa y util para explorar dependencias de Lean/mathlib en 3D.
La pantalla principal debe ser el grafo interactivo: cada nodo representa una declaracion o entidad navegable, como teorema, definicion, lema, estructura, clase, instancia o modulo.

La prioridad inicial es lograr una experiencia clara de exploracion y estudio, no cubrir todo mathlib de golpe.

## Nodo

Cada nodo debe tener:

- nombre corto de la declaracion;
- tipo: `theorem`, `lemma`, `def`, `structure`, `class`, `instance`, `module`;
- modulo de origen;
- area matematica, cuando se pueda inferir;
- grado de entrada y salida;
- enlace a la documentacion original de Lean/mathlib.

Los tipos de nodo deben distinguirse visualmente por color y, si ayuda, por forma.

## Arista

Las aristas deben representar relaciones dirigidas:

- `depends on`: una declaracion depende de otra;
- `used by`: una declaracion es usada por otra;
- `imports`: un modulo importa otro;
- `proof path`: relacion resaltada dentro de una ruta de estudio.

La direccion debe verse en la interfaz, por ejemplo con particulas, flechas sutiles o gradientes animados.

## Pantalla principal

La primera vista debe ser un grafo 3D full-screen, con controles encima del espacio visual.

Features necesarias:

- camara 3D con orbit, zoom, pan y reset;
- modo oscuro como default;
- nodos con brillo o material luminoso;
- aristas translucidas para evitar saturacion visual;
- clusters visibles por area matematica;
- etiquetas solo para nodos importantes o cercanos a la camara;
- hover tooltip con nombre, tipo y modulo;
- click en nodo para abrir panel lateral;
- busqueda/autocomplete de declaraciones;
- filtros por tipo de nodo;
- filtros por area matematica;
- boton para centrar la camara en el nodo seleccionado.

## Modos principales

### Overview 3D

Vista general para captar la estructura global.

Debe mostrar:

- clusters por area: Algebra, Analysis, Topology, Logic, Geometry;
- nodos puente entre areas;
- nodos con alta centralidad;
- densidad de relaciones por region;
- minimapa o guia de orientacion.

### Study Path

Modo para estudiar una declaracion objetivo.

Debe mostrar:

- el nodo objetivo al centro;
- prerequisitos hacia atras;
- resultados que usan el nodo hacia adelante;
- ruta resaltada desde fundamentos hasta el objetivo;
- slider de profundidad: `depth 0`, `depth 1`, `depth 2`, etc.;
- breadcrumbs de navegacion;
- boton para reproducir la ruta paso a paso.

### Node Detail

Panel lateral del nodo seleccionado.

Debe incluir:

- nombre completo;
- tipo;
- modulo;
- area;
- numero de dependencias;
- numero de usos;
- snippet Lean breve;
- enlace a docs;
- acciones: centrar, aislar vecindario, expandir vecinos.

## Interacciones necesarias

- Hover para inspeccion rapida.
- Click para seleccion persistente.
- Doble click o boton `focus` para centrar camara.
- Expandir vecinos de un nodo.
- Aislar vecindario local.
- Resaltar ruta de dependencia.
- Lasso o box select para seleccionar grupos.
- Toggle para mostrar u ocultar tipos de nodo.
- Toggle para prerequisitos, dependientes e imports.

## Rendimiento y carga

No conviene renderizar todo mathlib desde el primer frame.

La primera version debe usar:

- carga progresiva;
- limite inicial de nodos visibles;
- niveles de detalle;
- etiquetas bajo demanda;
- grafo local alrededor de una busqueda;
- dataset reducido para demo;
- opcion posterior para cargar mas profundidad.

## Estado compartible

La URL debe poder guardar:

- nodo seleccionado;
- modo activo;
- filtros;
- profundidad;
- posicion basica de camara;
- ruta de estudio activa.

Esto permite compartir una vista especifica del grafo o volver a una declaracion.

## Primer MVP recomendado

Construir solo tres vistas:

1. `Overview 3D`
2. `Study Path`
3. `Node Detail`

El MVP debe priorizar:

- que el grafo se vea atractivo de entrada;
- que buscar una declaracion sea inmediato;
- que seleccionar un nodo explique que necesita y que depende de el;
- que la profundidad del vecindario se pueda controlar;
- que el usuario no se pierda navegando en 3D.

## Decisiones pendientes

- Si los modulos deben ser nodos propios o solo metadatos de las declaraciones.
- Si las areas matematicas se asignan por ruta de modulo, por clustering o manualmente.
- Si la ruta de estudio debe ser shortest path, ruta curada o ranking por centralidad.
- Si el grafo completo se calcula offline y el sitio solo consume archivos estaticos.
- Si conviene usar Three.js directamente o una libreria especializada para grafos 3D.
