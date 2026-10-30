import { useWindowDimensions } from 'react-native';

/** Datos de layout según tamaño y orientación del dispositivo. */
export default function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 768;
  return {
    width,
    height,
    isLandscape,
    isTablet,
    columns: isTablet ? 3 : 1,
    contentWidth: '100%',
  };
}
