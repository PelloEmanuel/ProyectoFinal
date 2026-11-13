import { useWindowDimensions } from 'react-native';

// Calcula las dimensiones y banderas de diseño adaptable según el tamaño y orientación de la pantalla.
export default function usarResponsivo() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 768;

  // Devuelve el ancho, alto, orientación y cantidad de columnas recomendadas.
  return {
    width,
    height,
    isLandscape,
    isTablet,
    columns: isTablet ? 3 : 1,
    contentWidth: '100%' as const,
  };
}
