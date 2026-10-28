import { useWindowDimensions } from 'react-native';

/** Datos de layout según tamaño y orientación del dispositivo. */
export default function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 768;
  return {
    width, height, isLandscape, isTablet,
    columns: isTablet ? 2 : 1,
    contentWidth: Math.min(width, isTablet ? 900 : 640),
  };
}
