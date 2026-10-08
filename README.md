# Mapa de juegos
 
Un recomendador de videojuegos construido con Principal Component Analysis (PCA). Calificas algunos juegos que conozcas y la app te sugiere los que quedan más cerca de tus gustos, dentro de un mapa de 1,433 juegos.
 
## La idea
 
Los juegos que le gustan a las mismas personas suelen parecerse entre sí. Si mucha gente que jugó Halo también jugó Gears of War, esos dos juegos tienen algo en común aunque nadie lo haya dicho explícitamente. La app aprovecha ese patrón para acomodar los juegos en un mapa: los que comparten público quedan cerca.
 
## Cómo genera las recomendaciones
 
1. **Una tabla de personas contra juegos.** Se usaron 144,652 calificaciones que 17,035 personas dejaron en Amazon entre 1999 y 2023. La tabla tiene más de 24 millones de casillas, pero solo el 0.59% tiene una calificación.
2. **PCA resume la tabla.** La tabla se reduce a 50 componentes. Cada uno representa un contraste entre grupos de juegos con públicos distintos, por ejemplo shooters de PS3 y Xbox 360 contra juegos de Nintendo Switch, o juegos familiares contra RPG japoneses. Cada juego obtiene una posición en ese espacio.
3. **Tus calificaciones te ubican.** Tu posición se calcula a partir de los juegos que calificaste: los de 5 estrellas te acercan mucho, los de 3 un poco y los de 1 te alejan.
4. **Se recomienda lo más cercano.** Los juegos que no has calificado y que quedan más alineados con tu posición son tus recomendaciones, cada una con el juego que más influyó en ella.

## Qué tan bien funciona
 
Se probó con 3,377 personas que el modelo no vio durante su construcción. A cada una se le escondió un juego que le gustó y se revisó si aparecía entre sus 10 primeras recomendaciones:
 
| Método | Acierto en el top 10 |
|---|---|
| Este modelo (PCA) | 19.1% |
| Recomendar los juegos más populares | 8.1% |
| Al azar | 0.7% |
 
El modelo acierta más del doble que recomendar simplemente lo más popular.
 
## Secciones de la app
 
- **Inicio:** el mapa completo de juegos, coloreado por plataforma, y un video con la explicación.
- **Califica:** buscador y catálogo para calificar de 1 a 5 estrellas.
- **Para ti:** tus recomendaciones y tu lugar en el mapa.
- **Cómo funciona:** los pasos del modelo, con un explorador para ver los juegos según distintos componentes.

## Créditos
 
Datos de [Amazon Reviews'23](https://amazon-reviews-2023.github.io/) (McAuley Lab, UC San Diego).
Actividad para la materia Inteligencia Artificial 1, UDEM.